// Pliego · lógica de "Enviar pedido"
// 1) Cobra 1 crédito de forma ATÓMICA (función SQL deduct_credit) antes de
//    hacer cualquier trabajo — evita condiciones de carrera y descuentos
//    silenciosos que fallan sin avisar.
// 2) Combina imágenes + PDFs en un solo PDF (universal, abre en cualquier
//    lado). Si lo único que hay es un Word, se sube tal cual.
// 3) Sube el archivo a Storage.
// 4) Crea la fila en `orders`.
// Si el paso 2 o 3 falla DESPUÉS de cobrar, se reembolsa el crédito
// automáticamente (refund_credit) para no dejar a nadie pagando por un
// pedido que nunca se creó.

import { supabase } from './supabase'
import { PDFDocument } from 'pdf-lib'

// Deriva color_mode / paper_size (columnas legadas del esquema) a partir
// del service_type elegido, para tipos predefinidos y personalizados.
function deriveLegacyFields(serviceType) {
  const t = serviceType ?? 'bn_bond'
  const color_mode = t.includes('color') ? 'color' : 'bn'
  const paper_size = t === 'doble_carta' ? 'doble_carta' : 'carta'
  return { color_mode, paper_size }
}

function isDocx(file) {
  return /\.docx?$/i.test(file.name)
}

// Combina los archivos en un único PDF. Si todos son Word, sube el primero tal cual.
async function buildUploadFile(files) {
  const printable = files.filter(f => !isDocx(f.file))

  if (printable.length === 0) {
    // Solo Word: se sube tal cual (requiere Office en la papelería)
    const f = files[0].file
    return { blob: f, name: f.name, contentType: f.type || 'application/octet-stream' }
  }

  const merged = await PDFDocument.create()

  for (const f of printable) {
    const file = f.file
    if (file.type === 'application/pdf') {
      const bytes = await file.arrayBuffer()
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = await merged.copyPages(src, src.getPageIndices())
      pages.forEach(p => merged.addPage(p))
    } else if (file.type.startsWith('image/')) {
      const bytes = await file.arrayBuffer()
      const img = file.type === 'image/png'
        ? await merged.embedPng(bytes)
        : await merged.embedJpg(bytes)
      const page = merged.addPage([img.width, img.height])
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
    }
  }

  const pdfBytes = await merged.save()
  return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), name: 'documento.pdf', contentType: 'application/pdf' }
}

// result: { success: true, orderId } | { success: false, error: string }
export async function sendOrder({ session, draft, selectedService, totalPages, total }) {
  const orderId = crypto.randomUUID()
  let credited = false

  try {
    // 1) Obtener nombre (para el pedido y la notificación)
    const { data: userRow, error: userError } = await supabase
      .from('users').select('name').eq('id', session.user.id).maybeSingle()
    if (userError || !userRow) return { success: false, error: 'No se pudo verificar tu cuenta. Intenta de nuevo.' }

    const SERVICE_FEE_MXN_EQUIV = 5.50

    // 2) Cobrar 1 crédito de forma ATÓMICA antes de hacer cualquier trabajo.
    //    Si no hay saldo, ni siquiera se sube el archivo.
    const { data: chargeOk, error: chargeError } = await supabase.rpc('deduct_credit', {
      p_order_id: orderId,
      p_amount_mxn: SERVICE_FEE_MXN_EQUIV,
    })
    if (chargeError) return { success: false, error: 'No se pudo verificar tu saldo. Intenta de nuevo.' }
    if (!chargeOk) return { success: false, error: 'INSUFFICIENT_BALANCE' }
    credited = true

    // 3) Combinar archivos y subir
    const { blob, name, contentType } = await buildUploadFile(draft.files)
    const path = `${session.user.id}/${orderId}/${name}`

    const { error: uploadError } = await supabase.storage.from('documents').upload(path, blob, {
      contentType, upsert: false,
    })
    if (uploadError) {
      const { data: refunded } = await supabase.rpc('refund_credit', { p_order_id: orderId })
      return {
        success: false,
        error: refunded
          ? 'No se pudo subir tu documento. Se te devolvió el crédito, intenta de nuevo.'
          : 'No se pudo subir tu documento. Contacta a soporte si tu saldo no se ajusta solo.',
      }
    }

    // 4) Crear el pedido
    const { color_mode, paper_size } = deriveLegacyFields(selectedService?.service_type)
    const { error: orderError } = await supabase.from('orders').insert({
      id: orderId,
      user_id: session.user.id,
      printshop_id: draft.shopId,
      file_url: path,
      file_name: name,
      file_count: totalPages,
      copies: draft.copies,
      orientation: draft.orientation,
      paper_size,
      color_mode,
      service_type: selectedService?.service_type ?? 'bn_bond',
      special_instructions: draft.instructions || null,
      service_fee: SERVICE_FEE_MXN_EQUIV,
      estimated_cost: total,
      user_name: userRow.name ?? null,
    })
    if (orderError) {
      await supabase.storage.from('documents').remove([path])
      const { data: refunded } = await supabase.rpc('refund_credit', { p_order_id: orderId })
      return {
        success: false,
        error: refunded
          ? 'No se pudo crear el pedido. Se te devolvió el crédito, intenta de nuevo.'
          : 'No se pudo crear el pedido. Contacta a soporte si tu saldo no se ajusta solo.',
      }
    }

    // 5) Notificar al dueño de la papelería (SMS/WhatsApp según el canal activo)
    try {
      const { data: shopRow } = await supabase
        .from('printshops').select('owner_id, name').eq('id', draft.shopId).maybeSingle()
      if (shopRow?.owner_id) {
        const serviceLabel = selectedService?.label || selectedService?.service_type || 'B/N Bond'
        await supabase.functions.invoke('send-whatsapp', {
          body: {
            user_id: shopRow.owner_id,
            tipo:    'nuevo_pedido',
            data: {
              cliente:        userRow.name ?? 'Cliente',
              archivo:        draft.files?.[0]?.file?.name ?? 'documento.pdf',
              paginas:        String(totalPages),
              tipo_impresion: serviceLabel,
              copias:         String(draft.copies ?? 1),
              instrucciones:  draft.instructions || '',
            }
          }
        })
      }
    } catch (_) { /* Notificación no crítica, no bloquea el pedido */ }

    return { success: true, orderId }
  } catch (e) {
    // Si ya se cobró el crédito antes de que algo tronara, devuélvelo
    if (credited) {
      try { await supabase.rpc('refund_credit', { p_order_id: orderId }) } catch (_) {}
    }
    return { success: false, error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}

