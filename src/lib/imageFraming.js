// Pliego · Encuadre de imágenes sueltas.
// MODELO CORRECTO (corregido tras reporte real de bugs): la HOJA
// siempre es tamaño Carta estándar, respetando el botón Vertical/
// Horizontal que ya existía — lo que cambia con cuarto/media/completa
// es el TAMAÑO DE LA IMAGEN dentro de esa misma hoja, nunca la hoja en
// sí. Antes (versión con bug) se cambiaba el tamaño físico de la
// página, lo cual además rompía el botón de orientación por completo.
//
// Cuarto/media/completa se definen como FRACCIÓN DE ÁREA del espacio
// imprimible, manteniendo siempre la misma proporción que la hoja
// completa (por eso SIEMPRE se ven visualmente distintos entre sí, sin
// importar la orientación de la foto que se suba — antes "cuarto" y
// "media" compartían la misma altura de caja y con fotos verticales se
// veían idénticos).
//
// Un solo lugar con la matemática real — así la vista previa en
// UploadPage y el PDF final en sendOrder.js NUNCA pueden desincronizarse.

export const CARTA_W = 612 // 8.5in × 72pt
export const CARTA_H = 792 // 11in × 72pt
export const MARGIN = 56.7 // 2cm × 72/2.54 — "nunca pegado al borde"

// Tamaño de la HOJA (siempre Carta, orientación real del botón
// Vertical/Horizontal que ya existía).
export function pageSize(orientation = 'vertical') {
  return orientation === 'horizontal' ? { w: CARTA_H, h: CARTA_W } : { w: CARTA_W, h: CARTA_H }
}

// Tamaño de la CAJA para la imagen — misma proporción que el área
// imprimible completa, escalada por fracción de ÁREA (no de un solo
// lado), para que cuarto/media/completa SIEMPRE se vean distintos sin
// importar la forma de la foto.
export function frameBoxSize(frameSize, orientation = 'vertical') {
  const page = pageSize(orientation)
  const printableW = page.w - MARGIN * 2
  const printableH = page.h - MARGIN * 2
  if (frameSize === 'cuarto') return { w: printableW * 0.5, h: printableH * 0.5 }           // 1/4 de área
  if (frameSize === 'medio')  return { w: printableW * Math.SQRT1_2, h: printableH * Math.SQRT1_2 } // 1/2 de área
  return { w: printableW, h: printableH } // 'completa' — toda el área imprimible
}

// Posición final: la caja se ubica en la hoja según la alineación
// elegida (centrada o superior izquierda), y la imagen se centra
// dentro de SU caja, escalada sin deformar.
export function fitImageInFrame(imgWidth, imgHeight, frameSize, orientation = 'vertical', align = 'centro') {
  const page = pageSize(orientation)
  const box = frameBoxSize(frameSize, orientation)

  const boxX = align === 'superior_izquierda' ? MARGIN : (page.w - box.w) / 2
  // "Superior" = arriba visualmente. En puntos PDF el eje Y crece hacia
  // arriba, así que "arriba" es page.h - margen - alto de la caja.
  const boxY = align === 'superior_izquierda' ? page.h - MARGIN - box.h : (page.h - box.h) / 2

  const scale = Math.min(box.w / imgWidth, box.h / imgHeight)
  const w = imgWidth * scale
  const h = imgHeight * scale
  const x = boxX + (box.w - w) / 2
  const y = boxY + (box.h - h) / 2

  return { x, y, w, h, pageW: page.w, pageH: page.h }
}

export const FRAME_LABELS = {
  cuarto:   'Cuarto de hoja',
  medio:    'Media hoja',
  completa: 'Hoja completa',
}

// ============================================================
// NODO 4 (Idea 1) — varias imágenes compartiendo la misma hoja.
// ============================================================
// Importante: esto es una matemática NUEVA y separada de fitImageInFrame
// de arriba — esa sigue exactamente igual para el caso de una sola
// imagen (el 99% de los pedidos). Esta solo se usa cuando dos o más
// imágenes comparten un grupo (ver "groupId" en los archivos).
//
// Por qué no se reutiliza frameBoxSize: esa función centra una caja del
// tamaño pedido donde sea (según alineación), sin garantizar que dos
// cajas "cuarto" no se encimen entre sí. Para que varias imágenes
// convivan sin pisarse, cada una necesita una POSICIÓN FIJA dentro de
// una cuadrícula de 2×2 — no un tamaño suelto.
//
// Cuadrícula:  [ TL | TR ]
//              [ BL | BR ]
// - "cuarto"   ocupa 1 celda.
// - "medio"    ocupa una fila completa (TOP = TL+TR, o BOTTOM = BL+BR).
// - "completa" ocupa las 4 celdas — siempre sola en su propia hoja.

// Da la posición y tamaño real (en puntos PDF) de un espacio de la
// cuadrícula, dentro del área imprimible de una hoja Carta. Verificado
// a mano: TL+TR+BL+BR cubren exactamente el área imprimible completa,
// sin huecos ni traslapes entre sí; TOP = TL∪TR y BOTTOM = BL∪BR letra
// por letra.
export function slotRect(slot, orientation = 'vertical') {
  const page = pageSize(orientation)
  const printableW = page.w - MARGIN * 2
  const printableH = page.h - MARGIN * 2
  const halfW = printableW / 2
  const halfH = printableH / 2

  const rects = {
    TL:     { x: MARGIN,          y: MARGIN + halfH, w: halfW,      h: halfH },
    TR:     { x: MARGIN + halfW,  y: MARGIN + halfH, w: halfW,      h: halfH },
    BL:     { x: MARGIN,          y: MARGIN,          w: halfW,      h: halfH },
    BR:     { x: MARGIN + halfW,  y: MARGIN,          w: halfW,      h: halfH },
    TOP:    { x: MARGIN,          y: MARGIN + halfH, w: printableW, h: halfH },
    BOTTOM: { x: MARGIN,          y: MARGIN,          w: printableW, h: halfH },
    FULL:   { x: MARGIN,          y: MARGIN,          w: printableW, h: printableH },
  }
  return { ...rects[slot], pageW: page.w, pageH: page.h }
}

// Centra una imagen dentro de CUALQUIER rectángulo dado (no solo una
// caja calculada por frameBoxSize) — misma matemática de "contener y
// centrar sin deformar" que ya usa fitImageInFrame, pero reutilizable
// para los espacios de la cuadrícula de arriba.
export function fitImageInRect(imgWidth, imgHeight, rect) {
  const scale = Math.min(rect.w / imgWidth, rect.h / imgHeight)
  const w = imgWidth * scale
  const h = imgHeight * scale
  const x = rect.x + (rect.w - w) / 2
  const y = rect.y + (rect.h - h) / 2
  return { x, y, w, h, pageW: rect.pageW, pageH: rect.pageH }
}

// El "empaquetador" — recibe una lista ordenada de imágenes (cada una
// solo con su frame: 'cuarto'|'medio'|'completa') y decide en qué hoja y
// en qué espacio de la cuadrícula cae cada una, llenando espacio antes
// de abrir una hoja nueva. Es una función PURA (no toca React ni PDF),
// así se puede usar igual en la vista previa y en el armado del PDF
// final, sin que se puedan desincronizar.
//
// Devuelve: [ [ {item, slot}, {item, slot}, ... ],   ← hoja 1
//             [ {item, slot}, ... ],                  ← hoja 2
//             ... ]
export function packImagesIntoPages(images) {
  const pages = []
  let current = null // { free: Set de slots libres, items: [] }

  const startNewPage = () => {
    current = { free: new Set(['TL', 'TR', 'BL', 'BR']), items: [] }
    pages.push(current.items)
  }

  for (const item of images) {
    if (item.frame === 'completa') {
      // Siempre sola en su propia hoja — si la actual ya tiene algo, se
      // cierra y se abre una nueva.
      if (!current || current.items.length > 0) startNewPage()
      current.items.push({ item, slot: 'FULL' })
      current.free.clear()
      continue
    }

    if (item.frame === 'medio') {
      const hasTop = current && current.free.has('TL') && current.free.has('TR')
      const hasBottom = current && current.free.has('BL') && current.free.has('BR')
      if (!current || (!hasTop && !hasBottom)) startNewPage()
      const useTop = current.free.has('TL') && current.free.has('TR')
      const slot = useTop ? 'TOP' : 'BOTTOM'
      current.items.push({ item, slot })
      if (useTop) { current.free.delete('TL'); current.free.delete('TR') }
      else { current.free.delete('BL'); current.free.delete('BR') }
      continue
    }

    // 'cuarto' — cualquier celda libre, en orden de lectura
    if (!current || current.free.size === 0) startNewPage()
    const order = ['TL', 'TR', 'BL', 'BR']
    const slot = order.find(s => current.free.has(s))
    current.items.push({ item, slot })
    current.free.delete(slot)
  }

  return pages
}
