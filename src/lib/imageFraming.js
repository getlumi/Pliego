// Pliego · Encuadre de imágenes sueltas — cada tamaño (cuarto/media/
// completa) es una PÁGINA FÍSICAMENTE DISTINTA, no una imagen chica
// flotando dentro de una hoja Carta fija. Así es como una papelería
// realmente piensa estos tamaños (corta papel de ese tamaño, no
// desperdicia una hoja completa para imprimir un cuarto).
// Un solo lugar con la matemática real — así la vista previa en
// UploadPage y el PDF final en sendOrder.js NUNCA pueden desincronizarse.

export const CARTA_W = 612 // 8.5in × 72pt
export const CARTA_H = 792 // 11in × 72pt
export const MARGIN = 56.7 // 2cm × 72/2.54 — "nunca pegado al borde"

// Tamaño de PÁGINA para cada opción — no el tamaño de la imagen dentro
// de la página, el tamaño real de la hoja/recorte.
const PAGE_SIZES = {
  cuarto:   { w: CARTA_W / 2, h: CARTA_H / 2 }, // 306 × 396pt
  medio:    { w: CARTA_W,     h: CARTA_H / 2 }, // 612 × 396pt (corte horizontal)
  completa: { w: CARTA_W,     h: CARTA_H },     // 612 × 792pt
}

export function pageSize(frameSize) {
  return PAGE_SIZES[frameSize] ?? PAGE_SIZES.completa
}

// Dado el tamaño real de la imagen (px), el tamaño de página elegido, y
// la alineación (centro | superior_izquierda), calcula dónde dibujarla
// dentro de ESA página — escalada para caber sin deformar, siempre con
// el margen de 2cm respetado (nunca pegada al borde, en ninguna
// alineación).
export function fitImageInFrame(imgWidth, imgHeight, frameSize, align = 'centro') {
  const page = pageSize(frameSize)
  const boxW = page.w - MARGIN * 2
  const boxH = page.h - MARGIN * 2
  const scale = Math.min(boxW / imgWidth, boxH / imgHeight)
  const w = imgWidth * scale
  const h = imgHeight * scale

  const x = align === 'superior_izquierda' ? MARGIN : (page.w - w) / 2
  // "Superior" en la hoja = arriba visualmente. En puntos PDF el eje Y
  // crece hacia arriba, así que "arriba" es page.h - margen - alto,
  // no 0 (que sería la base de la hoja).
  const y = align === 'superior_izquierda' ? page.h - MARGIN - h : (page.h - h) / 2

  return { x, y, w, h, pageW: page.w, pageH: page.h }
}

export const ALIGN_LABELS = {
  centro: 'Centrada',
  superior_izquierda: 'Superior izquierda',
}

export const FRAME_LABELS = {
  cuarto:   'Cuarto de hoja',
  medio:    'Media hoja',
  completa: 'Hoja completa',
}
