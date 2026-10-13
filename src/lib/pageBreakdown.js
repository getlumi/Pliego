// Pliego · Desglose de precio POR HOJA de un documento (PDF / Word).
//
// Entrada: f.pageAnalysis = { status:'done', approx?:bool, pages:[{ image, ratio, color }] }
//   - image:  la hoja trae al menos una imagen
//   - ratio:  fracción de la HOJA que ocupan las imágenes (0..1, ya sumadas)
//   - color:  hay texto/líneas/relleno a color (sin contar las imágenes)
//
// Reglas de cobro (definidas con el dueño, 13/10/2026):
//   1. Hoja con imagen (con o sin texto) → precio de imagen según su
//      tamaño: hasta 1/4 de la hoja = "cuarto", hasta 1/2 = "medio",
//      más de eso = "completa". Una imagen diminuta (logo) NO se ignora:
//      se cobra en la versión mínima (cuarto) de cada papelería.
//   2. Hoja sin imagen pero con algo a color (aunque sea un renglón) →
//      "Color · Solo texto" de la papelería.
//   3. Hoja de solo texto/gris → B/N normal.
//   4. Si el cliente elige "Todo en B/N" (f.docColorMode === 'bn'), TODAS
//      las hojas se cobran como B/N, sin importar imágenes o color.
//
// El material (Bond / Opalina) sale del tipo de impresión que el cliente
// ya eligió para el archivo. Solo se aplica a los tipos B/N y Color
// (Bond u Opalina); con cualquier otro tipo (doble carta, personalizados)
// devuelve null y el precio se calcula como siempre (hojas × precio).
//
// Un solo lugar con la regla: la usan pricing.js (precio en pantalla y al
// enviar), UploadPage (tarjeta de detalle) y el desglose que se guarda en
// el pedido para la papelería.
import { resolveImageService, materialOfService } from './imageService'
import { serviceLabel } from './services'

const ELIGIBLE_BASE = ['bn_bond', 'color_bond', 'opalina_bn', 'opalina_color']
const TIERS = ['cuarto', 'medio', 'completa']

// Fracción de la hoja → tamaño de imagen.
export function tierForRatio(ratio) {
  if (ratio <= 0.25) return 'cuarto'
  if (ratio <= 0.5) return 'medio'
  return 'completa'
}

export const TIER_LABEL = { cuarto: '1/4 de hoja', medio: '1/2 hoja', completa: 'hoja completa' }

// [1,2,3,5,7,8] → "1-3, 5, 7-8"
export function formatPageRanges(pages) {
  const out = []
  let i = 0
  while (i < pages.length) {
    let j = i
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++
    out.push(j > i ? `${pages[i]}-${pages[j]}` : `${pages[i]}`)
    i = j + 1
  }
  return out.join(', ')
}

export function computeBreakdown(f, services) {
  const a = f?.pageAnalysis
  if (!a || a.status !== 'done' || !Array.isArray(a.pages) || a.pages.length === 0) return null
  // Word (aproximado): si la persona corrigió el número de hojas, el detalle
  // por hoja ya no corresponde al documento — se vuelve a hojas × precio.
  if (a.approx && f.pageCount != null && f.pageCount !== a.pages.length) return null
  const list = services ?? []
  const base = list.find(s => s.id === f.serviceId) ?? list[0] ?? null
  if (!base || !ELIGIBLE_BASE.includes(base.service_type)) return null

  const material = materialOfService(base)
  const find = (type) => list.find(s => s.service_type === type) ?? null
  const bnSvc = resolveImageService(list, { material, colorMode: 'bn' })
  if (!bnSvc) return null // sin B/N no hay base contra la cual desglosar
  const colorTextSvc = find(material === 'opalina' ? 'opalina_color' : 'color_bond') ?? find('color_bond')

  const hasColorOrImage = a.pages.some(p => p.image || p.color)
  if (!hasColorOrImage) return null // solo texto B/N: se cobra como siempre

  const mode = f.docColorMode === 'bn' ? 'bn' : 'color'

  // Servicio de imagen para un tamaño; si la papelería no ofrece ese
  // tamaño, el siguiente más grande (nunca cobrar de menos), luego los
  // más chicos, luego color de texto, luego B/N.
  const tierService = (tier) => {
    const start = TIERS.indexOf(tier)
    const order = [...TIERS.slice(start), ...TIERS.slice(0, start).reverse()]
    // Primero el MISMO material (Opalina con Opalina) en el tamaño pedido o
    // el siguiente mayor — cobrar la versión Bond de una hoja Opalina sería
    // cobrar de menos. Solo si no hay ninguno, se cae a Bond.
    for (const strict of [true, false]) {
      for (const t of order) {
        const s = resolveImageService(list, { material, colorMode: 'color', frame: t, strict })
        if (s) return { svc: s, tier: t }
      }
    }
    return { svc: colorTextSvc ?? bnSvc, tier: null }
  }

  const lines = new Map() // clave -> línea
  const colorPagesAsBn = []
  a.pages.forEach((p, idx) => {
    const n = idx + 1
    let svc = bnSvc, kind = 'bn', tier = null
    if (p.image || p.color) {
      if (mode === 'bn') {
        colorPagesAsBn.push(n)
      } else if (p.image) {
        const r = tierService(tierForRatio(p.ratio ?? 1))
        svc = r.svc; tier = r.tier; kind = 'image'
      } else {
        svc = colorTextSvc ?? tierService('cuarto').svc; kind = 'color_text'
      }
    }
    const key = `${svc.id}|${kind}|${tier ?? ''}`
    if (!lines.has(key)) {
      lines.set(key, {
        service_id: svc.id, service_type: svc.service_type, label: serviceLabel(svc),
        price: Number(svc.price_per_sheet) || 0, kind, tier, pages: [],
      })
    }
    lines.get(key).pages.push(n)
  })

  const out = [...lines.values()].map(l => ({ ...l, count: l.pages.length }))
  const total = out.reduce((s, l) => s + l.price * l.count, 0)
  const colorPageCount = a.pages.filter(p => p.image || p.color).length
  return {
    lines: out, total, mode, approx: !!a.approx,
    colorPageCount, colorPagesAsBn,
    scanLike: a.pages.length > 0 && a.pages.every(p => p.image && (p.ratio ?? 0) >= 0.85),
  }
}
