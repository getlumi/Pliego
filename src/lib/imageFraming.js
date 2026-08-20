// Pliego · Encuadre de imágenes sueltas en hoja Carta.
// Un solo lugar con la matemática real — así la vista previa en
// UploadPage y el PDF final en sendOrder.js NUNCA pueden desincronizarse
// (si cambia el margen o las proporciones, se cambia aquí una sola vez).

export const CARTA_W = 612 // 8.5in × 72pt
export const CARTA_H = 792 // 11in × 72pt
export const MARGIN = 56.7 // 2cm × 72/2.54 — "nunca pegado al borde"

const PRINTABLE_W = CARTA_W - MARGIN * 2
const PRINTABLE_H = CARTA_H - MARGIN * 2

// Tamaño del recuadro disponible para la imagen, según el encuadre
// elegido — siempre centrado en la hoja, siempre con margen real.
export function frameBox(frameSize) {
  if (frameSize === 'cuarto') return { w: PRINTABLE_W / 2, h: PRINTABLE_H / 2 }
  if (frameSize === 'medio')  return { w: PRINTABLE_W,     h: PRINTABLE_H / 2 }
  return { w: PRINTABLE_W, h: PRINTABLE_H } // 'completa' (default)
}

// Dado el tamaño real de la imagen (px) y el recuadro disponible (pt),
// calcula dónde dibujarla — escalada para caber SIN deformar (nunca
// estira ancho y alto por separado), centrada en la hoja completa.
export function fitImageInFrame(imgWidth, imgHeight, frameSize) {
  const box = frameBox(frameSize)
  const scale = Math.min(box.w / imgWidth, box.h / imgHeight)
  const w = imgWidth * scale
  const h = imgHeight * scale
  const x = (CARTA_W - w) / 2
  const y = (CARTA_H - h) / 2
  return { x, y, w, h }
}

export const FRAME_LABELS = {
  cuarto:   'Cuarto de hoja',
  medio:    'Media hoja',
  completa: 'Hoja completa',
}
