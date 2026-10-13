// Pliego · Análisis APROXIMADO de un Word (.docx), hoja por hoja.
//
// Un .docx es un zip con XML. Se lee DIRECTO en el celular (sin servidor):
//   - Número de hojas: lo que Word guardó al último guardado
//     (docProps/app.xml → <Pages>), o, si no está, las marcas de salto
//     de página del documento.
//   - Imágenes: tamaño real dentro de la página (wp:extent, en EMU).
//   - Color: texto con color, resaltado, sombreados de párrafo/celda,
//     estilos con color (títulos azules, hipervínculos…), formas de color.
//
// POR QUÉ ES APROXIMADO: un .docx NO guarda en qué hoja cae cada cosa — la
// paginación se calcula al abrirlo. Solo hay marcas (lastRenderedPageBreak
// que Word escribe al guardar, saltos de página explícitos y saltos de
// sección). Si el archivo no viene de Word (o nunca se renderizó) puede no
// traerlas: entonces NO se adivina (status 'failed') y el conteo queda
// manual como siempre. Para un cobro exacto: guardar como PDF.
//
// Lo que NO se ve: .doc antiguos (binario), páginas generadas por tablas
// muy altas sin marcas, campos que se recalculan. Todo esto solo afecta la
// SUGERENCIA de precio: el cliente la ve y la papelería la confirma.
//
// fflate se carga con import() dinámico (solo cuando se sube un Word).

const COLOR_SPREAD = 30
const MAX_PAGES = 200
const MAX_PART_BYTES = 30 * 1024 * 1024 // tope por parte XML descomprimida (zip bomb)
const EMU_PER_TWIP = 635

const isColorHex = (v) => {
  if (!v || !/^[0-9a-f]{6}$/i.test(v)) return false // 'auto', vacío, temas sin valor…
  const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16)
  return Math.max(r, g, b) - Math.min(r, g, b) > COLOR_SPREAD
}
// Resaltados de Word que NO son color (grises/blanco/negro/ninguno).
const GRAY_HIGHLIGHT = new Set(['none', 'black', 'white', 'lightGray', 'darkGray'])

const attr = (tag, name) => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag)
  return m ? m[1] : null
}

// Mide un dibujo/imagen en EMU² (ancho × alto) y dice qué es.
function drawingInfo(chunk, isPict) {
  if (isPict) {
    const isImg = /<v:imagedata\b/.test(chunk)
    let area = 0
    const w = /width:\s*([\d.]+)\s*(pt|in|cm|mm|px)/.exec(chunk), h = /height:\s*([\d.]+)\s*(pt|in|cm|mm|px)/.exec(chunk)
    const toEmu = (n, u) => parseFloat(n) * ({ pt: 12700, in: 914400, cm: 360000, mm: 36000, px: 9525 }[u])
    if (w && h) area = toEmu(w[1], w[2]) * toEmu(h[1], h[2])
    return { image: isImg, area, color: !isImg && /fillcolor="#?([0-9a-f]{6})"/i.test(chunk) && isColorHex(/fillcolor="#?([0-9a-f]{6})"/i.exec(chunk)[1]) }
  }
  const ext = /<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(chunk)
  const area = ext ? parseInt(ext[1], 10) * parseInt(ext[2], 10) : 0
  const image = /<a:blip\b/.test(chunk) || /<c:chart\b/.test(chunk) || /<dgm:relIds\b/.test(chunk)
  let color = false
  if (!image) {
    for (const m of chunk.matchAll(/<a:srgbClr\s+val="([0-9a-f]{6})"/gi)) if (isColorHex(m[1])) { color = true; break }
  }
  return { image, area, color }
}

// Colores por estilo (styles.xml), siguiendo basedOn.
function styleColors(stylesXml) {
  const own = new Map(), based = new Map()
  if (stylesXml) {
    for (const m of stylesXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[\s\S]*?<\/w:style>/g)) {
      const id = m[1], block = m[0]
      const b = /<w:basedOn\s+w:val="([^"]+)"/.exec(block); if (b) based.set(id, b[1])
      const c = /<w:rPr>[\s\S]*?<w:color\b[^>]*w:val="([^"]*)"/.exec(block)
      if (c) own.set(id, c[1])
    }
  }
  const memo = new Map()
  const colorful = (id, depth = 0) => {
    if (!id || depth > 12) return false
    if (memo.has(id)) return memo.get(id)
    let r
    if (own.has(id)) r = isColorHex(own.get(id))
    else r = colorful(based.get(id), depth + 1)
    memo.set(id, r)
    return r
  }
  return colorful
}

// Recorre un XML de Word en orden, asignando cada imagen/color a una hoja.
// trackPages=false (encabezados/pies): todo se acumula en la hoja 0.
function scanXml(xmlRaw, styleIsColor, trackPages) {
  // mc:AlternateContent trae el MISMO dibujo dos veces (Choice + Fallback VML):
  // se descarta el Fallback para no contarlo doble.
  const xml = xmlRaw.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '')
  const hasLRPB = /<w:lastRenderedPageBreak\b/.test(xml)
  const TOKEN = /<w:p[ >]|<\/w:p>|<w:pPr>|<\/w:pPr>|<w:r[ >]|<\/w:r>|<w:rPr>|<\/w:rPr>|<w:tcPr>|<\/w:tcPr>|<w:lastRenderedPageBreak\s*\/?>|<w:br\b[^>]*>|<w:pageBreakBefore\b[^>]*>|<w:sectPr\b[^>]*\/>|<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:drawing>[\s\S]*?<\/w:drawing>|<w:pict>[\s\S]*?<\/w:pict>|<w:color\b[^>]*>|<w:shd\b[^>]*>|<w:highlight\b[^>]*>|<w:pStyle\b[^>]*>|<w:rStyle\b[^>]*>|<w:t(?:\s[^>]*)?>[^<]*/g

  const pages = new Map() // índice -> { area, image, color }
  const at = (i) => { if (!pages.has(i)) pages.set(i, { area: 0, image: false, color: false }); return pages.get(i) }
  let page = 0, maxPage = 0, explicitBreaks = 0
  let inPPr = false, inRPr = false, inRun = false, inTcPr = false
  let pStyleColor = false, runColor = null, runStyleColor = false, runMark = false // runMark: resaltado/sombreado
  let pendingSectionBreak = false
  let pgSz = null
  const lastSectIndex = (() => { let li = -1; for (const m of xml.matchAll(/<w:sectPr\b/g)) li = m.index; return li })()

  const bump = () => { page++; if (page > maxPage) maxPage = page }
  for (const m of xml.matchAll(TOKEN)) {
    const t = m[0]
    if (t.startsWith('<w:p ') || t === '<w:p>') { pStyleColor = false; runColor = null; runStyleColor = false; runMark = false }
    else if (t === '</w:p>') { if (pendingSectionBreak) { pendingSectionBreak = false; if (trackPages && !hasLRPB) { bump(); explicitBreaks++ } } }
    else if (t === '<w:pPr>') inPPr = true
    else if (t === '</w:pPr>') inPPr = false
    else if (t.startsWith('<w:r ') || t === '<w:r>') { inRun = true; runColor = null; runStyleColor = false; runMark = false }
    else if (t === '</w:r>') inRun = false
    else if (t === '<w:rPr>') inRPr = true
    else if (t === '</w:rPr>') inRPr = false
    else if (t === '<w:tcPr>') inTcPr = true
    else if (t === '</w:tcPr>') inTcPr = false
    else if (t.startsWith('<w:lastRenderedPageBreak')) { if (trackPages) bump() }
    else if (t.startsWith('<w:br')) { if (trackPages && !hasLRPB && attr(t, 'w:type') === 'page') { bump(); explicitBreaks++ } }
    else if (t.startsWith('<w:pageBreakBefore')) { if (trackPages && !hasLRPB && !['0', 'false'].includes(attr(t, 'w:val'))) { bump(); explicitBreaks++ } }
    else if (t.startsWith('<w:sectPr')) {
      const pg = /<w:pgSz\b[^>]*>/.exec(t)
      if (pg) { const w = parseInt(attr(pg[0], 'w:w'), 10), h = parseInt(attr(pg[0], 'w:h'), 10); if (w > 0 && h > 0) pgSz = { w, h } }
      // sectPr dentro de un párrafo = fin de sección (el siguiente contenido va en otra hoja,
      // salvo sección continua). El último sectPr del documento es el del cuerpo: no cuenta.
      if (inPPr && m.index !== lastSectIndex && !/<w:type\s+w:val="continuous"/.test(t)) pendingSectionBreak = true
    }
    else if (t.startsWith('<w:drawing') || t.startsWith('<w:pict')) {
      const info = drawingInfo(t, t.startsWith('<w:pict'))
      const pg = at(trackPages ? page : 0)
      if (info.image) { pg.image = true; pg.area += info.area }
      else if (info.color) pg.color = true
    }
    else if (inPPr && inRPr) { /* propiedades de la marca de párrafo: no se imprimen como texto */ }
    else if (t.startsWith('<w:pStyle')) { pStyleColor = styleIsColor(attr(t, 'w:val')) }
    else if (t.startsWith('<w:rStyle')) { runStyleColor = styleIsColor(attr(t, 'w:val')) }
    else if (t.startsWith('<w:color')) { if (inRun || inRPr) runColor = isColorHex(attr(t, 'w:val')) }
    else if (t.startsWith('<w:highlight')) { if (!GRAY_HIGHLIGHT.has(attr(t, 'w:val') ?? 'none')) runMark = true }
    else if (t.startsWith('<w:shd')) {
      const fill = attr(t, 'w:fill')
      if (isColorHex(fill)) {
        if (inRun && inRPr) runMark = true      // sombreado del texto: cuenta si hay texto
        else at(trackPages ? page : 0).color = true // párrafo / celda / tabla: se imprime aunque no haya texto
      }
    }
    else if (t.startsWith('<w:t')) {
      const text = t.replace(/^<w:t(?:\s[^>]*)?>/, '')
      if (text.trim() !== '' && ((runColor ?? (runStyleColor || pStyleColor)) || runMark)) at(trackPages ? page : 0).color = true
    }
    if (page > maxPage) maxPage = page
  }
  return { pages, maxPage, pgSz, hasBreakInfo: hasLRPB || explicitBreaks > 0 }
}

export async function analyzeDocx(file) {
  try {
    if (!/\.docx$/i.test(file.name)) return { status: 'failed' }
    const { unzipSync } = await import('fflate')
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { status: 'failed' } // no es un zip
    const wanted = /^(word\/(document|styles|header\d*|footer\d*)\.xml|docProps\/app\.xml)$/
    const parts = unzipSync(bytes, { filter: (f) => wanted.test(f.name) && f.originalSize <= MAX_PART_BYTES })
    const dec = new TextDecoder('utf-8')
    const text = (name) => parts[name] ? dec.decode(parts[name]) : null
    const docXml = text('word/document.xml')
    if (!docXml) return { status: 'failed' }

    const body = scanXml(docXml, styleColors(text('word/styles.xml')), true)

    // Encabezados y pies: lo que lleven se imprime en TODAS las hojas.
    const hf = { image: false, area: 0, color: false }
    for (const name of Object.keys(parts)) {
      if (!/^word\/(header|footer)\d*\.xml$/.test(name)) continue
      const r = scanXml(dec.decode(parts[name]), styleColors(text('word/styles.xml')), false).pages.get(0)
      if (r) { hf.image ||= r.image; hf.area += r.area; hf.color ||= r.color }
    }

    const app = text('docProps/app.xml')
    const appPages = app ? parseInt(/<Pages>(\d+)<\/Pages>/.exec(app)?.[1] ?? '', 10) : NaN
    let n = appPages > 0 ? appPages : (body.hasBreakInfo ? body.maxPage + 1 : null)
    if (n == null) return { status: 'failed', reason: 'no_page_info' } // sin datos de hojas: no se adivina
    n = Math.max(n, body.maxPage + 1)
    if (n > MAX_PAGES) return { status: 'skipped', reason: 'too_many_pages' }

    const sz = body.pgSz ?? { w: 12240, h: 15840 }
    const pageArea = (sz.w * EMU_PER_TWIP) * (sz.h * EMU_PER_TWIP)
    const pages = []
    for (let i = 0; i < n; i++) {
      const b = body.pages.get(i)
      const image = !!(b?.image) || hf.image
      const area = (b?.area ?? 0) + (hf.image ? hf.area : 0)
      pages.push({
        image,
        // Imagen sin medida legible (VML raro): se trata como mínima, nunca como cero.
        ratio: image ? Math.min(1, Math.max(area, 1) / pageArea) : 0,
        color: !!(b?.color) || hf.color,
      })
    }
    return { status: 'done', approx: true, pages }
  } catch (err) {
    console.warn('No se pudo analizar el Word:', err)
    return { status: 'failed' }
  }
}
