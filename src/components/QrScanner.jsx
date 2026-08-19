import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

// PLIEGO · Escaneo de código QR para entregar pedidos
// Botón único y global (no por tarjeta) — el QR ya trae el order_id y
// el pickup_code adentro, así que la papelería no necesita saber de
// antemano cuál pedido es: escanea y el sistema encuentra y marca el
// correcto. Usa html5-qrcode (no la API nativa BarcodeDetector, que no
// existe en Safari/iOS) para que funcione igual en cualquier celular.
export default function QrScanner({ onDelivered, onCancel }) {
  const [status, setStatus] = useState('scanning') // scanning | checking | success | error
  const [message, setMessage] = useState('')
  const scannerRef = useRef(null)
  const processingRef = useRef(false) // ref, no state — se lee en tiempo real dentro del callback de la cámara
  const mountedRef = useRef(true)

  const startCamera = async () => {
    const { Html5Qrcode } = await import('html5-qrcode')
    if (!mountedRef.current) return

    const scanner = new Html5Qrcode('qr-reader-region')
    scannerRef.current = scanner
    processingRef.current = false

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          if (processingRef.current) return // evita procesar el mismo QR 2 veces mientras se detiene la cámara
          processingRef.current = true
          await handleDecoded(decodedText)
        },
        () => {} // errores de "no se detectó nada en este frame" — ignorar, es normal
      )
    } catch (e) {
      if (!mountedRef.current) return
      setStatus('error')
      setMessage('No pudimos acceder a tu cámara. Revisa los permisos e intenta de nuevo.')
    }
  }

  useEffect(() => {
    mountedRef.current = true
    startCamera()
    return () => {
      mountedRef.current = false
      if (scannerRef.current) {
        scannerRef.current.stop().then(() => scannerRef.current.clear()).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopCamera = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); scannerRef.current.clear() } catch (_) {}
      scannerRef.current = null
    }
  }

  const handleDecoded = async (decodedText) => {
    setStatus('checking')
    await stopCamera()

    let payload
    try {
      payload = JSON.parse(decodedText)
    } catch (e) {
      setStatus('error')
      setMessage('Este código no es de Pliego.')
      return
    }

    if (!payload.order_id || !payload.pickup_code) {
      setStatus('error')
      setMessage('Este código no es de Pliego.')
      return
    }

    const { data: delivered } = await supabase.rpc('deliver_order_by_qr', {
      p_order_id: payload.order_id,
      p_pickup_code: payload.pickup_code,
    })

    if (delivered) {
      setStatus('success')
      setMessage('¡Pedido entregado!')
      setTimeout(() => onDelivered(), 1200)
    } else {
      setStatus('error')
      setMessage('Este código no corresponde a un pedido pendiente tuyo — puede que ya se haya entregado o sea de otra papelería.')
    }
  }

  const retry = () => {
    setStatus('scanning')
    setMessage('')
    startCamera()
  }

  const content = (
    <div style={{
      position:'fixed', inset:0, background:'#000', zIndex:999999,
      display:'flex', flexDirection:'column', height:'100dvh',
    }}>
      <div style={{
        padding:'max(16px, env(safe-area-inset-top)) 20px 12px',
        display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0,
      }}>
        <p style={{ color:'#fff', fontSize:15, fontWeight:700 }}>Escanear código de cliente</p>
        <button onClick={onCancel} aria-label="Cancelar" style={{
          width:32, height:32, borderRadius:'50%', background:'rgba(255,255,255,0.15)',
          border:'none', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        }}>
          <i className="ti ti-x" style={{ fontSize:16, color:'#fff' }} />
        </button>
      </div>

      <div style={{ flex:'1 1 auto', position:'relative', overflow:'hidden', minHeight:0 }}>
        <div id="qr-reader-region" style={{ width:'100%', height:'100%' }} />

        {status !== 'scanning' && (
          <div style={{
            position:'absolute', inset:0, background:'rgba(0,0,0,0.85)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, gap:16,
          }}>
            {status === 'checking' && (
              <>
                <i className="ti ti-loader-2" style={{ fontSize:40, color:'#8BC53F' }} />
                <p style={{ color:'#fff', fontSize:14 }}>Verificando código...</p>
              </>
            )}
            {status === 'success' && (
              <>
                <i className="ti ti-circle-check-filled" style={{ fontSize:56, color:'#8BC53F' }} />
                <p style={{ color:'#fff', fontSize:16, fontWeight:800, textAlign:'center' }}>{message}</p>
              </>
            )}
            {status === 'error' && (
              <>
                <i className="ti ti-alert-circle" style={{ fontSize:48, color:'#F87171' }} />
                <p style={{ color:'#fff', fontSize:14, textAlign:'center', maxWidth:280 }}>{message}</p>
                <button onClick={retry} style={{
                  padding:'10px 24px', borderRadius:14, border:'none',
                  background:'#8BC53F', color:'#0A0A0A', fontWeight:700, fontSize:14, cursor:'pointer',
                }}>
                  Intentar de nuevo
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {status === 'scanning' && (
        <div style={{ flexShrink:0, background:'#0A0A0A', padding:'18px 20px max(20px, env(safe-area-inset-bottom))' }}>
          <p style={{ textAlign:'center', color:'#fff', fontSize:13, fontWeight:600 }}>
            Apunta la cámara al código QR del cliente
          </p>
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
