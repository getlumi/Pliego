import React from 'react'

const PAPER_TYPES = [
  { id: 'bond',        label: 'Bond' },
  { id: 'opalina',     label: 'Opalina' },
  { id: 'doble_carta', label: 'Doble carta / oficio' },
]

// Deriva el service_type (de la base de datos) a partir de papel + color
export function deriveServiceType(paperType, colorMode) {
  if (paperType === 'doble_carta') return 'doble_carta'
  if (paperType === 'opalina') return colorMode === 'color' ? 'opalina_color' : 'opalina_bn'
  return colorMode === 'color' ? 'color_bond' : 'bn_bond'
}

function fileIcon(file) {
  if (file.type.startsWith('image/')) return null // se muestra preview real
  if (file.type === 'application/pdf') return 'ti-file-type-pdf'
  if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) return 'ti-file-type-doc'
  return 'ti-file'
}

export default function UploadPage({ session, onNavigate, draft, onUpdateDraft, onClearDraft }) {
  const { files, orientation, fit, copies, colorMode, paperType, instructions, activeIndex } = draft

  const handleFiles = (e) => {
    const list = Array.from(e.target.files ?? [])
    if (list.length === 0) return
    const mapped = list.map(file => ({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }))
    onUpdateDraft({ files: [...files, ...mapped] })
    e.target.value = '' // permite volver a elegir el mismo archivo si lo quitan y re-agregan
  }

  const removeFile = (idx) => {
    const copy = [...files]
    if (copy[idx].previewUrl) URL.revokeObjectURL(copy[idx].previewUrl)
    copy.splice(idx, 1)
    const newActive = Math.max(0, activeIndex >= idx ? activeIndex - 1 : activeIndex)
    onUpdateDraft({ files: copy, activeIndex: newActive })
  }

  const cancelAll = () => {
    if (window.confirm('¿Empezarás de cero? Se perderá el documento que estás editando.')) {
      onClearDraft()
    }
  }

  const serviceType = deriveServiceType(paperType, colorMode)
  const paperLabel = PAPER_TYPES.find(p => p.id === paperType)?.label
  const colorLabel = colorMode === 'color' ? 'color' : 'blanco y negro'
  const pageWord = files.length === 1 ? 'hoja' : 'hojas'
  const copyWord = copies === 1 ? 'copia' : 'copias'

  const continuar = () => {
    // El siguiente paso es elegir la papelería en la pantalla principal.
    // El borrador (archivos + ajustes) se mantiene hasta que se envíe o se cancele.
    onNavigate('home')
  }

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

        {/* Caja grande clicable */}
        <label htmlFor="file-upload-input" className="card" style={{
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
            id="file-upload-input" type="file"
            accept=".pdf,.docx,.jpg,.jpeg,.png" multiple
            onChange={handleFiles}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
          />
        </label>

        {files.length > 0 && (
          <>
            {/* Vista previa grande centrada */}
            <div className="card">
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-files" style={{ fontSize: 16, color: 'var(--green)' }} />
                {files.length} archivo{files.length > 1 ? 's' : ''} seleccionado{files.length > 1 ? 's' : ''}
              </p>

              {/* Página grande */}
              <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                background: 'var(--bg)', borderRadius: 'var(--radius-md)', padding: 20, marginBottom: 12,
              }}>
                <div style={{
                  background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
                  boxShadow: 'var(--shadow-sm)',
                  width: orientation === 'horizontal' ? 220 : 165,
                  height: orientation === 'horizontal' ? 165 : 220,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', transition: 'width 0.2s, height 0.2s',
                }}>
                  {files[activeIndex]?.previewUrl ? (
                    <img src={files[activeIndex].previewUrl} alt={files[activeIndex].file.name}
                      style={{
                        width: '100%', height: '100%',
                        objectFit: fit === 'actual' ? 'cover' : 'contain',
                        transition: 'object-fit 0.2s',
                      }} />
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

              {/* Miniaturas para elegir cuál ver / quitar */}
              {files.length > 1 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {files.map((f, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <button onClick={() => onUpdateDraft({ activeIndex: idx })} style={{
                        width: 48, height: 60, borderRadius: 6, padding: 0,
                        border: idx === activeIndex ? '2px solid var(--green)' : '1px solid var(--border)',
                        background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', cursor: 'pointer',
                      }}>
                        {f.previewUrl ? (
                          <img src={f.previewUrl} alt={f.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <i className={`ti ${fileIcon(f.file)}`} style={{ fontSize: 18, color: 'var(--text-muted)' }} />
                        )}
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

            {/* Color y tipo de papel */}
            <div className="card">
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>COLOR</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <ToggleButton active={colorMode === 'bn'} onClick={() => onUpdateDraft({ colorMode: 'bn' })} icon="ti-file-text" label="Blanco y negro" />
                <ToggleButton active={colorMode === 'color'} onClick={() => onUpdateDraft({ colorMode: 'color' })} icon="ti-palette" label="Color" />
              </div>

              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>TIPO DE PAPEL</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PAPER_TYPES.map(p => (
                  <ToggleButton key={p.id} active={paperType === p.id} onClick={() => onUpdateDraft({ paperType: p.id })} label={p.label} />
                ))}
              </div>
            </div>

            {/* Ajustes especiales con IA */}
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
            </div>

            {/* Resumen de confirmación */}
            <div className="card" style={{ background: 'var(--green-light)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                <i className="ti ti-printer" style={{ fontSize: 15, verticalAlign: -2, marginRight: 4 }} />
                Vas a imprimir
              </p>
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                <strong>{files.length} {pageWord}</strong>, {paperLabel?.toLowerCase()}, <strong>{colorLabel}</strong>,
                {' '}{copies} {copyWord}
                {fit === 'fit' ? ', ajustado a la hoja' : ', tamaño real'}
                {orientation === 'horizontal' ? ', horizontal' : ''}.
              </p>
            </div>

            <button onClick={continuar} className="btn-primary">
              Elegir papelería e imprimir
              <i className="ti ti-arrow-right" style={{ fontSize: 16 }} />
            </button>
          </>
        )}

        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          <i className="ti ti-shield-check" style={{ fontSize: 13 }} /> Tu documento se elimina automáticamente en 3 días
        </p>
      </div>
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
