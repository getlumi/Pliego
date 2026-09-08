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

  return { totalPages, total, items, selectedService }
}
