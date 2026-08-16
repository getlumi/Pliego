import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

// Proporción real de una credencial (INE, licencia, etc.): 85.6mm × 54mm
const CARD_RATIO = 85.6 / 54 // ≈ 1.586

// PLIEGO · Captura guiada de identificación (frente y reverso)
// Flujo: cámara con marco guía → tomar → revisar (aceptar/repetir) →
// repetir para el reverso → arma un PDF de una hoja con ambas imágenes.
// Se renderiza vía Portal directo a document.body para escapar de
// cualquier `overflow: hidden` de contenedores padre (.phone-frame) que
// puede recortar el fondo de la pantalla en móvil cuando la barra del
// navegador cambia de tamaño.
export default function IneCapture({ onDone, onCancel }) {
  const [step, setStep] = useState('frente') // frente | revisar_frente | reverso | revisar_reverso | procesando
  const [frontImg, setFrontImg] = useState(null)
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

    const vw = video.videoWidth, vh = video.videoHeight
    const guideW = vw * 0.82
    const guideH = guideW / CARD_RATIO
    const sx = (vw - guideW) / 2
    const sy = (vh - guideH) / 2 - vh * 0.04 // misma corrección visual que el marco (ligeramente arriba del centro)

    const canvas = canvasRef.current
    canvas.width = 900
    canvas.height = Math.round(900 / CARD_RATIO)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, sx, Math.max(0, sy), guideW, guideH, 0, 0, canvas.width, canvas.height)

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
      onDone(file, frontImg) // frontImg = vista previa (frente ya capturado)
    } catch (e) {
      setError('No pudimos generar el documento. Intenta de nuevo.')
      setStep('revisar_reverso')
    }
  }

  const label = step === 'frente' || step === 'revisar_frente' ? 'frente' : 'reverso'

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
          {step === 'procesando' ? 'Generando documento...' : `Identificación · ${label}`}
        </p>
        <button onClick={onCancel} aria-label="Cancelar" style={{
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

      {isCapturing && (
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
              Coloca la {label} de tu identificación dentro del marco<br/>
              Evita luz directa o flash para que no se refleje
            </p>
            <button onClick={capture} aria-label="Tomar foto" style={{
              width: 68, height: 68, borderRadius: '50%', background: '#fff',
              border: '4px solid #8BC53F', cursor: 'pointer', flexShrink: 0,
            }} />
          </div>
        </>
      )}

      {isReviewing && (
        <>
          <div style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 20px', minHeight: 0 }}>
            <img
              src={step === 'revisar_frente' ? frontImg : backImg}
              alt={`Identificación ${label}`}
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
                {step === 'revisar_frente' ? 'Seguir al reverso' : 'Terminar'}
              </button>
            </div>
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

  return createPortal(content, document.body)
}
