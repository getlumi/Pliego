import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { serviceLabel, serviceIcon } from '../lib/services'
import IneCapture from './IneCapture'
import DocumentScanner from './DocumentScanner'
import { CARTA_H, MARGIN, pageSize } from '../lib/imageFraming'

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
  const { files, orientation, fit, copies, instructions, activeIndex, shopId, serviceId, containsId } = draft
  const [shop, setShop] = useState(null)
  const [loadingShop, setLoadingShop] = useState(true)
  const [justSent, setJustSent] = useState(false)
  const [showIneCapture, setShowIneCapture] = useState(false)
  const [showDocScanner, setShowDocScanner] = useState(false)
  const fileInputRef = useRef(null)

  const handleIneDone = (file, previewUrl) => {
    setShowIneCapture(false)
    onUpdateDraft({
      files: [...files, { file, previewUrl: previewUrl ?? null, pageCount: 1, pageCountAuto: false }],
      containsId: true,
    })
  }

  const handleScanDone = (file, pageCount, previewUrl) => {
    setShowDocScanner(false)
    onUpdateDraft({
      files: [...files, { file, previewUrl: previewUrl ?? null, pageCount, pageCountAuto: true }],
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
        if (enabled.length > 0 && !enabled.some(s => s.id === serviceId)) {
          onUpdateDraft({ serviceId: enabled[0].id })
        }
        setLoadingShop(false)
      })
  }, [shopId])

  const handleFiles = async (e) => {
    const list = Array.from(e.target.files ?? [])
    if (list.length === 0) return
    const mapped = await Promise.all(list.map(async file => {
      const { pageCount, pageCountAuto } = await detectPageCount(file)
      return {
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        pageCount, pageCountAuto,
      }
    }))
    onUpdateDraft({ files: [...files, ...mapped] })
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

  const setImageFrame = (frame) => {
    const copy = files.map((f, i) => i === activeIndex ? { ...f, imageFrame: frame } : f)
    onUpdateDraft({ files: copy })
  }
  const selectedService = enabledServices.find(s => s.id === serviceId)
  const totalPages = files.reduce((sum, f) => sum + (f.pageCount ?? 1), 0)
  const pricePerSheet = selectedService?.price_per_sheet ?? 0
  const total = pricePerSheet * totalPages * copies

  const pageWord = totalPages === 1 ? 'hoja' : 'hojas'
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
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>Precio por hoja</span>
                    <span style={{ fontSize:16, fontWeight:700, color:'#fff' }}>${pricePerSheet.toFixed(2)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>{totalPages} {pageWord} × {copies} {copyWord}</span>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>{totalPages * copies} impresiones</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', paddingTop:8, borderTop:'1px solid rgba(255,255,255,0.15)' }}>
                    <span style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Total</span>
                    <span style={{ fontSize:24, fontWeight:900, color:'#fff' }}>${total.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Tipo de impresión (de la papelería elegida) */}
            {shopId && (
              <div className="card">
                <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)', marginBottom:8 }}>TIPO DE IMPRESIÓN</p>
                {loadingShop ? (
                  <p style={{ fontSize:13, color:'var(--text-muted)' }}>Cargando opciones...</p>
                ) : enabledServices.length === 0 ? (
                  <p style={{ fontSize:13, color:'var(--text-muted)' }}>Esta papelería no configuró tipos de impresión todavía.</p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {enabledServices.map(s => (
                      <button key={s.id} onClick={() => onUpdateDraft({ serviceId: s.id })} style={{
                        display:'flex', alignItems:'center', gap:10,
                        border: s.id === serviceId ? '1.5px solid var(--green)' : '1px solid var(--border)',
                        background: s.id === serviceId ? 'var(--green-light)' : '#fff',
                        borderRadius:'var(--radius-md)', padding:'10px 12px', cursor:'pointer', textAlign:'left',
                      }}>
                        <i className={`ti ${serviceIcon(s)}`} style={{ fontSize:18, color: s.id === serviceId ? 'var(--green)' : 'var(--text-secondary)' }} />
                        <span style={{ flex:1, fontSize:14, fontWeight: s.id === serviceId ? 700 : 500 }}>{serviceLabel(s)}</span>
                        <span style={{ fontSize:13, fontWeight:700, color: s.id === serviceId ? 'var(--green)' : 'var(--text-secondary)' }}>${s.price_per_sheet}/hoja</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Vista previa grande centrada */}
            <div className="card">
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-files" style={{ fontSize: 16, color: 'var(--green)' }} />
                {files.length} archivo{files.length > 1 ? 's' : ''} · {totalPages} {pageWord} en total
              </p>

              {/* Página grande — si es una foto con tamaño elegido, el
                  propio recuadro cambia de forma (no solo la imagen
                  adentro) para que se note la diferencia real entre
                  cuarto/media/completa, sin importar la orientación de
                  la foto. */}
              {(() => {
                const showFramedPreview = activeIsImage && anyImageFrameOffered
                let pageW, pageH
                if (showFramedPreview) {
                  const page = pageSize(activeFile.imageFrame ?? 'completa')
                  const scale = 220 / CARTA_H // misma escala base para los 3 tamaños
                  pageW = page.w * scale
                  pageH = page.h * scale
                } else {
                  pageW = orientation === 'horizontal' ? 220 : 165
                  pageH = orientation === 'horizontal' ? 165 : 220
                }
                return (
                  <div style={{
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    background: 'var(--bg)', borderRadius: 'var(--radius-md)', padding: 20, marginBottom: 12,
                  }}>
                    <div style={{
                      background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
                      boxShadow: 'var(--shadow-sm)',
                      width: pageW, height: pageH,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', transition: 'width 0.2s, height 0.2s', position: 'relative',
                    }}>
                      {files[activeIndex]?.previewUrl ? (
                        showFramedPreview ? (
                          // Margen real de 2cm, escalado a la vista
                          // previa — mismo cálculo exacto que el PDF final.
                          <div style={{
                            width: `calc(100% - ${2 * MARGIN * (pageW / pageSize(activeFile.imageFrame ?? 'completa').w)}px)`,
                            height: `calc(100% - ${2 * MARGIN * (pageH / pageSize(activeFile.imageFrame ?? 'completa').h)}px)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <img src={files[activeIndex].previewUrl} alt={files[activeIndex].file.name}
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          </div>
                        ) : (
                          <img src={files[activeIndex].previewUrl} alt={files[activeIndex].file.name}
                            style={{
                              width: '100%', height: '100%',
                              objectFit: fit === 'actual' ? 'cover' : 'contain',
                              transition: 'object-fit 0.2s',
                            }} />
                        )
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
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
                        <img src={f.previewUrl} alt={f.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

              {/* Tamaño en la hoja — solo para fotos sueltas, y solo si
                  la papelería elegida realmente ofrece esos tamaños */}
              {activeIsImage && anyImageFrameOffered && (
                <div style={{ marginTop: 14 }}>
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
                </div>
              )}

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
                <strong>{totalPages} {pageWord}</strong>
                {selectedService ? <>, {serviceLabel(selectedService).toLowerCase()}</> : ''},
                {' '}{copies} {copyWord}
                {fit === 'fit' ? ', ajustado a la hoja' : ', tamaño real'}
                {orientation === 'horizontal' ? ', horizontal' : ''}.
                {selectedService && <> Total: <strong>${total.toFixed(2)}</strong>.</>}
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

function ToggleButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, fontSize: 13, padding: '8px 10px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderRadius: 'var(--radius-md)',
      border: active ? '1.5px solid var(--green)' : '1px solid var(--border)',
      background: active ? 'var(--green-light)' : '#fff',
      color: active ? 'var(--green)' : 'var(--text-secondary)',
      fontWeight: active ? 700 : 500,
      cursor: 'pointer', whiteSpace: 'nowrap',
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
