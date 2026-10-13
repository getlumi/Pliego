// Pliego · Análisis de un PDF HOJA POR HOJA: ¿lleva imágenes?, ¿qué tanto
// de la hoja ocupan?, ¿hay algo a color (texto, líneas, rellenos)?
//
// Se lee la lista de operaciones de dibujo que trae cada página (pdf.js),
// sin dibujarla — rápido y exacto: no depende de adivinar por píxeles.
//   - Imágenes: cada operación de pintar imagen ocupa el cuadrado unitario
//     transformado por la matriz vigente (CTM); su área = |determinante|.
//     Solo se necesita el producto de determinantes (no la matriz
//     completa), porque el área depende únicamente de él.
//   - Color: se ve el color de relleno/trazo VIGENTE en el momento de
//     pintar texto, rellenos o trazos (un color puesto y nunca usado no
//     cuenta). "Color" = canales RGB que se separan más de COLOR_SPREAD
//     (pdf.js convierte gris/CMYK/ICC/etc. a RGB, así que un gris puro
//     siempre da R=G=B). Patrones y degradados cuentan como color.
//
// Esto es SOLO una sugerencia de precio para que el cliente vea el desglose
// antes de enviar y la papelería lo reciba claro; si algo falla (PDF
// protegido, dañado, navegador viejo) devuelve status 'failed' y todo
// sigue funcionando como siempre (hojas × precio del tipo elegido).
//
// pdf.js se carga con import() DINÁMICO — nunca estático (ver
// pdfThumbnail.js: un import estático puede tronar la carga entera de la
// app en algunos celulares).

const COLOR_SPREAD = 30       // diferencia máxima entre canales (0-255) para seguir contando como gris
const MAX_PAGES = 200         // más hojas que esto: no se analiza (se cobra como siempre)
const MARGIN_PAGES_YIELD = 4  // cada cuántas hojas se cede el hilo para no congelar la pantalla

// pdf.js reciente usa Map/WeakMap.prototype.getOrInsert(Computed), que
// navegadores algo viejos no tienen — sin esto falla en esos celulares.
function ensurePolyfills() {
  for (const C of [Map, WeakMap]) {
    if (!C.prototype.getOrInsert) {
      C.prototype.getOrInsert = function (k, v) { if (!this.has(k)) this.set(k, v); return this.get(k) }
    }
    if (!C.prototype.getOrInsertComputed) {
      C.prototype.getOrInsertComputed = function (k, fn) { if (!this.has(k)) this.set(k, fn(k)); return this.get(k) }
    }
  }
}

const isColorful = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) > COLOR_SPREAD

// El color llega como "#rrggbb" (pdf.js reciente) o como tres números 0-255
// (versiones anteriores). Un formato desconocido NO cuenta como color.
function argsColorful(args) {
  if (typeof args?.[0] === 'string' && /^#[0-9a-f]{6}$/i.test(args[0])) {
    const h = args[0]
    return isColorful(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16))
  }
  if (typeof args?.[0] === 'number' && args.length >= 3) return isColorful(args[0], args[1], args[2])
  return false
}

export async function analyzePdfPages(file) {
  try {
    ensurePolyfills()
    const pdfjsLib = await import('pdfjs-dist')
    const { default: pdfWorkerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const { OPS } = pdfjsLib

    const bytes = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: bytes })
    const pdf = await loadingTask.promise
    try {
      if (pdf.numPages > MAX_PAGES) return { status: 'skipped', reason: 'too_many_pages' }

      const IMAGE_OPS = new Set([
        OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject,
        OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObjectRepeat, OPS.paintImageMaskXObjectGroup,
        OPS.paintJpegXObject,
      ].filter(v => v !== undefined))
      const TEXT_OPS = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText].filter(v => v !== undefined))
      const FILL_OPS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter(v => v !== undefined))
      const STROKE_OPS = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter(v => v !== undefined))

      const pages = []
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p)
        const [x0, y0, x1, y1] = page.view
        const pageArea = Math.abs((x1 - x0) * (y1 - y0)) || 1
        const { fnArray, argsArray } = await page.getOperatorList()

        let det = 1
        const stack = []                 // { det, fill, stroke }
        let fillColor = false, strokeColor = false
        let imageArea = 0, hasImage = false, hasColor = false

        for (let i = 0; i < fnArray.length; i++) {
          const fn = fnArray[i], args = argsArray[i]
          if (fn === OPS.save) { stack.push({ det, fillColor, strokeColor }) }
          else if (fn === OPS.restore) { const s = stack.pop(); if (s) { det = s.det; fillColor = s.fillColor; strokeColor = s.strokeColor } }
          else if (fn === OPS.transform) { det *= (args[0] * args[3] - args[1] * args[2]) }
          else if (fn === OPS.paintFormXObjectBegin) {
            stack.push({ det, fillColor, strokeColor })
            if (Array.isArray(args?.[0])) { const m = args[0]; det *= (m[0] * m[3] - m[1] * m[2]) }
          }
          else if (fn === OPS.paintFormXObjectEnd) { const s = stack.pop(); if (s) { det = s.det; fillColor = s.fillColor; strokeColor = s.strokeColor } }
          else if (fn === OPS.setFillRGBColor) { fillColor = argsColorful(args) }
          else if (fn === OPS.setStrokeRGBColor) { strokeColor = argsColorful(args) }
          else if (fn === OPS.setFillColorN) { fillColor = Array.isArray(args) && typeof args[0] === 'string' }       // patrón/degradado
          else if (fn === OPS.setStrokeColorN) { strokeColor = Array.isArray(args) && typeof args[0] === 'string' }
          else if (IMAGE_OPS.has(fn)) { hasImage = true; imageArea += Math.abs(det) }
          else if (fn === OPS.shadingFill) { hasColor = true }
          else if (TEXT_OPS.has(fn)) { if (fillColor) hasColor = true }
          else if (FILL_OPS.has(fn) || STROKE_OPS.has(fn) || fn === OPS.constructPath) {
            // pdf.js reciente trae la operación de pintar DENTRO de
            // constructPath (args[0]); las anteriores la emiten aparte.
            const paintOp = fn === OPS.constructPath ? args?.[0] : fn
            if (FILL_OPS.has(paintOp) && fillColor) hasColor = true
            if (STROKE_OPS.has(paintOp) && strokeColor) hasColor = true
          }
        }
        pages.push({ image: hasImage, ratio: hasImage ? Math.min(1, imageArea / pageArea) : 0, color: hasColor })
        page.cleanup()
        if (p % MARGIN_PAGES_YIELD === 0) await new Promise(r => setTimeout(r, 0))
      }
      return { status: 'done', pages }
    } finally {
      try { await loadingTask.destroy() } catch { /* liberar memoria es opcional */ }
    }
  } catch (err) {
    console.warn('No se pudo analizar el PDF hoja por hoja:', err)
    return { status: 'failed' }
  }
}
