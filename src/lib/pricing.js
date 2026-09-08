// Pliego · Cálculo de precio total de un pedido — UN SOLO LUGAR,
// compartido entre UploadPage.jsx (lo que se ve mientras armas el
// pedido) y HomePage.jsx (lo que realmente se manda a cobrar en
// sendOrder.js). Antes eran dos fórmulas escritas por separado —
// matemáticamente idénticas hoy, pero con riesgo real de desincronizarse
// si alguien edita una sin tocar la otra (justo el tipo de bug silencioso
// que ya nos ha costado caro en esta sesión).
//
// Diferencia real que sí cambia comportamiento (documentada, no
// escondida): HomePage.jsx ya tenía un resguardo "si no hay servicio
// elegido todavía, usa el primero disponible" que UploadPage.jsx no
// tenía — aquí se adopta ese resguardo para los dos, evitando el
// parpadeo de "$0.00" que podía verse en Upload antes de que el efecto
// de auto-selección terminara de correr.
export function calculateOrderTotal({ files, serviceId, services, copies }) {
  const totalPages = (files ?? []).reduce((sum, f) => sum + (f.pageCount ?? 1), 0)
  const selectedService =
    (services ?? []).find(s => s.id === serviceId) ?? services?.[0] ?? null
  const pricePerSheet = selectedService?.price_per_sheet ?? 0
  const total = pricePerSheet * totalPages * (copies ?? 1)
  return { totalPages, pricePerSheet, total, selectedService }
}
