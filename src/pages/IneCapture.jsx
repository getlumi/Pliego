import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { scanDocument, createCornerEditor, extractDocument } from 'scanic'

// Proporción real de una credencial (INE, licencia, etc.): 85.6mm × 54mm
const CARD_RATIO = 85.6 / 54 // ≈ 1.586

// PLIEGO · Captura guiada de identificación (frente y reverso)
// Flujo: cámara con marco guía → tomar foto completa → Scanic detecta
// los bordes reales de la tarjeta y corrige la perspectiva (para que no
// dependa de que el usuario alinee perfectamente) → si la detección
// automática falla o queda dudosa, se muestra el editor de esquinas de
// Scanic para ajustar a mano → revisar (aceptar/repetir) → repetir para
// el reverso → arma un PDF de una hoja con ambas imágenes ya escaneadas.
// Se renderiza vía Portal directo a document.body para escapar de
// cualquier `overflow: hidden` de contenedores padre (.phone-frame) que
// puede recortar el fondo de la pantalla en móvil cuando la barra del
// navegador cambia de tamaño.
export default function IneCapture({ onDone, onCancel }) {
  const [side, setSide]   = useState('frente') // frente | reverso — qué lado se está capturando
  const [phase, setPhase] = useState('camera')  // camera | processing | adjust | review | generating
  const [frontImg, setFrontImg] = useState(null)
  const [backImg, setBackImg]   = useState(null)
  const [error, setError]       = useState('')
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const streamRef  = useRef(null)
  const editorHostRef = useRef(null)
  const editorRef  = useRef(null)
  const rawCaptureRef = useRef(null) // guarda la foto cruda para el editor de esquinas

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
  }, [phase, side])

  // Guarda el resultado ya escaneado del lado actual y pasa a revisión
  const saveScanned = useCallback((dataUrl) => {
    if (side === 'frente') setFrontImg(dataUrl)
    else setBackImg(dataUrl)
    setPhase('review')
  }, [side])

  const capture = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return

    // Foto completa a buena resolución — Scanic se encarga de encontrar
    // la tarjeta dentro de ella, no dependemos de un recorte fijo.
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
        // Detección automática no encontró bordes claros — pasamos al
        // editor de esquinas para que la persona los ajuste a mano.
        rawCaptureRef.current = canvas
        setPhase('adjust')
      }
    } catch (e) {
      // Si Scanic falla por completo (ej. WASM no cargó), no dejamos a
      // la persona sin poder avanzar — reintenta con el editor manual.
      rawCaptureRef.current = canvas
      setPhase('adjust')
    }
  }, [saveScanned])

  // Monta el editor de esquinas de Scanic cuando corresponde
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
    setPhase('camera')
  }

  const cancelAdjusting = () => {
    editorRef.current?.destroy(); editorRef.current = null
    setPhase('camera')
  }

  const accept = async () => {
    if (side === 'frente') { setSide('reverso'); setPhase('camera'); return }
    setPhase('generating')
    try {
      const { PDFDocument } = await import('pdf-lib')
      const pdf = await PDFDocument.create()
      const page = pdf.addPage([612, 792]) // Carta

      const frontBytes = await (await fetch(frontImg)).arrayBuffer()
      const backBytes  = await (await fetch(backImg)).arrayBuffer()
      const frontImage = await pdf.embedJpg(frontBytes)
      const backImage  = await pdf.embedJpg(backBytes)

      const imgW = 460
      const imgH = imgW / CARD_RATIO
      const marginX = (612 - imgW) / 2

      page.drawImage(frontImage, { x: marginX, y: 792 - 80 - imgH, width: imgW, height: imgH })
      page.drawImage(backImage,  { x: marginX, y: 792 - 100 - imgH * 2, width: imgW, height: imgH })

      page.drawText('Identificación — frente', { x: marginX, y: 792 - 65, size: 12 })
      page.drawText('Identificación — reverso', { x: marginX, y: 792 - 95 - imgH, size: 12 })

      const pdfBytes = await pdf.save()
      const file = new File([pdfBytes], 'identificacion.pdf', { type: 'application/pdf' })
      onDone(file)
    } catch (e) {
      setError('No pudimos generar el documento. Intenta de nuevo.')
      setPhase('review')
    }
  }

  const content = (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', zIndex: 999999,
      display: 'flex', flexDirection: 'column',
      height: '100dvh',
    }}>
      {/* Header, con espacio seguro arriba (notch) */}
      <div style={{
        padding: 'max(16px, env(safe-area-inset-top)) 20px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <p style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>
          {phase === 'generating' ? 'Generando documento...'
            : phase === 'processing' ? 'Escaneando...'
            : phase === 'adjust' ? `Ajusta las esquinas · ${side}`
            : `Identificación · ${side}`}
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
          {/* Zona de cámara: el marco vive en el 60% superior, dejando
              espacio de sobra abajo para los controles */}
          <div style={{ flex: '1 1 auto', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '82%', aspectRatio: `${CARD_RATIO}`,
              border: '3px solid #8BC53F', borderRadius: 14,
              boxShadow: '0 0 0 2000px rgba(0,0,0,0.55)',
              pointerEvents: 'none',
            }} />
          </div>

          {/* Panel de controles elevado, con espacio seguro abajo */}
          <div style={{
            flexShrink: 0, background: '#0A0A0A',
            padding: '18px 20px max(20px, env(safe-area-inset-bottom))',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          }}>
            <p style={{ textAlign: 'center', color: '#fff', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
              Coloca la {side} de tu identificación dentro del marco<br/>
              Evita luz directa o flash para que no se refleje
            </p>
            <button onClick={capture} aria-label="Tomar foto" style={{
              width: 68, height: 68, borderRadius: '50%', background: '#fff',
              border: '4px solid #8BC53F', cursor: 'pointer', flexShrink: 0,
            }} />
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
          <div style={{
            flexShrink: 0, background: '#0A0A0A',
            padding: '14px 20px max(20px, env(safe-area-inset-bottom))',
          }}>
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
              src={side === 'frente' ? frontImg : backImg}
              alt={`Identificación ${side}`}
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, border: '2px solid #8BC53F', objectFit: 'contain' }}
            />
          </div>
          <div style={{
            flexShrink: 0, background: '#0A0A0A',
            padding: '14px 20px max(20px, env(safe-area-inset-bottom))',
          }}>
            <p style={{ textAlign: 'center', color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>¿Se ve legible y completa?</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={retake} style={{
                flex: 1, padding: 14, borderRadius: 14, border: '1.5px solid rgba(255,255,255,0.4)',
                background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
                <i className="ti ti-refresh" style={{ fontSize: 16, marginRight: 6 }} /> Tomar de nuevo
              </button>
              <button onClick={accept} style={{
                flex: 1, padding: 14, borderRadius: 14, border: 'none',
                background: '#8BC53F', color: '#0A0A0A', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
                <i className="ti ti-check" style={{ fontSize: 16, marginRight: 6 }} />
                {side === 'frente' ? 'Seguir al reverso' : 'Terminar'}
              </button>
            </div>
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
