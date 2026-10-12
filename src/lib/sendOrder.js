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
import { fitImageInFrame, packImagesIntoPages, slotRect, fitImageInRect, pageSize } from './imageFraming'

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

// Normaliza la orientación de una foto ANTES de meterla al PDF, y
// aplica también la rotación adicional que el usuario haya elegido con
// el botón "Girar" (0/90/180/270) — un solo lugar con la matemática
// real, igual que fitImageInFrame en imageFraming.js, para que la
// vista previa (rotación con CSS, solo visual) y el PDF final
// (rotación real de píxeles, aquí) representen siempre lo mismo.
//
// Causa real del bug original: pdf-lib (embedJpg/embedPng) usa los
// bytes CRUDOS del archivo, sin leer la etiqueta EXIF de orientación —
// muchas fotos de celular guardan el sensor en horizontal + una
// bandera EXIF que le dice a cualquier visor "gírala". El navegador
// respeta esa bandera al mostrar la vista previa (por eso ahí se veía
// bien), pero pdf-lib no, así que el PDF final salía rotado aunque la
// preview fuera correcta.
//
// Fix: dejamos que el propio <img> del navegador decodifique la imagen
// (los navegadores modernos ya aplican la rotación EXIF por default al
// pintarla, Safari incluido desde 2020) y la volvemos a dibujar en un
// <canvas> — los bytes que salen de ahí ya están "derechos" de verdad,
// sin depender de que pdf-lib entienda EXIF, porque nunca lo vuelve a
// tocar. Esto es más confiable que parsear el EXIF a mano (formato
// distinto según fabricante de cámara, fácil de romper). La rotación
// elegida por el usuario se aplica en el mismo paso de canvas, girando
// el lienzo y —si es 90°/270°— intercambiando ancho/alto de salida.
async function normalizeImageOrientation(file, extraRotationDeg = 0) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload  = () => resolve(el)
      el.onerror = () => reject(new Error('No se pudo leer la imagen'))
      el.src = url
    })

    const rot = ((extraRotationDeg % 360) + 360) % 360
    const swapped = rot === 90 || rot === 270
    const outW = swapped ? img.naturalHeight : img.naturalWidth
    const outH = swapped ? img.naturalWidth  : img.naturalHeight

    const canvas = document.createElement('canvas')
    canvas.width  = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    ctx.translate(outW / 2, outH / 2)
    ctx.rotate((rot * Math.PI) / 180)
    // La imagen se dibuja centrada con SUS dimensiones originales — el
    // translate+rotate ya la deja en el lugar correcto del lienzo
    // (swapeado si hacía falta), sin deformarla.
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)

    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, 0.92))
    const bytes = await blob.arrayBuffer()
    return { bytes, width: canvas.width, height: canvas.height, mime }
  } finally {
    URL.revokeObjectURL(url)
  }
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
export async function buildUploadFile(files, orientation) { // export: usado también por las pruebas
  const printable = files.filter(f => !isDocx(f.file))

  if (printable.length === 0) {
    const f = files[0].file
    return { blob: f, contentType: f.type || 'application/octet-stream' }
  }

  const merged = await PDFDocument.create()
  // Idea 1 (Nodo 4b) — archivos que comparten groupId se colocan JUNTOS
  // en la(s) misma(s) hoja(s), usando el empaquetador de imageFraming.js
  // (ya probado por separado). Un archivo SIN groupId sigue exactamente
  // igual que siempre: una hoja para él solo, con fitImageInFrame — cero
  // cambio de comportamiento para el caso normal de un solo archivo.
  const processedGroups = new Set()

  for (const f of printable) {
    const file = f.file
    if (file.type === 'application/pdf') {
      const bytes = await file.arrayBuffer()
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = await merged.copyPages(src, src.getPageIndices())
      pages.forEach(p => merged.addPage(p))
      continue
    }

    if (!file.type.startsWith('image/')) continue

    if (f.groupId) {
      if (processedGroups.has(f.groupId)) continue // ya se colocó junto con el resto de su grupo
      processedGroups.add(f.groupId)
      await drawImageGroup(merged, printable.filter(gf => gf.groupId === f.groupId), orientation)
      continue
    }

    // Caso normal — sin grupo, un archivo, una hoja, exactamente como
    // siempre ha funcionado.
    await drawSingleImage(merged, f, orientation)
  }

  const pdfBytes = await merged.save()
  return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), contentType: 'application/pdf' }
}

// ─────────────────────────────────────────────────────────────────────
// Dibujado de imágenes — extraído de buildUploadFile (12/10/2026) SIN
// cambiar su lógica, para que el PDF combinado y los archivos
// individuales por pedido (buildUnitUploads, abajo) usen EXACTAMENTE el
// mismo código y nunca se desfasen entre sí.
// ─────────────────────────────────────────────────────────────────────

// Una imagen sin grupo: una hoja para ella sola, con su tamaño/alineación.
async function drawSingleImage(doc, f, orientation) {
  const { bytes, mime } = await normalizeImageOrientation(f.file, f.imageRotation ?? 0)
  const img = mime === 'image/png'
    ? await doc.embedPng(bytes)
    : await doc.embedJpg(bytes)
  const { x, y, w, h, pageW, pageH } = fitImageInFrame(img.width, img.height, f.imageFrame ?? 'completa', orientation ?? 'vertical', f.imageAlign ?? 'centro')
  const page = doc.addPage([pageW, pageH])
  page.drawImage(img, { x, y, width: w, height: h })
}

// Varias imágenes que comparten hoja(s) (mismo groupId).
async function drawImageGroup(doc, groupFiles, orientation) {
  // Se normalizan TODAS las imágenes del grupo primero — hace falta
  // saber sus dimensiones reales para centrarlas bien dentro de
  // cada espacio de la cuadrícula.
  const normalized = []
  for (const gf of groupFiles) {
    const { bytes, mime } = await normalizeImageOrientation(gf.file, gf.imageRotation ?? 0)
    const img = mime === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    normalized.push({ img, frame: gf.imageFrame ?? 'cuarto' })
  }

  // El empaquetador solo necesita saber el "frame" de cada una —
  // decide en qué hoja y en qué espacio cae cada imagen. Se vuelve a
  // emparejar por índice, en el MISMO orden en que se consumieron
  // (packImagesIntoPages nunca reordena su entrada).
  const packedPages = packImagesIntoPages(normalized.map(n => ({ frame: n.frame })))
  let idx = 0
  for (const pageItems of packedPages) {
    const { w: pageW, h: pageH } = pageSize(orientation ?? 'vertical')
    const page = doc.addPage([pageW, pageH])
    for (const { slot } of pageItems) {
      const n = normalized[idx]; idx++
      const rect = slotRect(slot, orientation ?? 'vertical')
      const { x, y, w, h } = fitImageInRect(n.img.width, n.img.height, rect)
      page.drawImage(n.img, { x, y, width: w, height: h })
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Archivos INDIVIDUALES por pedido (12/10/2026) — solo pedidos con más
// de un archivo.
//
// Problema real (reporte de la papelería): con varios archivos, la
// papelería solo podía abrir UNO (el PDF combinado). Peor: los Word
// (.docx) no se pueden meter a un PDF desde el navegador, así que
// buildUploadFile los descarta en silencio cuando hay otros archivos —
// el cliente pagaba por un documento que la papelería nunca recibía.
//
// Solución: además del PDF combinado (que se conserva igual, para el
// historial del cliente y compatibilidad), cada "unidad de impresión"
// se sube por separado a la MISMA carpeta del pedido:
//   - PDF  → el original, tal cual (sin recomprimir)
//   - Word → el original, tal cual
//   - Imagen suelta → un PDF de 1 hoja con su tamaño/giro ya aplicados
//   - Imágenes que comparten hoja → UN solo PDF con esa(s) hoja(s)
// La ruta de cada una queda en image_items[i].path para que la
// papelería abra cada archivo de forma independiente.
//
// IMPORTANTE (privacidad): todos viven en `${user}/${pedido}/`, la misma
// carpeta del PDF combinado — cleanup-expired-files borra la carpeta
// completa al vencer el pedido (ver supabase/functions).
// ─────────────────────────────────────────────────────────────────────

// Nombre seguro para una llave de Storage (sin acentos ni símbolos raros).
// El nombre real que ve la papelería se guarda aparte, en image_items.name.
function safeStorageName(name) {
  const cleaned = (name ?? 'archivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return (cleaned || 'archivo').slice(-80)
}

// Plan SÍNCRONO (sin tocar red ni Storage): decide qué unidades habrá y
// en qué ruta irá cada una — hace falta antes de crear el pedido, para
// guardar las rutas en image_items. Devuelve:
//   units:      [{ fileIndexes: [..], path, kind }]  en orden de aparición
//   pathByFile: ruta de la unidad de cada archivo (mismo largo que files)
export function planUnitUploads(files, userId, orderId) {
  const units = []
  const unitOfGroup = new Map()
  const pathByFile = []

  files.forEach((f, i) => {
    if (f.groupId && unitOfGroup.has(f.groupId)) {
      const u = unitOfGroup.get(f.groupId)
      u.fileIndexes.push(i)
      pathByFile[i] = u.path
      return
    }
    const n = String(units.length + 1).padStart(2, '0')
    const file = f.file
    let kind, name
    if (f.groupId) {
      kind = 'group'; name = 'hoja_compartida.pdf'
    } else if (file.type?.startsWith('image/')) {
      kind = 'image'; name = safeStorageName(file.name).replace(/\.[^.]*$/, '') + '.pdf'
    } else {
      kind = 'original'; name = safeStorageName(file.name)
    }
    const unit = { fileIndexes: [i], path: `${userId}/${orderId}/${n}_${name}`, kind }
    units.push(unit)
    if (f.groupId) unitOfGroup.set(f.groupId, unit)
    pathByFile[i] = unit.path
  })

  return { units, pathByFile }
}

// Arma el contenido de UNA unidad (se llama después de cobrar, igual que
// buildUploadFile).
export async function buildUnitBlob(unit, files, orientation) { // export: usado también por las pruebas
  const members = unit.fileIndexes.map(i => files[i])
  if (unit.kind === 'original') {
    const file = members[0].file
    return { blob: file, contentType: file.type || 'application/octet-stream' }
  }
  const doc = await PDFDocument.create()
  if (unit.kind === 'group') await drawImageGroup(doc, members, orientation)
  else await drawSingleImage(doc, members[0], orientation)
  const bytes = await doc.save()
  return { blob: new Blob([bytes], { type: 'application/pdf' }), contentType: 'application/pdf' }
}

// result: { success: true, orderId } | { success: false, error: string }
export async function sendOrder({ session, draft, selectedService, imageItems = [], totalPages, total, storeItems = [], storeTotal = 0 }) {
  const orderId = crypto.randomUUID()
  let orderCreated = false
  let credited = false
  let path = null
  // Rutas de los archivos INDIVIDUALES (solo pedidos con más de un
  // archivo) — se acumulan aquí para poder borrarlos TODOS si algo falla
  // después de haberlos subido. Ver planUnitUploads arriba.
  let unitPaths = []

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

    // 2b) Pedidos con más de un archivo: planear (sin red) la ruta de cada
    //     archivo individual y guardarla en image_items[i].path — así la
    //     papelería puede abrir cada uno por separado. Un pedido de un solo
    //     archivo no cambia en nada.
    const unitPlan = draft.files.length > 1 && imageItems.length === draft.files.length
      ? planUnitUploads(draft.files, session.user.id, orderId)
      : null
    const imageItemsForDb = unitPlan
      ? imageItems.map((it, i) => ({
          ...it,
          path: unitPlan.pathByFile[i],
          shared_sheet: !!draft.files[i].groupId,
        }))
      : imageItems

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
      // Desglose real por archivo (Idea 1 — varias imágenes, cada una
      // con su propio tamaño/precio). null si es un pedido "clásico" de
      // un solo tipo — no cambia nada del comportamiento de siempre.
      image_items: imageItemsForDb.length > 1 ? imageItemsForDb : null,
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
    const { blob, contentType } = await buildUploadFile(draft.files, draft.orientation)
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

    // 5b) Pedidos con más de un archivo: subir cada archivo individual a la
    //     misma carpeta del pedido. Si CUALQUIERA falla, se deshace todo
    //     (mismo criterio que el paso 5): reembolso, borrar lo ya subido
    //     y borrar el pedido — nunca queda un pedido a medias donde la
    //     papelería vea archivos que no existen.
    if (unitPlan) {
      unitPaths = unitPlan.units.map(u => u.path) // se declaran ya, para limpiar aunque falle a la mitad
      let unitError = null
      for (const unit of unitPlan.units) {
        try {
          const { blob: ub, contentType: uct } = await buildUnitBlob(unit, draft.files, draft.orientation)
          const { error } = await supabase.storage.from('documents').upload(unit.path, ub, {
            contentType: uct, upsert: false,
          })
          if (error) { unitError = error; break }
        } catch (e) { unitError = e; break }
      }
      if (unitError) {
        // Suscriptores no pagaron crédito (isSubscriber), nada que reembolsar.
        const { data: refunded } = isSubscriber
          ? { data: null }
          : await supabase.rpc('refund_credit', { p_order_id: orderId })
        try { await supabase.storage.from('documents').remove([path, ...unitPaths]) } catch (_) {}
        await supabase.from('orders').delete().eq('id', orderId)
        return {
          success: false,
          error: isSubscriber
            ? 'No se pudieron subir todos tus archivos. Intenta de nuevo.'
            : refunded
              ? 'No se pudieron subir todos tus archivos. Se te devolvió el crédito, intenta de nuevo.'
              : 'No se pudieron subir todos tus archivos. Contacta a soporte si tu saldo no se ajusta solo.',
        }
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
        await supabase.storage.from('documents').remove([path, ...unitPaths])
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
        await supabase.storage.from('documents').remove([path, ...unitPaths])
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
            order_id: orderId,
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
      try { await supabase.storage.from('documents').remove([path, ...unitPaths]) } catch (_) {}
    }
    if (orderCreated) {
      try { await supabase.from('orders').delete().eq('id', orderId) } catch (_) {}
    }
    return { success: false, error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}


