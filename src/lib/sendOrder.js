// Pliego · lógica de "Enviar pedido"
// 1) Combina imágenes + PDFs en un solo PDF (universal, abre en cualquier lado).
//    Si lo único que hay es un Word, se sube tal cual.
// 2) Sube el archivo a Storage.
// 3) Crea la fila en `orders`.
// 4) Cobra la cuota de servicio ($2) del wallet.

import { supabase } from './supabase'

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

  const { PDFDocument } = await import('pdf-lib')
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
  try {
    // 1) Verificar saldo para la cuota de servicio ($2)
    const { data: userRow, error: userError } = await supabase
      .from('users').select('wallet_balance, name').eq('id', session.user.id).maybeSingle()
    if (userError || !userRow) return { success: false, error: 'No se pudo verificar tu saldo. Intenta de nuevo.' }

    const SERVICE_FEE = 2.00
    if (userRow.wallet_balance < SERVICE_FEE) {
      return { success: false, error: 'INSUFFICIENT_BALANCE' }
    }

    // 2) Combinar archivos y subir
    const { blob, name, contentType } = await buildUploadFile(draft.files)
    const orderId = crypto.randomUUID()
    const path = `${session.user.id}/${orderId}/${name}`

    const { error: uploadError } = await supabase.storage.from('documents').upload(path, blob, {
      contentType, upsert: false,
    })
    if (uploadError) return { success: false, error: 'No se pudo subir tu documento. Intenta de nuevo.' }

    // 3) Crear el pedido
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
      service_fee: SERVICE_FEE,
      estimated_cost: total,
      user_name: userRow.name ?? null,
    })
    if (orderError) {
      await supabase.storage.from('documents').remove([path])
      return { success: false, error: 'No se pudo crear el pedido. Intenta de nuevo.' }
    }

    // 4) Cobrar la cuota de servicio
    await supabase.from('users').update({ wallet_balance: userRow.wallet_balance - SERVICE_FEE }).eq('id', session.user.id)
    await supabase.from('wallet_transactions').insert({
      user_id: session.user.id,
      type: 'servicio',
      amount: -SERVICE_FEE,
      payment_method: 'sistema',
      order_id: orderId,
    })

    // 5) Notificar al dueño de la papelería via WhatsApp
    try {
      const { data: shopRow } = await supabase
        .from('printshops').select('owner_id, name').eq('id', draft.shopId).maybeSingle()
      if (shopRow?.owner_id) {
        // Obtener nombre del servicio legible
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
    } catch (_) { /* WhatsApp no crítico, no bloquea el pedido */ }

    return { success: true, orderId }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}

