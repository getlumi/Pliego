import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { serviceLabel, serviceIcon } from '../lib/services'
import { calculateOrderTotal } from '../lib/pricing'
import { renderPdfFirstPageThumbnail } from '../lib/pdfThumbnail'
import IneCapture from './IneCapture'
import DocumentScanner from './DocumentScanner'
import { CARTA_H, MARGIN, pageSize, frameBoxSize, packImagesIntoPages, slotRect } from '../lib/imageFraming'
import { analyzePdfPages } from '../lib/pdfPageAnalysis'
import { formatPageRanges, TIER_LABEL } from '../lib/pageBreakdown'
import {
  FRAME_TO_SERVICE_TYPE, isImageFile, isImageOrBnService, colorModeOfService,
  materialOfService, resolveImageService, pickDefaultService,
} from '../lib/imageService'

// La caja de "ajustes especiales con IA" está temporalmente oculta:
// por ahora la app solo soporta documentos ya listos para imprimir.
// Cambiar a true cuando esté lista la función completa.
const AI_INSTRUCTIONS_ENABLED = false

function fileIcon(file) {
  if (file.type.startsWith('image/')) return null // se muestra preview real
  if (file.type === 'application/pdf') return 'ti-file-type-pdf'
  if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) return 'ti-file-type-doc'
  return 'ti-file'
}

// Cuenta páginas reales para PDF; 1 para imágenes; no-auto (editable) para el resto.
async function detectPageCount(file) {
  if (file.type.startsWith('image/')) return { pageCount: 1, pageCountAuto: true }
  if (file.type === 'application/pdf') {
    try {
      const { PDFDocument } = await import('pdf-lib')
      const bytes = await file.arrayBuffer()
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
      return { pageCount: pdf.getPageCount(), pageCountAuto: true }
    } catch {
      return { pageCount: 1, pageCountAuto: false }
    }
  }
  return { pageCount: 1, pageCountAuto: false } // Word u otros: el usuario puede ajustar
}

export default function UploadPage({ session, onNavigate, draft, onUpdateDraft, onClearDraft }) {
  const { files, orientation, fit, copies, instructions, activeIndex, shopId, containsId } = draft
  const [shop, setShop] = useState(null)
  const [loadingShop, setLoadingShop] = useState(true)
  const [serviceListOpen, setServiceListOpen] = useState(false) // colapsado por default — la lista es larga
  const [justSent, setJustSent] = useState(false)
  const [showIneCapture, setShowIneCapture] = useState(false)
  const [showDocScanner, setShowDocScanner] = useState(false)
  const fileInputRef = useRef(null)

  const handleIneDone = (file, previewUrl) => {
    setShowIneCapture(false)
    onUpdateDraft({
      files: [...files, { file, previewUrl: previewUrl ?? null, pageCount: 1, pageCountAuto: false, serviceId: null }],
      containsId: true,
    })
  }

  const handleScanDone = (file, pageCount, previewUrl) => {
    setShowDocScanner(false)
    onUpdateDraft({
      files: [...files, { file, previewUrl: previewUrl ?? null, pageCount, pageCountAuto: true, serviceId: null }],
    })
  }

  const sendInstruction = () => {
    setJustSent(true)
    setTimeout(() => setJustSent(false), 2500)
  }

  useEffect(() => {
    if (!shopId) { setLoadingShop(false); return }
    setLoadingShop(true)
    supabase.from('printshops').select('name, printshop_services(*)').eq('id', shopId).maybeSingle()
      .then(({ data }) => {
        setShop(data)
        const enabled = (data?.printshop_services ?? []).filter(s => s.enabled)
        // Cada archivo trae su PROPIO serviceId ahora — este default
        // aplica a cualquier archivo que aún no tenga uno válido para
        // esta papelería, uno por uno, no solo a "el" pedido.
        if (enabled.length > 0) {
          const needsDefault = files.some(f => !enabled.some(s => s.id === f.serviceId))
          if (needsDefault) {
            // Las IMÁGENES entran como Color en hoja completa (no como el
            // primer servicio de la lista) — ver imageService.js.
            const anyFrames = enabled.some(s => ['color_imagen_cuarto', 'color_imagen_medio', 'color_imagen_completa'].includes(s.service_type))
            const copy = files.map(f =>
              enabled.some(s => s.id === f.serviceId) ? f : { ...f, serviceId: pickDefaultService(f, enabled, anyFrames)?.id ?? enabled[0].id }
            )
            onUpdateDraft({ files: copy })
          }
        }
        setLoadingShop(false)
      })
  }, [shopId])

  const handleFiles = async (e) => {
    const list = Array.from(e.target.files ?? [])
    if (list.length === 0) return
    const mapped = await Promise.all(list.map(async file => {
      const { pageCount, pageCountAuto } = await detectPageCount(file)
      let previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      if (!previewUrl && file.type === 'application/pdf') {
        // Miniatura real de la primera página — si falla por cualquier
        // motivo (PDF dañado, protegido con contraseña, etc.) se
        // degrada solo al ícono genérico que ya existía, sin tronar la
        // subida del archivo.
        try {
          previewUrl = await renderPdfFirstPageThumbnail(file)
        } catch (err) {
          console.warn('No se pudo generar miniatura de PDF:', err)
        }
      }
      return {
        file, previewUrl,
        pageCount, pageCountAuto, serviceId: null,
      }
    }))
    // Cada archivo nuevo entra YA con su servicio (imagen → Color, hoja
    // completa): sin esto, el precio usaba el primer servicio de la
    // lista hasta que alguien tocaba la miniatura.
    const withService = mapped.map(m => {
      const svc = pickDefaultService(m, enabledServices, anyImageFrameOffered)
      return {
        ...m, serviceId: svc?.id ?? m.serviceId ?? null,
        ...(isImageFile(m) ? { colorMode: colorModeOfService(svc) } : {}),
        // PDF: se revisa hoja por hoja (imágenes/color) en segundo plano.
        ...(m.file.type === 'application/pdf' ? { pageAnalysis: { status: 'pending' } } : {}),
      }
    })
    onUpdateDraft({ files: [...files, ...withService] })
    // El resultado llega después: se guarda con la forma de FUNCIÓN para no
    // pisar lo que la persona haya cambiado mientras tanto. Tope de 45 s:
    // si no termina, se sigue como siempre (hojas × precio del tipo).
    withService.filter(m => m.file.type === 'application/pdf').forEach(m => {
      const timeout = new Promise(resolve => setTimeout(() => resolve({ status: 'failed' }), 45000))
      Promise.race([analyzePdfPages(m.file), timeout]).then(result => {
        onUpdateDraft(d => ({ files: d.files.map(f => f.file === m.file ? { ...f, pageAnalysis: result } : f) }))
      })
    })
    e.target.value = ''
  }

  const removeFile = (idx) => {
    const copy = [...files]
    if (copy[idx].previewUrl) URL.revokeObjectURL(copy[idx].previewUrl)
    copy.splice(idx, 1)
    const newActive = Math.max(0, activeIndex >= idx ? activeIndex - 1 : activeIndex)
    const stillHasId = copy.some(f => f.file.name === 'identificacion.pdf')
    onUpdateDraft({ files: copy, activeIndex: newActive, containsId: stillHasId })
  }

  const setFilePageCount = (idx, pageCount) => {
    const copy = files.map((f, i) => i === idx ? { ...f, pageCount: Math.max(1, pageCount) } : f)
    onUpdateDraft({ files: copy })
  }

  const groupFileInputRef = useRef(null)

  // Agrega OTRA imagen al mismo grupo que el archivo activo — comparten
  // hoja en el PDF final (motor ya probado de extremo a extremo en
  // imageFraming.js/sendOrder.js). Si el archivo activo aún no tenía
  // groupId, se le asigna uno nuevo aquí, compartido con la imagen que
  // se está agregando.
  const handleAddToGroup = async (e) => {
    const list = Array.from(e.target.files ?? [])
    if (list.length === 0) return
    const file = list[0]
    const { pageCount, pageCountAuto } = await detectPageCount(file)
    const groupId = activeFile.groupId ?? crypto.randomUUID()
    // La imagen nueva hereda Color/B/N y material (Bond/Opalina) de la
    // hoja que ya existe — una hoja física no puede ser mitad y mitad.
    const activeSvc = enabledServices.find(s => s.id === activeFile.serviceId)
    const inherited = isImageOrBnService(activeSvc)
      ? resolveImageService(enabledServices, { material: materialOfService(activeSvc), colorMode: colorModeOfService(activeSvc), frame: 'cuarto' })
      : null
    const newSvc = inherited ?? pickDefaultService({ file, groupId }, enabledServices, anyImageFrameOffered, 'cuarto')
    const newImage = {
      file, previewUrl: URL.createObjectURL(file), pageCount, pageCountAuto,
      groupId, imageFrame: 'cuarto', serviceId: newSvc?.id ?? null, colorMode: colorModeOfService(newSvc),
    }
    const copy = files.map((f, i) => (i === activeIndex && !f.groupId) ? { ...f, groupId } : f)
    onUpdateDraft({ files: [...copy, newImage], activeIndex: copy.length }) // activa la recién agregada
    e.target.value = ''
  }

  const cancelAll = () => {
    if (window.confirm('¿Empezarás de cero? Se perderá el documento que estás editando.')) {
      onClearDraft()
    }
  }

  const enabledServices = shop?.printshop_services?.filter(s => s.enabled) ?? []

  // Solo se muestra el control de encuadre si la papelería elegida
  // realmente ofrece al menos uno de los 3 tamaños de imagen — puede
  // variar de una papelería a otra, como se pidió explícitamente.
  const imageFrameServicesOffered = {
    cuarto:   enabledServices.some(s => s.service_type === 'color_imagen_cuarto'),
    medio:    enabledServices.some(s => s.service_type === 'color_imagen_medio'),
    completa: enabledServices.some(s => s.service_type === 'color_imagen_completa'),
  }
  const anyImageFrameOffered = Object.values(imageFrameServicesOffered).some(Boolean)

  const activeFile = files[activeIndex]
  const activeIsImage = activeFile?.file?.type?.startsWith('image/')

  // Tamaño de imagen × material de la hoja × Color/B/N — la regla vive
  // en lib/imageService.js (un solo lugar). Si la papelería no ofrece la
  // combinación exacta (ej. Opalina 1/4 de hoja), se cae de vuelta a la
  // versión en Bond, para nunca dejar seleccionado un servicio que no
  // corresponde.
  const materialOf = materialOfService

  // ¿La papelería ofrece Opalina en AL MENOS un tamaño? Si no, el botón
  // de material ni siquiera se muestra — "solo tendrán la opción de
  // opalina si el negocio la habilita".
  const anyOpalinaImageOffered = enabledServices.some(s => Object.values(FRAME_TO_SERVICE_TYPE.opalina).includes(s.service_type) || s.service_type === 'opalina_bn')

  // Efecto único para TODAS las imágenes del borrador (no solo la
  // activa) — 13/10/2026, reporte real: al agregar una 2ª imagen el
  // precio salía como el del primer servicio de la lista (un B/N de $1)
  // hasta tocar la miniatura; si se enviaba directo, se cobraba mal.
  //  (1) Toda imagen sin servicio válido entra como COLOR en su tamaño
  //      por defecto (completa; 1/4 si comparte hoja).
  //  (2) f.colorMode ('color' | 'bn') SIEMPRE refleja el servicio
  //      elegido — lo usan el preview (grises) y el PDF (sendOrder.js).
  // Es idempotente: solo actualiza si algo realmente cambia (sin bucles).
  useEffect(() => {
    if (enabledServices.length === 0) return
    const next = files.map(f => {
      if (!isImageFile(f)) return f
      let nf = f
      const svc = enabledServices.find(s => s.id === f.serviceId)
      if (!svc || (anyImageFrameOffered && !isImageOrBnService(svc))) {
        const d = pickDefaultService(f, enabledServices, anyImageFrameOffered)
        if (d && d.id !== f.serviceId) nf = { ...nf, serviceId: d.id }
      }
      const cm = colorModeOfService(enabledServices.find(s => s.id === nf.serviceId))
      if (nf.colorMode !== cm) nf = { ...nf, colorMode: cm }
      return nf
    })
    if (next.some((nf, i) => nf !== files[i])) onUpdateDraft({ files: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, shop, anyImageFrameOffered])

  // Identificación — mismo patrón, pero sin importar el ORDEN en que
  // pasen las cosas: da igual si primero se elige la papelería y luego
  // se agrega la identificación, o al revés (botón central "Imprimir"
  // primero) — este efecto corre cada vez que cambia containsId O la
  // papelería/sus servicios, así que siempre termina seleccionando el
  // precio de identificación correcto en cuanto ambas cosas existen.
  useEffect(() => {
    if (!containsId) return
    const idService = enabledServices.find(s => s.service_type === 'identificacion_2_lados')
    if (!idService) return
    // Apunta al archivo de identificación específico por nombre — no al
    // "archivo activo" en general, porque pueden ser archivos distintos
    // (ej. el usuario está viendo otra foto cuando esto corre).
    const idFileIndex = files.findIndex(f => f.file.name === 'identificacion.pdf')
    if (idFileIndex === -1) return
    if (files[idFileIndex].serviceId === idService.id) return
    const copy = files.map((f, i) => i === idFileIndex ? { ...f, serviceId: idService.id } : f)
    onUpdateDraft({ files: copy })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containsId, shop?.id])

  // Archivos que se ven afectados por Color/B/N y Bond/Opalina: la HOJA
  // física completa — si la imagen activa comparte hoja con otras, todas.
  const activeTargets = !activeFile ? [] : activeFile.groupId ? files.filter(f => f.groupId === activeFile.groupId) : [activeFile]
  const frameOf = (f) => f.imageFrame ?? (f.groupId ? 'cuarto' : 'completa')

  // Servicio que le tocaría a CADA archivo de `targets` con el cambio
  // pedido (material y/o colorMode; lo no indicado se conserva). Todo o
  // nada: si a uno solo no le corresponde un servicio que la papelería
  // ofrezca, devuelve null y no se cambia nada (nunca media hoja en
  // Opalina y media en Bond).
  const resolveForTargets = (targets, { colorMode, material }) => {
    const out = new Map()
    for (const t of targets) {
      const tSvc = enabledServices.find(s => s.id === t.serviceId)
      const svc = resolveImageService(enabledServices, {
        material: material ?? materialOf(tSvc),
        colorMode: colorMode ?? colorModeOfService(tSvc),
        frame: frameOf(t), strict: true,
      })
      if (!svc) return null
      out.set(t, svc)
    }
    return out
  }
  const applyResolved = (resolved) => {
    onUpdateDraft({ files: files.map(f => resolved.has(f) ? { ...f, serviceId: resolved.get(f).id, colorMode: colorModeOfService(resolved.get(f)) } : f) })
  }

  const setImageFrame = (frame) => {
    // Cambiar de tamaño MANTIENE material (Bond/Opalina) y Color/B/N —
    // solo cambia el tamaño (y el precio, si es a color). En B/N el
    // servicio es el mismo para cualquier tamaño.
    const currentService = enabledServices.find(s => s.id === activeFile.serviceId)
    const matchingService = resolveImageService(enabledServices, {
      material: materialOf(currentService), colorMode: colorModeOfService(currentService), frame,
    })
    const copy = files.map((f, i) => i === activeIndex
      ? { ...f, imageFrame: frame, serviceId: matchingService ? matchingService.id : f.serviceId, ...(matchingService ? { colorMode: colorModeOfService(matchingService) } : {}) }
      : f)
    onUpdateDraft({ files: copy })
  }

  // Botón Bond/Opalina. El material es de la HOJA FÍSICA: si la imagen
  // activa comparte hoja, cambia para todas a la vez, cada una a la
  // versión de su propio tamaño (y manteniendo Color/B/N).
  const setMaterial = (material) => {
    const resolved = resolveForTargets(activeTargets, { material })
    if (resolved) applyResolved(resolved)
  }

  // Botón Color / B/N (13/10/2026). B/N = hoja B/N normal del material
  // (bn_bond / opalina_bn), sin importar el tamaño. Aplica a toda la hoja
  // compartida. Si Opalina no ofrece esa variante, se pasa a Bond (el
  // botón HOJA lo deja ver) — siempre toda la hoja junta.
  const colorModeResolved = (mode) =>
    resolveForTargets(activeTargets, { colorMode: mode }) ?? resolveForTargets(activeTargets, { colorMode: mode, material: 'bond' })
  const setColorMode = (mode) => {
    const resolved = colorModeResolved(mode)
    if (resolved) applyResolved(resolved)
  }

  // "Todo en B/N" / "Color" para un DOCUMENTO analizado hoja por hoja.
  const setDocColorMode = (mode) => {
    onUpdateDraft({ files: files.map((f, i) => i === activeIndex ? { ...f, docColorMode: mode } : f) })
  }

  const setImageAlign = (align) => {
    const copy = files.map((f, i) => i === activeIndex ? { ...f, imageAlign: align } : f)
    onUpdateDraft({ files: copy })
  }

  // Rota la foto DENTRO de la hoja (no cambia Vertical/Horizontal, que es
  // la hoja en sí) — cada clic avanza 90°, ciclo de 4 hasta volver a 0.
  // Solo cambia un número (imageRotation); el giro real de píxeles para
  // el PDF final se hace una sola vez al enviar, en sendOrder.js — aquí
  // solo se ve con CSS, para que el botón se sienta instantáneo.
  const rotateImage = () => {
    const current = activeFile.imageRotation ?? 0
    const next = (current + 90) % 360
    const copy = files.map((f, i) => i === activeIndex ? { ...f, imageRotation: next } : f)
    onUpdateDraft({ files: copy })
  }
  const { totalPages, total, items: priceItems, selectedService, physicalSheets } = calculateOrderTotal({
    files, services: enabledServices, copies,
  })

  // "totalPages" (para el precio) cuenta 1 por CADA imagen, aunque
  // varias compartan una misma hoja física — correcto para sumar el
  // costo, pero engañoso si se le muestra al usuario como "hojas".
  // "physicalSheets" es el número real de hojas que va a salir de la
  // impresora (dos imágenes en la misma hoja = 1 hoja física) — esto es
  // lo que debe verse en pantalla en cualquier lugar que diga "hojas" o
  // "impresiones".
  const pageWord = physicalSheets === 1 ? 'hoja' : 'hojas'
  const copyWord = copies === 1 ? 'copia' : 'copias'

  const continuar = () => onNavigate('home')

  return (
    <div className="page">
      <div style={{ background: 'var(--gradient-dark)', padding: '48px 20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>Subir documento</p>
        {files.length > 0 && (
          <button onClick={cancelAll} aria-label="Cancelar y empezar de cero" style={{
            width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <i className="ti ti-x" style={{ fontSize: 16, color: '#fff' }} />
          </button>
        )}
      </div>

      <div className="scroll-content">

        {/* Papelería elegida (o aviso si falta) */}
        {!shopId ? (
          <div className="card" style={{ display:'flex', gap:10, alignItems:'center', background:'var(--red-light)', border:'1px solid #F09595' }}>
            <i className="ti ti-alert-circle" style={{ fontSize:20, color:'var(--red)' }} />
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'var(--red)' }}>Falta elegir tu papelería</p>
              <p style={{ fontSize:12, color:'var(--text-secondary)' }}>Necesitamos saber dónde vas a imprimir para mostrarte precios.</p>
            </div>
            <button onClick={() => onNavigate('home')} className="btn-outline" style={{ padding:'8px 12px', fontSize:13 }}>Elegir</button>
          </div>
        ) : (
          <div className="card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', border:'1.5px solid var(--green)', background:'var(--green-light)' }}>
            <span style={{ fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
              <i className="ti ti-building-store" style={{ fontSize:16, color:'var(--green)' }} />
              {shop?.name ?? 'Cargando...'}
            </span>
            <button onClick={() => onNavigate('home')} style={{ background:'none', border:'none', color:'var(--green)', fontSize:12, fontWeight:700, cursor:'pointer', textDecoration:'underline' }}>
              Cambiar
            </button>
          </div>
        )}

        {/* Caja grande clicable */}
        <div
          role="button" tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
          className="card" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center', padding: 32, cursor: 'pointer',
            border: '2px dashed var(--border)', position: 'relative',
          }}>
          <i className="ti ti-upload" style={{ fontSize: 40, color: 'var(--green)', marginBottom: 8 }} />
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
            {files.length === 0 ? 'Toca para elegir tu archivo' : 'Toca para agregar más archivos'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>PDF, DOCX, JPG o PNG</p>
          <input
            ref={fileInputRef} type="file"
            accept=".pdf,.docx,.jpg,.jpeg,.png" multiple
            onChange={handleFiles}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
          />
        </div>

        <button
          onClick={() => setShowIneCapture(true)}
          className="card"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
            border: '1.5px solid var(--border)', cursor: 'pointer', width: '100%', textAlign: 'left',
            background: '#fff',
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: 'var(--accent-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <i className="ti ti-id-badge-2" style={{ fontSize: 20, color: '#16803C' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700 }}>Agregar identificación (frente y reverso)</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Toma la foto con la cámara — armamos el documento por ti</p>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 18, color: 'var(--text-muted)' }} />
        </button>

        <button
          onClick={() => setShowDocScanner(true)}
          className="card"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
            border: '1.5px solid var(--border)', cursor: 'pointer', width: '100%', textAlign: 'left',
            background: '#fff',
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: '#EEF2FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <i className="ti ti-scan" style={{ fontSize: 20, color: '#4F46E5' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700 }}>Escanea tu documento aquí</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Para cualquier hoja: contratos, recibos, tareas — una o varias páginas</p>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 18, color: 'var(--text-muted)' }} />
        </button>

        {files.length > 0 && (
          <>
            {/* Precio en vivo */}
            <div className="card" style={{ background: 'var(--gradient-dark)' }}>
              {!shopId ? (
                <p style={{ fontSize:13, color:'rgba(255,255,255,0.8)', textAlign:'center' }}>
                  Elige una papelería para ver el precio
                </p>
              ) : !selectedService ? (
                <p style={{ fontSize:13, color:'rgba(255,255,255,0.8)', textAlign:'center' }}>
                  Esta papelería no tiene tipos de impresión disponibles
                </p>
              ) : (
                <>
                  {(() => {
                    // Si todos los archivos tienen el mismo precio por
                    // hoja (el caso normal de hoy, un solo archivo),
                    // se ve simple como siempre. Solo se muestra el
                    // desglose cuando de verdad hay precios distintos
                    // entre archivos del mismo pedido.
                    const distinctPrices = new Set(priceItems.map(it => it.pricePerSheet))
                    // Documentos con detalle por hoja (imágenes/color): una
                    // línea por tipo de hoja, con su subtotal.
                    if (priceItems.some(it => it.breakdown)) {
                      const lineName = (l) => l.kind === 'image'
                        ? `con imagen${l.tier ? ' · ' + TIER_LABEL[l.tier] : ''}`
                        : l.kind === 'color_text' ? 'texto a color' : 'B/N'
                      const row = (k, a, b) => (
                        <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'rgba(255,255,255,0.65)', marginBottom:2 }}>
                          <span>{a}</span><span>{b}</span>
                        </div>
                      )
                      return (
                        <div style={{ marginBottom: 6 }}>
                          {priceItems.map((it, i) => (
                            <div key={i} style={{ marginBottom: 4 }}>
                              {priceItems.length > 1 && (
                                <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.85)', marginBottom:2 }}>Archivo {i + 1}</div>
                              )}
                              {it.breakdown
                                ? it.breakdown.lines.map((l, j) => row(`${i}-${j}`, `${l.count} ${l.count === 1 ? 'hoja' : 'hojas'} ${lineName(l)}`, `$${(l.price * l.count).toFixed(2)}`))
                                : row(`${i}-x`, `${it.pages} ${it.pages === 1 ? 'hoja' : 'hojas'} × $${it.pricePerSheet.toFixed(2)}`, `$${(it.pricePerSheet * it.pages).toFixed(2)}`)}
                            </div>
                          ))}
                        </div>
                      )
                    }
                    if (distinctPrices.size > 1) {
                      return (
                        <div style={{ marginBottom: 6 }}>
                          {priceItems.map((it, i) => (
                            <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'rgba(255,255,255,0.65)', marginBottom:2 }}>
                              <span>Archivo {i + 1} ({it.pages} {it.pages === 1 ? 'hoja' : 'hojas'})</span>
                              <span>${it.pricePerSheet.toFixed(2)}/hoja</span>
                            </div>
                          ))}
                        </div>
                      )
                    }
                    return (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                        <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>Precio por hoja</span>
                        <span style={{ fontSize:16, fontWeight:700, color:'#fff' }}>${(priceItems[0]?.pricePerSheet ?? 0).toFixed(2)}</span>
                      </div>
                    )
                  })()}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>{physicalSheets} {pageWord} × {copies} {copyWord}</span>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>{physicalSheets * copies} impresiones</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', paddingTop:8, borderTop:'1px solid rgba(255,255,255,0.15)' }}>
                    <span style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Total</span>
                    <span style={{ fontSize:24, fontWeight:900, color:'#fff' }}>${total.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Tipo de impresión (de la papelería elegida) — colapsado por
                default; la lista puede tener muchas opciones y no hace
                falta verlas todas si ya hay una elegida. El encabezado
                siempre muestra la selección actual, aunque esté cerrado.
                Para FOTOS con tamaño (cuarto/media/completa), esta lista
                se ESCONDE por completo — es la causa real de un bug real
                (reporte 08/09/2026): elegir aquí manualmente para una
                sola imagen de un grupo rompía la regla de "toda la hoja
                comparte el mismo material", porque esta lista nunca supo
                de grupos. La única forma correcta de elegir tipo para
                una foto es el tamaño + el botón Bond/Opalina — ambos ya
                sí respetan el grupo completo. */}
            {shopId && !(activeIsImage && anyImageFrameOffered) && (
              <div className="card">
                <button
                  onClick={() => setServiceListOpen(o => !o)}
                  style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    width:'100%', background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left',
                  }}
                >
                  <div>
                    <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>TIPO DE IMPRESIÓN</p>
                    {(() => {
                      // El encabezado muestra el tipo del ARCHIVO ACTIVO
                      // específicamente (no un resumen de todo el
                      // pedido) — importante en cuanto haya más de un
                      // archivo con precios distintos entre sí.
                      const activeFileService = enabledServices.find(s => s.id === activeFile.serviceId)
                      return activeFileService && (
                        <p style={{ fontSize:14, fontWeight:700, marginTop:2 }}>
                          {serviceLabel(activeFileService)} · <span style={{ color:'var(--green)' }}>${activeFileService.price_per_sheet}/hoja</span>
                        </p>
                      )
                    })()}
                  </div>
                  <i className={`ti ${serviceListOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize:20, color:'var(--text-secondary)', flexShrink:0 }} />
                </button>

                {serviceListOpen && (
                  <div style={{ marginTop:12 }}>
                    {loadingShop ? (
                      <p style={{ fontSize:13, color:'var(--text-muted)' }}>Cargando opciones...</p>
                    ) : enabledServices.length === 0 ? (
                      <p style={{ fontSize:13, color:'var(--text-muted)' }}>Esta papelería no configuró tipos de impresión todavía.</p>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {enabledServices.map(s => (
                          <button key={s.id} onClick={() => {
                            const copy = files.map((f, i) => i === activeIndex ? { ...f, serviceId: s.id } : f)
                            onUpdateDraft({ files: copy })
                            setServiceListOpen(false)
                          }} style={{
                            display:'flex', alignItems:'center', gap:10,
                            border: s.id === activeFile.serviceId ? '1.5px solid var(--green)' : '1px solid var(--border)',
                            background: s.id === activeFile.serviceId ? 'var(--green-light)' : '#fff',
                            borderRadius:'var(--radius-md)', padding:'10px 12px', cursor:'pointer', textAlign:'left',
                          }}>
                            <i className={`ti ${serviceIcon(s)}`} style={{ fontSize:18, color: s.id === activeFile.serviceId ? 'var(--green)' : 'var(--text-secondary)' }} />
                            <span style={{ flex:1, fontSize:14, fontWeight: s.id === activeFile.serviceId ? 700 : 500 }}>{serviceLabel(s)}</span>
                            <span style={{ fontSize:13, fontWeight:700, color: s.id === activeFile.serviceId ? 'var(--green)' : 'var(--text-secondary)' }}>${s.price_per_sheet}/hoja</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Vista previa grande centrada */}
            <div className="card">
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-files" style={{ fontSize: 16, color: 'var(--green)' }} />
                {files.length} archivo{files.length > 1 ? 's' : ''} · {physicalSheets} {pageWord} en total
              </p>

              {/* Página grande — SIEMPRE hoja Carta real, respetando el
                  botón Vertical/Horizontal. Si es una foto con tamaño
                  elegido, lo que cambia es la CAJA de la imagen dentro
                  de esa misma hoja (nunca la hoja en sí) — cuarto/media/
                  completa son fracciones de área, así que siempre se
                  ven distintas entre sí sin importar la orientación de
                  la foto que se suba. */}
              {(() => {
                const showFramedPreview = activeIsImage && anyImageFrameOffered
                const previewScale = 220 / CARTA_H // misma escala base siempre
                const page = pageSize(orientation)
                const pageW = page.w * previewScale
                const pageH = page.h * previewScale

                // Rotación elegida con el botón "Girar" — solo aplica a
                // fotos, nunca a documentos. Solo es visual aquí (CSS);
                // el giro real de píxeles para el PDF pasa una sola vez
                // al enviar, en sendOrder.js (misma lógica, sin duplicar).
                const rot = activeIsImage ? (activeFile.imageRotation ?? 0) : 0
                const swapped = rot === 90 || rot === 270

                // Si el archivo activo comparte hoja con otros (groupId),
                // se calcula EXACTAMENTE el mismo acomodo que va a usar
                // el PDF final (mismo packImagesIntoPages/slotRect que
                // sendOrder.js) — así lo que se ve aquí es lo que sale
                // impreso, letra por letra, no una aproximación.
                let groupLayout = null
                if (activeFile.groupId) {
                  const members = files
                    .map((f, i) => ({ f, i }))
                    .filter(({ f }) => f.groupId === activeFile.groupId)
                  const packed = packImagesIntoPages(members.map(({ f }) => ({ frame: f.imageFrame ?? 'cuarto' })))
                  let idx = 0, activePageIndex = 0
                  const pagesWithMembers = packed.map(pageItems => pageItems.map(({ slot }) => {
                    const member = members[idx]; idx++
                    return { ...member, slot }
                  }))
                  pagesWithMembers.forEach((pageItems, pgIdx) => {
                    if (pageItems.some(it => it.i === activeIndex)) activePageIndex = pgIdx
                  })
                  groupLayout = {
                    items: pagesWithMembers[activePageIndex] ?? [],
                    pageIndex: activePageIndex,
                    totalPages: pagesWithMembers.length,
                  }
                }

                let box = null, boxLeft = 0, boxTop = 0
                if (showFramedPreview && !groupLayout) {
                  const rawBox = frameBoxSize(activeFile.imageFrame ?? 'completa', orientation)
                  box = { w: rawBox.w * previewScale, h: rawBox.h * previewScale }
                  const align = activeFile.imageAlign ?? 'centro'
                  const marginPx = MARGIN * previewScale
                  boxLeft = align === 'superior_izquierda' ? marginPx : (pageW - box.w) / 2
                  boxTop = align === 'superior_izquierda' ? marginPx : (pageH - box.h) / 2
                }

                return (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    background: 'var(--bg)', borderRadius: 'var(--radius-md)', padding: 20, marginBottom: 12,
                  }}>
                    {groupLayout && groupLayout.totalPages > 1 && (
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        Hoja {groupLayout.pageIndex + 1} de {groupLayout.totalPages} de este grupo
                      </p>
                    )}
                    <div style={{
                      background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
                      boxShadow: 'var(--shadow-sm)',
                      width: pageW, height: pageH,
                      overflow: 'hidden', transition: 'width 0.2s, height 0.2s', position: 'relative',
                    }}>
                      {groupLayout ? (
                        groupLayout.items.map(({ f, i, slot }) => {
                          const rect = slotRect(slot, orientation)
                          const r = { x: rect.x * previewScale, y: (rect.pageH - rect.y - rect.h) * previewScale, w: rect.w * previewScale, h: rect.h * previewScale }
                          const memberRot = f.imageRotation ?? 0
                          const memberSwapped = memberRot === 90 || memberRot === 270
                          return (
                            <div key={i} onClick={() => onUpdateDraft({ activeIndex: i })} style={{
                              position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h,
                              overflow: 'hidden', cursor: 'pointer',
                              outline: i === activeIndex ? '2px solid var(--green)' : '1px solid var(--border)',
                              outlineOffset: -1,
                            }}>
                              {f.previewUrl && (
                                <img src={f.previewUrl} alt={f.file.name} style={{
                                  position: 'absolute', top: '50%', left: '50%',
                                  width: memberSwapped ? r.h : r.w, height: memberSwapped ? r.w : r.h,
                                  transform: `translate(-50%, -50%) rotate(${memberRot}deg)`,
                                  objectFit: 'contain',
                                  filter: f.colorMode === 'bn' ? 'grayscale(1)' : undefined, // B/N: el preview muestra lo que se imprime
                                }} />
                              )}
                            </div>
                          )
                        })
                      ) : files[activeIndex]?.previewUrl ? (
                        showFramedPreview ? (
                          <div style={{
                            position: 'absolute', left: boxLeft, top: boxTop, width: box.w, height: box.h,
                            overflow: 'hidden',
                          }}>
                            <img src={files[activeIndex].previewUrl} alt={files[activeIndex].file.name}
                              style={{
                                position: 'absolute', top: '50%', left: '50%',
                                // Se piden las dimensiones INVERTIDAS antes de girar
                                // (swapped), para que al rotar 90°/270° el resultado
                                // visual quede exactamente dentro de la caja real —
                                // mismo truco que usa cualquier editor de fotos.
                                width: swapped ? box.h : box.w, height: swapped ? box.w : box.h,
                                transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                                objectFit: 'contain', transition: 'transform 0.2s',
                                filter: activeFile.colorMode === 'bn' ? 'grayscale(1)' : undefined,
                              }} />
                          </div>
                        ) : (
                          <img src={files[activeIndex].previewUrl} alt={files[activeIndex].file.name}
                            style={{
                              position: 'absolute', top: '50%', left: '50%',
                              width: swapped ? pageH : pageW, height: swapped ? pageW : pageH,
                              transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                              objectFit: fit === 'actual' ? 'cover' : 'contain',
                              transition: 'object-fit 0.2s, transform 0.2s',
                              filter: activeFile.colorMode === 'bn' ? 'grayscale(1)' : undefined,
                            }} />
                        )
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                          <i className={`ti ${fileIcon(files[activeIndex]?.file)}`} style={{ fontSize: 40 }} />
                          <p style={{ fontSize: 11, marginTop: 6, padding: '0 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {files[activeIndex]?.file.name}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Aviso sobre orientación */}
              <div style={{
                display: 'flex', gap: 8, alignItems: 'flex-start',
                background: 'var(--green-light)', borderRadius: 'var(--radius-md)',
                padding: '8px 10px', marginBottom: 14,
              }}>
                <i className="ti ti-info-circle" style={{ fontSize: 15, color: 'var(--green)', marginTop: 1, flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Para mejores resultados, intenta tener tu documento listo para imprimir antes de subirlo.
                  Vertical/Horizontal define la orientación de la hoja en la impresora.
                </p>
              </div>

              {/* Miniaturas con número de páginas */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {files.map((f, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <button onClick={() => onUpdateDraft({ activeIndex: idx })} style={{
                      width: 48, height: 60, borderRadius: 6, padding: 0,
                      border: idx === activeIndex ? '2px solid var(--green)' : '1px solid var(--border)',
                      background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', cursor: 'pointer', position:'relative',
                    }}>
                      {f.previewUrl ? (
                        <img src={f.previewUrl} alt={f.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: f.colorMode === 'bn' ? 'grayscale(1)' : undefined }} />
                      ) : (
                        <i className={`ti ${fileIcon(f.file)}`} style={{ fontSize: 18, color: 'var(--text-muted)' }} />
                      )}
                      <span style={{
                        position:'absolute', bottom:0, left:0, right:0,
                        background:'rgba(0,0,0,0.6)', color:'#fff', fontSize:9, fontWeight:700,
                        padding:'1px 0',
                      }}>
                        {f.pageCount ?? 1}p
                      </span>
                    </button>
                    <button onClick={() => removeFile(idx)} aria-label="Quitar archivo" style={{
                      position: 'absolute', top: -5, right: -5,
                      width: 16, height: 16, borderRadius: '50%',
                      background: 'var(--red)', border: '2px solid #fff',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', padding: 0,
                    }}>
                      <i className="ti ti-x" style={{ fontSize: 9 }} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Ajuste manual de páginas para archivos sin conteo automático (Word, etc.) */}
              {files.some(f => !f.pageCountAuto) && (
                <div style={{ marginBottom: 14, padding:'8px 10px', background:'var(--bg)', borderRadius:'var(--radius-md)' }}>
                  <p style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:8 }}>
                    <i className="ti ti-info-circle" style={{ fontSize:12, verticalAlign:-1 }} />{' '}
                    No podemos contar las páginas de estos archivos automáticamente — ajústalo para que el precio sea exacto:
                  </p>
                  {files.map((f, idx) => !f.pageCountAuto && (
                    <div key={idx} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{f.file.name}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <StepperButton icon="ti-minus" onClick={() => setFilePageCount(idx, (f.pageCount ?? 1) - 1)} />
                        <span style={{ fontSize:13, fontWeight:700, minWidth:16, textAlign:'center' }}>{f.pageCount ?? 1}</span>
                        <StepperButton icon="ti-plus" onClick={() => setFilePageCount(idx, (f.pageCount ?? 1) + 1)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Girar — solo para fotos sueltas, nunca documentos (un PDF/Word
                  ya trae su propia orientación fija). Gira la imagen DENTRO
                  de la hoja, sin tocar el botón Vertical/Horizontal de abajo
                  (ese es el tamaño de la hoja, esto es solo el contenido). */}
              {activeIsImage && (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>GIRAR IMAGEN</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {(activeFile.imageRotation ?? 0) === 0 ? 'Posición original' : `${activeFile.imageRotation}°`}
                    </p>
                  </div>
                  <button onClick={rotateImage} aria-label="Girar imagen 90 grados" style={{
                    width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border)',
                    background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    <i className="ti ti-rotate-clockwise" style={{ fontSize: 20 }} />
                  </button>
                </div>
              )}

              {/* Tamaño en la hoja — solo para fotos sueltas, y solo si
                  la papelería elegida realmente ofrece esos tamaños */}
              {activeIsImage && anyImageFrameOffered && (
                <div style={{ marginTop: 14 }}>
                  {(() => {
                    const activeColorMode = colorModeOfService(enabledServices.find(s => s.id === activeFile.serviceId))
                    const colorOk = !!colorModeResolved('color')
                    const bnOk = !!colorModeResolved('bn')
                    return (
                      <>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                          COLOR
                        </p>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                          <ToggleButton active={activeColorMode === 'color'} onClick={() => setColorMode('color')} icon="ti-palette" label="Color" disabled={!colorOk} />
                          <ToggleButton active={activeColorMode === 'bn'} onClick={() => setColorMode('bn')} icon="ti-contrast" label="B/N" disabled={!bnOk} />
                        </div>
                        {!bnOk && (
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                            Esta papelería no ofrece blanco y negro para imágenes.
                          </p>
                        )}
                        {bnOk && activeColorMode === 'bn' && (
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                            Se cobra como una hoja B/N normal, sin importar el tamaño.
                          </p>
                        )}
                        {activeFile.groupId && (
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                            Aplica a toda la hoja compartida.
                          </p>
                        )}
                        <div style={{ height: 6 }} />
                      </>
                    )
                  })()}
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    TAMAÑO EN LA HOJA
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['cuarto', 'medio', 'completa'].filter(f => imageFrameServicesOffered[f]).map(frame => (
                      <ToggleButton
                        key={frame}
                        active={(activeFile.imageFrame ?? 'completa') === frame}
                        onClick={() => setImageFrame(frame)}
                        icon="ti-photo"
                        label={{ cuarto: 'Cuarto', medio: 'Media', completa: 'Completa' }[frame]}
                      />
                    ))}
                  </div>

                  {/* "+" para agregar otra imagen a la MISMA hoja — no
                      tiene sentido si el tamaño elegido es "Completa"
                      (esa siempre va sola, llena la hoja entera). */}
                  {(activeFile.imageFrame ?? 'completa') !== 'completa' && (
                    <div style={{ marginTop: 10 }}>
                      <input type="file" accept="image/*" ref={groupFileInputRef} onChange={handleAddToGroup} style={{ display: 'none' }} />
                      <button onClick={() => groupFileInputRef.current?.click()} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        width: '100%', padding: '8px 10px', fontSize: 12.5, fontWeight: 600,
                        border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-md)',
                        background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
                      }}>
                        <i className="ti ti-plus" style={{ fontSize: 14 }} />
                        Agregar otra imagen a esta hoja
                      </button>
                    </div>
                  )}

                  {/* Indicador del grupo — miniaturas de todas las
                      imágenes que comparten hoja con esta, para que se
                      vea claro que van juntas antes de mandar el pedido. */}
                  {activeFile.groupId && (() => {
                    const groupMembers = files
                      .map((f, i) => ({ f, i }))
                      .filter(({ f }) => f.groupId === activeFile.groupId)
                    return (
                      <div style={{ marginTop: 10, padding: 10, background: 'var(--green-light)', borderRadius: 'var(--radius-md)' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-dark)', marginBottom: 6 }}>
                          <i className="ti ti-layout-grid" style={{ fontSize: 12, verticalAlign: -1, marginRight: 3 }} />
                          {groupMembers.length} imágenes comparten esta hoja
                        </p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {groupMembers.map(({ f, i }) => (
                            <div key={i} onClick={() => onUpdateDraft({ activeIndex: i })} style={{
                              position: 'relative', width: 44, height: 44, borderRadius: 6, overflow: 'hidden',
                              border: i === activeIndex ? '2px solid var(--green)' : '1px solid var(--border)',
                              cursor: 'pointer', flexShrink: 0,
                            }}>
                              <img src={f.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: f.colorMode === 'bn' ? 'grayscale(1)' : undefined }} />
                              <button onClick={(e) => { e.stopPropagation(); removeFile(i) }} style={{
                                position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%',
                                background: 'var(--red)', color: '#fff', border: 'none', fontSize: 10, lineHeight: 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                              }}>×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {anyOpalinaImageOffered && (() => {
                    const material = materialOf(enabledServices.find(s => s.id === activeFile.serviceId))
                    // Si el archivo activo comparte hoja con otros, TODAS
                    // las imágenes del grupo necesitan tener Opalina
                    // disponible (en su Color/B/N y tamaño actual) — no se
                    // puede aplicar a la mitad de una hoja física nada más.
                    const opalinaAvailable = !!resolveForTargets(activeTargets, { material: 'opalina' })
                    return (
                      <>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '12px 0 8px' }}>
                          HOJA
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <ToggleButton active={material === 'bond'} onClick={() => setMaterial('bond')} icon="ti-file" label="Bond" />
                          <ToggleButton
                            active={material === 'opalina'}
                            onClick={() => setMaterial('opalina')}
                            icon="ti-sparkles"
                            label="Opalina"
                            disabled={!opalinaAvailable}
                          />
                        </div>
                        {!opalinaAvailable && (
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                            {activeFile.groupId
                              ? 'Esta papelería no ofrece Opalina para todos los tamaños de esta hoja compartida.'
                              : 'Esta papelería no ofrece Opalina en este tamaño.'}
                          </p>
                        )}
                      </>
                    )
                  })()}

                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '12px 0 8px' }}>
                    ALINEACIÓN
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <ToggleButton
                      active={(activeFile.imageAlign ?? 'centro') === 'centro'}
                      onClick={() => setImageAlign('centro')}
                      icon="ti-layout-align-center"
                      label="Centrada"
                    />
                    <ToggleButton
                      active={activeFile.imageAlign === 'superior_izquierda'}
                      onClick={() => setImageAlign('superior_izquierda')}
                      icon="ti-layout-align-left"
                      label="Superior izq."
                    />
                  </div>
                </div>
              )}

              {/* Detalle HOJA POR HOJA de un documento (PDF): qué hojas llevan
                  imagen o color y cómo se cobran. Solo informa y deja elegir
                  "Todo en B/N"; el precio ya sale de pricing.js. */}
              {!activeIsImage && activeFile?.pageAnalysis && (() => {
                const a = activeFile.pageAnalysis
                const bd = priceItems[activeIndex]?.breakdown
                const box = { marginTop: 14, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg)', border: '1px solid var(--border-light)' }
                if (a.status === 'pending') {
                  return (
                    <div style={box}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        <i className="ti ti-loader-2" style={{ fontSize: 14, verticalAlign: -2, marginRight: 6 }} />
                        Revisando tus hojas (imágenes y color)…
                      </p>
                    </div>
                  )
                }
                if (a.status === 'skipped') {
                  return (
                    <div style={box}>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Documento muy largo: no revisamos hoja por hoja. Se cobra todo como el tipo de impresión elegido.
                      </p>
                    </div>
                  )
                }
                if (a.status !== 'done') return null
                if (!bd) {
                  if (a.pages.some(p => p.image || p.color)) return null // tipo de impresión sin desglose (p. ej. doble carta)
                  return (
                    <div style={box}>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        <i className="ti ti-circle-check" style={{ fontSize: 14, verticalAlign: -2, marginRight: 4 }} />
                        Revisamos tus {a.pages.length} {a.pages.length === 1 ? 'hoja' : 'hojas'}: solo texto, sin imágenes ni color.
                      </p>
                    </div>
                  )
                }
                const lineName = (l) => l.kind === 'image'
                  ? `Con imagen${l.tier ? ' · ' + TIER_LABEL[l.tier] : ''}`
                  : l.kind === 'color_text' ? 'Texto a color' : 'Solo texto B/N'
                return (
                  <div style={{ ...box, background: 'var(--amber-light, #fff8e1)', border: '1.5px solid var(--amber, #f5b301)' }}>
                    <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                      <i className="ti ti-photo-search" style={{ fontSize: 15, verticalAlign: -2, marginRight: 4 }} />
                      {bd.colorPageCount} {bd.colorPageCount === 1 ? 'hoja lleva' : 'hojas llevan'} imagen o color
                    </p>
                    {bd.lines.map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, marginBottom: 3 }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong>{lineName(l)}</strong> · {l.count === 1 ? 'pág.' : 'págs.'} {formatPageRanges(l.pages)}
                        </span>
                        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{l.count} × ${l.price.toFixed(2)}</span>
                      </div>
                    ))}
                    {bd.mode === 'bn' && bd.colorPagesAsBn.length > 0 && (
                      <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Págs. {formatPageRanges(bd.colorPagesAsBn)} tienen imagen o color, pero las imprimirán en blanco y negro.
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <ToggleButton active={bd.mode === 'color'} onClick={() => setDocColorMode('color')} icon="ti-palette" label="Con color" />
                      <ToggleButton active={bd.mode === 'bn'} onClick={() => setDocColorMode('bn')} icon="ti-contrast" label="Todo B/N" />
                    </div>
                    {bd.scanLike && bd.mode === 'color' && (
                      <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 8 }}>
                        Parece un documento escaneado. Si es en blanco y negro, pulsa «Todo B/N» para pagar menos.
                      </p>
                    )}
                    {bd.approx && (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                        Detección aproximada (Word). Para un cobro exacto, guárdalo como PDF.
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* Orientación */}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <ToggleButton active={orientation === 'vertical'} onClick={() => onUpdateDraft({ orientation: 'vertical' })} icon="ti-rectangle-vertical" label="Vertical" />
                <ToggleButton active={orientation === 'horizontal'} onClick={() => onUpdateDraft({ orientation: 'horizontal' })} icon="ti-rectangle" label="Horizontal" />
              </div>

              {/* Ajuste */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <ToggleButton active={fit === 'fit'} onClick={() => onUpdateDraft({ fit: 'fit' })} icon="ti-arrows-maximize" label="Ajustar a hoja" />
                <ToggleButton active={fit === 'actual'} onClick={() => onUpdateDraft({ fit: 'actual' })} icon="ti-arrows-diagonal" label="Tamaño real" />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {fit === 'fit'
                  ? 'El contenido se centra dejando márgenes parejos en la hoja.'
                  : 'El contenido se imprime a su tamaño original, sin reducir.'}
              </p>

              {/* Copias */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Copias</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StepperButton icon="ti-minus" onClick={() => onUpdateDraft({ copies: Math.max(1, copies - 1) })} />
                  <span style={{ fontSize: 15, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{copies}</span>
                  <StepperButton icon="ti-plus" onClick={() => onUpdateDraft({ copies: Math.min(99, copies + 1) })} />
                </div>
              </div>
            </div>

            {/* Comentario para la papelería — SIEMPRE visible, sin IA de
                por medio. Antes esto vivía escondido dentro del bloque de
                IA (abajo), que está apagado con AI_INSTRUCTIONS_ENABLED —
                por eso nunca aparecía en pantalla. Reutiliza el mismo
                draft.instructions, que ya viaja hasta special_instructions
                en sendOrder.js y ya se muestra en el panel de la papelería. */}
            <div className="card">
              <label style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <i className="ti ti-message-circle" style={{ fontSize: 15, color: 'var(--green)' }} />
                Comentario para la papelería (opcional)
              </label>
              <textarea
                value={instructions} onChange={e => onUpdateDraft({ instructions: e.target.value })}
                placeholder="Ej. imprimir solo la página 2, o cualquier detalle que necesiten saber"
                style={{
                  width: '100%', minHeight: 60, resize: 'none', fontSize: 16,
                  padding: '10px 12px', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)', fontFamily: 'inherit',
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                La papelería lo verá junto con tu pedido.
              </p>
            </div>

            {/* Ajustes especiales con IA — escondido por ahora: la app solo soporta
                documentos listos para imprimir. Se reactivará con funciones completas. */}
            {AI_INSTRUCTIONS_ENABLED && (
            <div className="card">
              <label style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <i className="ti ti-sparkles" style={{ fontSize: 15, color: 'var(--green)' }} />
                ¿Algún ajuste especial? (opcional)
              </label>
              <textarea
                value={instructions} onChange={e => onUpdateDraft({ instructions: e.target.value })}
                placeholder="Ej. solo imprime la página 1, o convierte a blanco y negro"
                style={{
                  width: '100%', minHeight: 60, resize: 'none', fontSize: 16,
                  padding: '10px 12px', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)', fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  onClick={sendInstruction}
                  disabled={!instructions.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', fontSize: 13, fontWeight: 700,
                    borderRadius: 'var(--radius-md)', border: 'none', cursor: instructions.trim() ? 'pointer' : 'default',
                    background: instructions.trim() ? 'var(--green)' : 'var(--border)',
                    color: instructions.trim() ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  <i className="ti ti-send" style={{ fontSize: 14 }} />
                  Enviar a la IA
                </button>
              </div>
              {justSent ? (
                <p style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-circle-check-filled" style={{ fontSize: 14 }} />
                  Instrucción enviada — se aplicará antes de imprimir
                </p>
              ) : instructions.trim() && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-sparkles" style={{ fontSize: 13 }} />
                  La IA aplicará esta instrucción antes de imprimir
                </p>
              )}
            </div>
            )}

            {/* Resumen de confirmación */}
            <div className="card" style={{ background: 'var(--green-light)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                <i className="ti ti-printer" style={{ fontSize: 15, verticalAlign: -2, marginRight: 4 }} />
                Vas a imprimir
              </p>
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                <strong>{physicalSheets} {pageWord}</strong>
                {priceItems.some(it => it.breakdown)
                  ? <>, cobradas según lo que lleva cada hoja</>
                  : selectedService ? <>, {serviceLabel(selectedService).toLowerCase()}</> : ''},
                {' '}{copies} {copyWord}
                {fit === 'fit' ? ', ajustado a la hoja' : ', tamaño real'}
                {orientation === 'horizontal' ? ', horizontal' : ''}.
                {selectedService && <> Total: <strong>${total.toFixed(2)}</strong>.</>}
              </p>
            </div>

            {/* Aviso de notificación — verde WhatsApp para que resalte y el
                usuario sepa de antemano que el mensaje va a venir de un
                número nuevo, reduciendo la probabilidad de que lo reporte
                como spam sin reconocerlo */}
            <div className="card" style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#25D36618', border: '1.5px solid #25D366',
            }}>
              <i className="ti ti-brand-whatsapp" style={{ fontSize: 22, color: '#25D366', flexShrink: 0 }} />
              <p style={{ fontSize: 12.5, lineHeight: 1.4, fontWeight: 600, color: '#1A1A1A' }}>
                Te avisaremos por WhatsApp cuando tu pedido esté listo — guarda el número para no perdértelo.
              </p>
            </div>

            <button onClick={continuar} className="btn-primary">
              Listo, continuar
              <i className="ti ti-arrow-right" style={{ fontSize: 16 }} />
            </button>
          </>
        )}

        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          <i className="ti ti-shield-check" style={{ fontSize: 13 }} />
          {containsId
            ? ' Por ser una identificación, tu documento se elimina automáticamente en 24 horas'
            : ' Tu documento se elimina automáticamente en 3 días'}
        </p>
      </div>

      {showIneCapture && (
        <IneCapture onDone={handleIneDone} onCancel={() => setShowIneCapture(false)} />
      )}

      {showDocScanner && (
        <DocumentScanner onDone={handleScanDone} onCancel={() => setShowDocScanner(false)} />
      )}
    </div>
  )
}

function ToggleButton({ active, onClick, icon, label, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      flex: 1, fontSize: 13, padding: '8px 10px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderRadius: 'var(--radius-md)',
      border: active ? '1.5px solid var(--green)' : '1px solid var(--border)',
      background: active ? 'var(--green-light)' : disabled ? 'var(--bg)' : '#fff',
      color: active ? 'var(--green)' : disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
      fontWeight: active ? 700 : 500,
      cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
      opacity: disabled ? 0.55 : 1,
    }}>
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 15 }} />}
      {label}
    </button>
  )
}

function StepperButton({ icon, onClick }) {
  return (
    <button onClick={onClick} aria-label={icon === 'ti-plus' ? 'Aumentar' : 'Disminuir'} style={{
      width: 32, height: 32, padding: 0, borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)', background: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 14 }} />
    </button>
  )
}
