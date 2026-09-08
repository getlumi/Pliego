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
// Import ESTÁTICO, no dinámico — misma regla ya establecida en el
// proyecto para pdf-lib (Regla 10: los imports dinámicos de librerías
// de PDF fallan en Safari de iOS). El worker se referencia con el
// patrón `new URL(..., import.meta.url)` que Vite entiende de forma
// nativa y empaqueta correctamente, sin depender de un CDN externo.
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// Genera una miniatura JPEG de la primera página de un PDF, como un
// Blob — mismo tipo de dato que ya produce el resto del flujo de fotos
// (createObjectURL), así encaja sin fricciones en el patrón existente
// de `previewUrl`.
export async function renderPdfFirstPageThumbnail(file, targetWidth = 400) {
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
