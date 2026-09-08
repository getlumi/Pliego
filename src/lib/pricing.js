// Pliego · Cálculo de precio total de un pedido — UN SOLO LUGAR,
// compartido entre UploadPage.jsx (lo que se ve mientras armas el
// pedido) y HomePage.jsx (lo que realmente se manda a cobrar en
// sendOrder.js).
//
// Nodo 3 (Idea 1 — varias imágenes con su propio precio): antes esta
// función recibía UN serviceId para todo el pedido. Ahora cada archivo
// trae su PROPIO serviceId (f.serviceId) — exactamente el mismo patrón
// que ya usan imageFrame/imageAlign/imageRotation por archivo. Un pedido
// de un solo archivo (el caso normal de hoy) sigue funcionando igual,
// simplemente con un arreglo de un solo elemento.
//
// Corrección real (08/09/2026, reporte directo de prueba en celular):
// "totalPages" cuenta 1 por CADA IMAGEN, sin importar si dos imágenes
// comparten la misma hoja física — correcto para el PRECIO (se sigue
// cobrando por imagen, sumado como total del documento, tal como se
// decidió), pero mostrar ese mismo número como "X hojas" en pantalla es
// engañoso: dos imágenes que comparten hoja son 1 hoja física, no 2.
// Se agrega `physicalSheets` — un conteo aparte, honesto, para todo lo
// que la pantalla le muestre al usuario como "cuántas hojas van a
// salir de la impresora".
import { packImagesIntoPages } from './imageFraming'

export function calculateOrderTotal({ files, services, copies }) {
  const list = services ?? []
  const fallback = list[0] ?? null

  let totalPages = 0
  let total = 0
  const items = [] // desglose por archivo — también sirve para armar image_items al enviar

  for (const f of (files ?? [])) {
    const pages = f.pageCount ?? 1
    totalPages += pages
    const service = list.find(s => s.id === f.serviceId) ?? fallback
    const pricePerSheet = service?.price_per_sheet ?? 0
    total += pricePerSheet * pages
    items.push({ service, pricePerSheet, pages })
  }

  total *= (copies ?? 1)

  // "selectedService" de compatibilidad — el del primer archivo, para el
  // resumen legado (service_type/color_mode/paper_size en orders, que
  // solo soportan UN tipo por pedido). El detalle real por archivo vive
  // en `items` y en la columna nueva `image_items`.
  const selectedService = items[0]?.service ?? fallback

  const physicalSheets = calculatePhysicalSheets(files)

  return { totalPages, total, items, selectedService, physicalSheets }
}

// Cuántas hojas FÍSICAS reales va a usar la impresora — distinto de
// totalPages (que es "cuántas imágenes/páginas lógicas", para el
// precio). Un archivo sin groupId sigue siendo 1 hoja por su cuenta,
// exactamente como siempre. Los archivos que comparten groupId se
// empaquetan con el mismo motor que ya usa sendOrder.js para el PDF
// real — así el número que ve el usuario es el mismo que va a imprimir,
// no una aproximación aparte.
export function calculatePhysicalSheets(files) {
  let sheets = 0
  const processedGroups = new Set()

  for (const f of (files ?? [])) {
    if (f.groupId) {
      if (processedGroups.has(f.groupId)) continue
      processedGroups.add(f.groupId)
      const members = (files ?? []).filter(m => m.groupId === f.groupId)
      const packed = packImagesIntoPages(members.map(m => ({ frame: m.imageFrame ?? 'cuarto' })))
      sheets += packed.length
    } else {
      sheets += f.pageCount ?? 1
    }
  }

  return sheets
}

