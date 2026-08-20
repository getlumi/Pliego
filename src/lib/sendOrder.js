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
import { fitImageInFrame } from './imageFraming'

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
// merge todavía (síncrono). Con un solo archivo, se usa su nombre real
// (para que el usuario reconozca qué mandó) — "documento.pdf" genérico
// solo aplica cuando se combinan varios archivos en un PDF nuevo, ya
// que ahí no existe un nombre "correcto" único que elegir.
function resolveFileName(files) {
  const printable = files.filter(f => !isDocx(f.file))
  if (printable.length === 0) return files[0].file.name // solo Word
  if (files.length === 1) return files[0].file.name // un solo archivo — nombre real
  return 'documento.pdf' // varios archivos combinados en un PDF nuevo
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
      // Cada tamaño (cuarto/media/completa) es una página físicamente
      // distinta, no una imagen chica en una hoja Carta fija — mismo
      // cálculo exacto que ve el usuario en la vista previa.
      const { x, y, w, h, pageW, pageH } = fitImageInFrame(img.width, img.height, f.imageFrame ?? 'completa', f.imageAlign ?? 'centro')
      const page = merged.addPage([pageW, pageH])
      page.drawImage(img, { x, y, width: w, height: h })
    }
  }

  const pdfBytes = await merged.save()
  return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), contentType: 'application/pdf' }
}

// result: { success: true, orderId } | { success: false, error: string }
export async function sendOrder({ session, draft, selectedService, totalPages, total, storeItems = [], storeTotal = 0 }) {
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
      estimated_cost: total, // SOLO impresión — la garantía nunca cuenta productos
      store_items: storeItems.length > 0 ? storeItems : null,
      store_total: storeTotal,
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
    //    Créditos: cabe si hay saldo suficiente apartado (place_guarantee_hold).
    //    Suscriptores: cabe si el pedido cuesta $50 o menos (tope fijo, sin
    //    créditos de por medio) — place_guarantee_hold_subscription. Si no
    //    pasan a tiempo, en vez de descontarse dinero se suspende la cuenta
    //    (ver supabase_migration_suspension.sql).
    let guaranteeCovered = false
    if (isSubscriber) {
      const { data: guaranteeResult, error: guaranteeError } = await supabase.rpc('place_guarantee_hold_subscription', {
        p_order_id: orderId,
        p_printshop_id: draft.shopId,
        p_estimated_cost: total,
      })
      if (guaranteeError) {
        await supabase.storage.from('documents').remove([path])
        await supabase.from('orders').delete().eq('id', orderId)
        return { success: false, error: 'No se pudo procesar tu pedido. Intenta de nuevo.' }
      }
      guaranteeCovered = guaranteeResult?.covered ?? false
    } else {
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
    }

    // 7) Notificar al dueño de la papelería (SMS/WhatsApp según el canal activo)
    try {
      const { data: shopRow } = await supabase
        .from('printshops').select('owner_id, name').eq('id', draft.shopId).maybeSingle()
      if (shopRow?.owner_id) {
        const serviceLabel = selectedService?.label || selectedService?.service_type || 'B/N Bond'
        const storeSummary = storeItems.length > 0
          ? storeItems.map(it => `${it.quantity}x ${it.name}`).join(', ')
          : ''
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
              productos:      storeSummary,
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


