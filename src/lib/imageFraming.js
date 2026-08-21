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
