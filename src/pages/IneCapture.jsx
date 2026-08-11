import React, { useState, useRef, useEffect, useCallback } from 'react'

// Proporción real de una credencial (INE, licencia, etc.): 85.6mm × 54mm
const CARD_RATIO = 85.6 / 54 // ≈ 1.586

// PLIEGO · Captura guiada de identificación (frente y reverso)
// Flujo: cámara con marco guía → tomar → revisar (aceptar/repetir) →
// repetir para el reverso → arma un PDF de una hoja con ambas imágenes.
// El resultado se agrega al carrito como un archivo más.
export default function IneCapture({ onDone, onCancel }) {
  const [step, setStep] = useState('frente') // frente | revisar_frente | reverso | revisar_reverso | procesando
  const [frontImg, setFrontImg] = useState(null) // dataURL recortado
  const [backImg, setBackImg]   = useState(null)
  const [error, setError]       = useState('')
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const isReviewing = step === 'revisar_frente' || step === 'revisar_reverso'
  const isCapturing = step === 'frente' || step === 'reverso'

  useEffect(() => {
    if (!isCapturing) return
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
  }, [step])

  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return

    // Recorta al centro respetando la proporción de credencial, tomando
    // como referencia el marco guía visible en pantalla (80% del ancho).
    const vw = video.videoWidth, vh = video.videoHeight
    const guideW = vw * 0.82
    const guideH = guideW / CARD_RATIO
    const sx = (vw - guideW) / 2
    const sy = (vh - guideH) / 2

    const canvas = canvasRef.current
    canvas.width = 900
    canvas.height = Math.round(900 / CARD_RATIO)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, sx, sy, guideW, guideH, 0, 0, canvas.width, canvas.height)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    streamRef.current?.getTracks().forEach(t => t.stop())

    if (step === 'frente') { setFrontImg(dataUrl); setStep('revisar_frente') }
    else { setBackImg(dataUrl); setStep('revisar_reverso') }
  }, [step])

  const retake = () => {
    setError('')
    setStep(step === 'revisar_frente' ? 'frente' : 'reverso')
  }

  const accept = async () => {
    if (step === 'revisar_frente') { setStep('reverso'); return }
    // Ambas caras listas — armar el PDF
    setStep('procesando')
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
      setStep('revisar_reverso')
    }
  }

  const label = step === 'frente' || step === 'revisar_frente' ? 'frente' : 'reverso'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', zIndex: 2000,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>
          {step === 'procesando' ? 'Generando documento...' : `Identificación · ${label}`}
        </p>
        <button onClick={onCancel} aria-label="Cancelar" style={{
          width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className="ti ti-x" style={{ fontSize: 16, color: '#fff' }} />
        </button>
      </div>

      {error && (
        <div style={{ margin: '0 20px 12px', padding: '10px 14px', background: 'var(--red-light)', borderRadius: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>{error}</p>
        </div>
      )}

      {isCapturing && (
        <>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {/* Marco guía con proporción real de credencial */}
            <div style={{
              position: 'absolute', width: '82%', aspectRatio: `${CARD_RATIO}`,
              border: '3px solid #8BC53F', borderRadius: 14,
              boxShadow: '0 0 0 2000px rgba(0,0,0,0.55)',
              pointerEvents: 'none',
            }} />
            <p style={{
              position: 'absolute', bottom: 24, left: 20, right: 20, textAlign: 'center',
              color: '#fff', fontSize: 13, fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}>
              Coloca la {label} de tu identificación dentro del marco{'\n'}
              Evita luz directa o flash para que no se refleje
            </p>
          </div>
          <div style={{ padding: '20px 20px 32px', display: 'flex', justifyContent: 'center' }}>
            <button onClick={capture} aria-label="Tomar foto" style={{
              width: 68, height: 68, borderRadius: '50%', background: '#fff',
              border: '4px solid rgba(255,255,255,0.4)', cursor: 'pointer',
            }} />
          </div>
        </>
      )}

      {isReviewing && (
        <>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <img
              src={step === 'revisar_frente' ? frontImg : backImg}
              alt={`Identificación ${label}`}
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, border: '2px solid #8BC53F' }}
            />
          </div>
          <p style={{ textAlign: 'center', color: '#fff', fontSize: 13, marginBottom: 12 }}>¿Se ve legible y completa?</p>
          <div style={{ padding: '0 20px 32px', display: 'flex', gap: 12 }}>
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
              {step === 'revisar_frente' ? 'Sí, seguir al reverso' : 'Sí, terminar'}
            </button>
          </div>
        </>
      )}

      {step === 'procesando' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#fff', fontSize: 14 }}>Un momento...</p>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
