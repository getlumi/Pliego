// Pliego · Miniatura real de PDF — renderiza la primera página de un
// PDF subido directo (no escaneado con la cámara de Pliego) como imagen,
// para que la vista previa muestre el documento real, no solo un ícono
// genérico.
//
// Por qué pdf.js y no otra cosa: es el motor que usa Firefox de verdad
// para PDFs — no es una librería experimental. pdf-lib (que ya usa el
// proyecto) NO puede hacer esto, solo combina/manipula PDFs, no los
// dibuja como imagen.
//
// ⚠️ CORREGIDO (reporte real): el import ESTÁTICO de pdf.js dejaba la
// app COMPLETA en blanco en al menos un celular real (aunque
// funcionara bien en otros celulares y en computadora) — pdf.js es una
// librería pesada, y si algo de su código falla al evaluarse (antes de
// que React siquiera monte la app), truena TODO el paquete, no solo
// esta función. Esto es DISTINTO al problema que describe la Regla 10
// del proyecto (imports dinámicos de pdf-lib fallando al cargar) — aquí
// el riesgo es el opuesto: un import estático de una librería pesada
// puede tronar la carga inicial completa si algo en ella no es
// compatible con un dispositivo específico.
//
// Fix: import DINÁMICO, cargado solo cuando de verdad se sube un PDF —
// nunca al abrir la app — y protegido con el mismo try/catch que ya
// existía en UploadPage.jsx. Si esto falla en algún celular, se
// degrada solo al ícono genérico, sin tronar nada más de la app.
export async function renderPdfFirstPageThumbnail(file, targetWidth = 400) {
  const pdfjsLib = await import('pdfjs-dist')
  const { default: pdfWorkerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const bytes = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const page = await pdf.getPage(1)

  const baseViewport = page.getViewport({ scale: 1 })
  const scale = targetWidth / baseViewport.width
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')

  await page.render({ canvasContext: ctx, viewport }).promise

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  return blob ? URL.createObjectURL(blob) : null
}
