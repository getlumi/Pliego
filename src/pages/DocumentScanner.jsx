import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { scanDocument, createCornerEditor, extractDocument } from 'scanic'

// Proporción tamaño carta (8.5 × 11 in) en modo retrato — la orientación
// natural en la que la gente fotografía una hoja con el celular.
const PAGE_RATIO = 612 / 792 // ancho/alto ≈ 0.773

// PLIEGO · Escaneo de documento genérico (multi-página)
// A diferencia de IneCapture (2 lados fijos de una credencial), este
// captura cualquier número de hojas sueltas — cada una pasa por el
// mismo pipeline de Scanic (detección de bordes + corrección de
// perspectiva, con editor de esquinas manual como respaldo) y al
// terminar se arma un solo PDF con todas las páginas en orden.
export default function DocumentScanner({ onDone, onCancel }) {
  const [phase, setPhase] = useState('camera') // camera | processing | adjust | review | generating
  const [pages, setPages] = useState([]) // dataURLs ya escaneados, en orden
  const [lastCaptured, setLastCaptured] = useState(null) // el más reciente, para la pantalla de revisión
  const [error, setError] = useState('')
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const streamRef  = useRef(null)
  const editorHostRef = useRef(null)
  const editorRef  = useRef(null)
  const rawCaptureRef = useRef(null)

  useEffect(() => {
    if (phase !== 'camera') return
    let active = true
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setError('No pudimos acceder a tu cámara. Revisa los permisos e intenta de nuevo.'))
    return () => {
      active = false
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [phase])

  const saveScanned = useCallback((dataUrl) => {
    setLastCaptured(dataUrl)
    setPhase('review')
  }, [])

  const capture = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return

    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    streamRef.current?.getTracks().forEach(t => t.stop())
    setError('')
    setPhase('processing')

    try {
      const result = await scanDocument(canvas, { mode: 'extract', output: 'dataurl' })
      if (result.success) {
        saveScanned(result.output)
      } else {
        rawCaptureRef.current = canvas
        setPhase('adjust')
      }
    } catch (e) {
      rawCaptureRef.current = canvas
      setPhase('adjust')
    }
  }, [saveScanned])

  useEffect(() => {
    if (phase !== 'adjust' || !editorHostRef.current || !rawCaptureRef.current) return

    const img = new Image()
    img.onload = () => {
      editorRef.current = createCornerEditor({
        container: editorHostRef.current,
        image: img,
        onConfirm: async (corners) => {
          try {
            const extracted = await extractDocument(img, corners, { output: 'dataurl' })
            saveScanned(extracted.output)
          } catch (e) {
            setError('No pudimos procesar la imagen. Intenta tomar la foto de nuevo.')
            setPhase('camera')
          }
          editorRef.current?.destroy()
          editorRef.current = null
        },
      })
    }
    img.src = rawCaptureRef.current.toDataURL('image/jpeg', 0.95)

    return () => { editorRef.current?.destroy(); editorRef.current = null }
  }, [phase, saveScanned])

  const retake = () => {
    setError('')
    setLastCaptured(null)
    setPhase('camera')
  }

  const cancelAdjusting = () => {
    editorRef.current?.destroy(); editorRef.current = null
    setPhase('camera')
  }

  // Confirma la página actual y sigue escaneando otra
  const addAnotherPage = () => {
    setPages(prev => [...prev, lastCaptured])
    setLastCaptured(null)
    setPhase('camera')
  }

  // Confirma la página actual y arma el PDF final con todas
  const finish = async () => {
    const allPages = [...pages, lastCaptured]
    setPhase('generating')
    try {
      const { PDFDocument } = await import('pdf-lib')
      const pdf = await PDFDocument.create()

      for (const dataUrl of allPages) {
        const bytes = await (await fetch(dataUrl)).arrayBuffer()
        const image = await pdf.embedJpg(bytes)
        const page = pdf.addPage([612, 792]) // Carta
        // Ajusta la imagen al ancho de la hoja, centrada verticalmente
        const scale = Math.min(612 / image.width, 792 / image.height)
        const w = image.width * scale
        const h = image.height * scale
        page.drawImage(image, { x: (612 - w) / 2, y: (792 - h) / 2, width: w, height: h })
      }

      const pdfBytes = await pdf.save()
      const file = new File([pdfBytes], `documento-escaneado-${Date.now()}.pdf`, { type: 'application/pdf' })
      onDone(file, allPages.length)
    } catch (e) {
      setError('No pudimos generar el documento. Intenta de nuevo.')
      setPages(allPages.slice(0, -1))
      setPhase('review')
    }
  }

  const pageNumber = pages.length + 1

  const content = (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', zIndex: 999999,
      display: 'flex', flexDirection: 'column',
      height: '100dvh',
    }}>
      <div style={{
        padding: 'max(16px, env(safe-area-inset-top)) 20px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <p style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>
          {phase === 'generating' ? 'Generando documento...'
            : phase === 'processing' ? 'Escaneando...'
            : phase === 'adjust' ? `Ajusta las esquinas · página ${pageNumber}`
            : `Escanear documento · página ${pageNumber}`}
        </p>
        <button onClick={phase === 'adjust' ? cancelAdjusting : onCancel} aria-label="Cancelar" style={{
          width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <i className="ti ti-x" style={{ fontSize: 16, color: '#fff' }} />
        </button>
      </div>

      {error && (
        <div style={{ margin: '0 20px 12px', padding: '10px 14px', background: 'var(--red-light)', borderRadius: 10, flexShrink: 0 }}>
          <p style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>{error}</p>
        </div>
      )}

      {phase === 'camera' && (
        <>
          <div style={{ flex: '1 1 auto', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '78%', aspectRatio: `${PAGE_RATIO}`,
              border: '3px solid #8BC53F', borderRadius: 8,
              boxShadow: '0 0 0 2000px rgba(0,0,0,0.55)',
              pointerEvents: 'none',
            }} />
          </div>

          <div style={{
            flexShrink: 0, background: '#0A0A0A',
            padding: '18px 20px max(20px, env(safe-area-inset-bottom))',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          }}>
            <p style={{ textAlign: 'center', color: '#fff', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
              Coloca la hoja sobre una superficie plana, dentro del marco<br/>
              Evita luz directa o flash para que no se refleje
            </p>
            <button onClick={capture} aria-label="Tomar foto" style={{
              width: 68, height: 68, borderRadius: '50%', background: '#fff',
              border: '4px solid #8BC53F', cursor: 'pointer', flexShrink: 0,
            }} />
            {pages.length > 0 && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                {pages.length} página{pages.length !== 1 ? 's' : ''} escaneada{pages.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </>
      )}

      {phase === 'processing' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <i className="ti ti-loader-2" style={{ fontSize: 40, color: '#8BC53F' }} />
          <p style={{ color: '#fff', fontSize: 14 }}>Detectando bordes del documento...</p>
        </div>
      )}

      {phase === 'adjust' && (
        <>
          <div style={{ flex: '1 1 auto', position: 'relative', overflow: 'hidden', minHeight: 0, padding: 12 }}>
            <div ref={editorHostRef} style={{ width: '100%', height: '100%' }} />
          </div>
          <div style={{ flexShrink: 0, background: '#0A0A0A', padding: '14px 20px max(20px, env(safe-area-inset-bottom))' }}>
            <p style={{ textAlign: 'center', color: '#fff', fontSize: 13, fontWeight: 600 }}>
              No detectamos los bordes automáticamente — arrastra las esquinas para ajustarlas
            </p>
          </div>
        </>
      )}

      {phase === 'review' && (
        <>
          <div style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 20px', minHeight: 0 }}>
            <img
              src={lastCaptured}
              alt={`Página ${pageNumber}`}
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, border: '2px solid #8BC53F', objectFit: 'contain' }}
            />
          </div>
          <div style={{ flexShrink: 0, background: '#0A0A0A', padding: '14px 20px max(20px, env(safe-area-inset-bottom))' }}>
            <p style={{ textAlign: 'center', color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>¿Se ve legible y completa?</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <button onClick={retake} style={{
                flex: 1, padding: 14, borderRadius: 14, border: '1.5px solid rgba(255,255,255,0.4)',
                background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
                <i className="ti ti-refresh" style={{ fontSize: 16, marginRight: 6 }} /> Repetir
              </button>
              <button onClick={addAnotherPage} style={{
                flex: 1, padding: 14, borderRadius: 14, border: '1.5px solid #8BC53F',
                background: 'transparent', color: '#8BC53F', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
                <i className="ti ti-plus" style={{ fontSize: 16, marginRight: 6 }} /> Otra página
              </button>
            </div>
            <button onClick={finish} style={{
              width: '100%', padding: 14, borderRadius: 14, border: 'none',
              background: '#8BC53F', color: '#0A0A0A', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>
              <i className="ti ti-check" style={{ fontSize: 16, marginRight: 6 }} />
              {pages.length > 0 ? `Terminar (${pages.length + 1} páginas)` : 'Terminar'}
            </button>
          </div>
        </>
      )}

      {phase === 'generating' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#fff', fontSize: 14 }}>Un momento...</p>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )

  return createPortal(content, document.body)
}
