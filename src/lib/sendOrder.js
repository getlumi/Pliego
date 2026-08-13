// Pliego · lógica de "Enviar pedido"
// ORDEN CORREGIDO (bug crítico encontrado en revisión): wallet_transactions
// tiene una llave foránea real hacia orders(id) — por eso el pedido debe
// existir en la base ANTES de cobrar el crédito, o el cobro siempre falla
// por violar esa restricción. El nombre/ruta del archivo final se puede
// calcular de forma síncrona (sin subir nada todavía), así que:
// 1) Se calcula el nombre/ruta final del archivo (sin tocar Storage aún).
// 2) Se crea la fila en `orders` con esa ruta ya definida.
// 3) Se cobra 1 crédito de forma ATÓMICA (ahora sí referencia un pedido
//    real). Si no hay saldo, se borra el pedido placeholder y no se sube
//    nada.
// 4) Se arma el PDF/archivo de verdad y se sube a Storage.
// 5) Se decide si queda cubierto por la garantía anti-no-show.
// Si el paso 4 o 5 falla DESPUÉS de cobrar, se reembolsa automáticamente
// (refund_credit) para no dejar a nadie pagando por un pedido que no
// terminó de crearse.

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

// Nombre final del archivo — determinable sin tocar Storage ni hacer
// merge todavía (síncrono).
function resolveFileName(files) {
  const printable = files.filter(f => !isDocx(f.file))
  if (printable.length === 0) return files[0].file.name // solo Word
  return 'documento.pdf'
}

// Combina los archivos en un único PDF. Si todos son Word, sube el primero tal cual.
async function buildUploadFile(files) {
  const printable = files.filter(f => !isDocx(f.file))

  if (printable.length === 0) {
    const f = files[0].file
    return { blob: f, contentType: f.type || 'application/octet-stream' }
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
  return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), contentType: 'application/pdf' }
}

// result: { success: true, orderId } | { success: false, error: string }
export async function sendOrder({ session, draft, selectedService, totalPages, total }) {
  const orderId = crypto.randomUUID()
  let orderCreated = false
  let credited = false
  let path = null

  try {
    // 1) Obtener nombre y estado de suscripción (para el pedido y el cobro)
    const { data: userRow, error: userError } = await supabase
      .from('users').select('name, subscription_status').eq('id', session.user.id).maybeSingle()
    if (userError || !userRow) return { success: false, error: 'No se pudo verificar tu cuenta. Intenta de nuevo.' }
    const isSubscriber = userRow.subscription_status === 'active'

    const SERVICE_FEE_MXN_EQUIV = 5.50

    // 2) Calcular nombre/ruta final del archivo (sin tocar Storage todavía)
    const name = resolveFileName(draft.files)
    path = `${session.user.id}/${orderId}/${name}`

    // 3) Crear el pedido PRIMERO — necesario para que el cobro (paso 4)
    //    pueda referenciar un order_id que ya existe de verdad.
    const { color_mode, paper_size } = deriveLegacyFields(selectedService?.service_type)
    const expiresAt = draft.containsId
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : undefined // sin especificar → la base de datos aplica su default de 3 días
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
      service_fee: isSubscriber ? 0 : SERVICE_FEE_MXN_EQUIV,
      estimated_cost: total,
      user_name: userRow.name ?? null,
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    })
    if (orderError) {
      return { success: false, error: 'No se pudo crear el pedido. Intenta de nuevo.' }
    }
    orderCreated = true

    // 4) Cobrar 1 crédito de forma ATÓMICA — SALVO que tenga mensualidad
    //    ilimitada activa, en cuyo caso no se descuenta nada (ya pagó por
    //    adelantado). Si no alcanza, se borra el pedido placeholder — nunca
    //    se llegó a subir ningún archivo.
    if (!isSubscriber) {
      const { data: chargeOk, error: chargeError } = await supabase.rpc('deduct_credit', {
        p_order_id: orderId,
        p_amount_mxn: SERVICE_FEE_MXN_EQUIV,
      })
      if (chargeError) {
        await supabase.from('orders').delete().eq('id', orderId)
        return { success: false, error: 'No se pudo verificar tu saldo. Intenta de nuevo.' }
      }
      if (!chargeOk) {
        await supabase.from('orders').delete().eq('id', orderId)
        return { success: false, error: 'INSUFFICIENT_BALANCE' }
      }
      credited = true
    }

    // 5) Armar el archivo de verdad y subirlo a Storage
    const { blob, contentType } = await buildUploadFile(draft.files)
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, blob, {
      contentType, upsert: false,
    })
    if (uploadError) {
      const { data: refunded } = await supabase.rpc('refund_credit', { p_order_id: orderId })
      await supabase.from('orders').delete().eq('id', orderId)
      return {
        success: false,
        error: refunded
          ? 'No se pudo subir tu documento. Se te devolvió el crédito, intenta de nuevo.'
          : 'No se pudo subir tu documento. Contacta a soporte si tu saldo no se ajusta solo.',
      }
    }

    // 6) Decidir si el pedido queda cubierto por la garantía anti-no-show.
    //    Para suscriptores de mensualidad: TODO — el tope fijo de $50 y la
    //    suspensión/reactivación se construyen en la Parte 2. Por ahora,
    //    de forma segura y conservadora, sus pedidos NO quedan cubiertos
    //    (la papelería ve la alerta normal de "no imprimir hasta que
    //    llegue") en vez de aplicar una regla a medias o incorrecta.
    let guaranteeCovered = false
    if (!isSubscriber) {
      const { data: guaranteeResult, error: guaranteeError } = await supabase.rpc('place_guarantee_hold', {
        p_order_id: orderId,
        p_printshop_id: draft.shopId,
        p_estimated_cost: total,
      })
      if (guaranteeError) {
        const { data: refunded } = await supabase.rpc('refund_credit', { p_order_id: orderId })
        await supabase.storage.from('documents').remove([path])
        await supabase.from('orders').delete().eq('id', orderId)
        return {
          success: false,
          error: refunded
            ? 'No se pudo procesar tu pedido. Se te devolvió el crédito, intenta de nuevo.'
            : 'No se pudo procesar tu pedido. Contacta a soporte si tu saldo no se ajusta solo.',
        }
      }
      guaranteeCovered = guaranteeResult?.covered ?? false
    } else {
      await supabase.from('orders').update({ guarantee_covered: false }).eq('id', orderId)
    }

    // 7) Notificar al dueño de la papelería (SMS/WhatsApp según el canal activo)
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
              garantia:       guaranteeCovered ? 'si' : 'no',
            }
          }
        })
      }
    } catch (_) { /* Notificación no crítica, no bloquea el pedido */ }

    return { success: true, orderId, guaranteeCovered }
  } catch (e) {
    // Limpieza según qué tan lejos se llegó antes de que algo tronara
    if (credited) {
      try { await supabase.rpc('refund_credit', { p_order_id: orderId }) } catch (_) {}
    }
    if (path) {
      try { await supabase.storage.from('documents').remove([path]) } catch (_) {}
    }
    if (orderCreated) {
      try { await supabase.from('orders').delete().eq('id', orderId) } catch (_) {}
    }
    return { success: false, error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}


