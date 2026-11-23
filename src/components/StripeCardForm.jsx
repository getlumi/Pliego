import React, { useState, useEffect, useRef } from 'react'

// Formulario de pago con Stripe Payment Element — compartido entre
// WalletPage (créditos / mensualidad), PrintshopPage (mensualidad de la
// papelería) y SuspendedAccountScreen (reactivación). TODO ocurre dentro de
// Pliego: el usuario nunca sale del sitio.
//
// Payment Element (vs. el campo de tarjeta anterior) agrega, sin salir de la
// app: Apple Pay / Google Pay cuando el dispositivo y la cuenta de Stripe los
// tienen activos, autollenado de tarjetas guardadas, y la verificación del
// banco (3D Secure) integrada.
//
// Contrato (igual que antes): onSuccess() se llama cuando el cobro quedó
// hecho; puede ser async y mientras corre el botón dice "Confirmando...".

const STRIPE_SRC = 'https://js.stripe.com/v3/'

// Stripe.js se carga UNA sola vez por sesión (antes se re-descargaba al abrir
// cada formulario).
function loadStripeJs() {
  if (window.Stripe) return Promise.resolve(window.Stripe)
  if (window.__stripeJsPromise) return window.__stripeJsPromise
  window.__stripeJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = STRIPE_SRC
    script.onload = () => resolve(window.Stripe)
    script.onerror = () => { window.__stripeJsPromise = null; reject(new Error('stripe-js')) }
    document.head.appendChild(script)
  })
  return window.__stripeJsPromise
}

export default function StripeCardForm({ clientSecret, amount, onSuccess, onCancel, label }) {
  const [ready, setReady] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [cardError, setCardError] = useState('')
  const [complete, setComplete] = useState(false)
  const stripeRef = useRef(null)
  const elementsRef = useRef(null)
  const mountRef = useRef(null)
  const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLIC_KEY

  useEffect(() => {
    let cancelled = false
    let paymentEl = null
    setReady(false); setLoadFailed(false); setComplete(false)
    loadStripeJs().then(Stripe => {
      if (cancelled || !mountRef.current) return
      const stripe = Stripe(STRIPE_PK, { locale: 'es-419' })
      const elements = stripe.elements({
        clientSecret,
        locale: 'es-419',
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#1A1A1A',
            colorText: '#1A1A1A',
            colorDanger: '#E24B4A',
            fontFamily: 'Nunito, sans-serif',
            fontSizeBase: '16px', // 16px evita el zoom automático de iOS al enfocar
            borderRadius: '12px',
          },
        },
      })
      paymentEl = elements.create('payment', { layout: 'tabs' })
      paymentEl.on('ready', () => { if (!cancelled) setReady(true) })
      paymentEl.on('change', e => { if (!cancelled) { setComplete(!!e.complete); if (e.complete) setCardError('') } })
      paymentEl.mount(mountRef.current)
      stripeRef.current = stripe
      elementsRef.current = elements
    }).catch(() => { if (!cancelled) setLoadFailed(true) })
    return () => {
      cancelled = true
      try { paymentEl?.destroy() } catch {}
      stripeRef.current = null; elementsRef.current = null
    }
  }, [clientSecret])

  const handlePay = async () => {
    const stripe = stripeRef.current, elements = elementsRef.current
    if (!stripe || !elements) return
    setProcessing(true)
    setCardError('')
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      // Solo se usa si el banco exige una redirección (poco común); la app
      // retoma el pago pendiente al volver.
      confirmParams: { return_url: `${window.location.origin}/` },
      redirect: 'if_required',
    })
    if (error) {
      setProcessing(false)
      // Los errores de captura (número incompleto, etc.) ya se ven marcados
      // en el campo; aquí se muestra siempre un mensaje claro y la salida.
      setCardError(`${error.message} Puedes corregir los datos o probar con otra tarjeta.`)
    } else if (paymentIntent?.status === 'succeeded') {
      // El cobro ya se hizo: el botón queda en "Confirmando" mientras la
      // pantalla de arriba verifica con el servidor (puede tardar unos s).
      setConfirming(true)
      try { await onSuccess() } finally { setConfirming(false); setProcessing(false) }
    } else if (paymentIntent?.status === 'processing') {
      setProcessing(false)
      setCardError('Tu banco está procesando el pago. En unos momentos se refleja; no vuelvas a pagar.')
    } else {
      setProcessing(false)
    }
  }

  return (
    <div className="card">
      <p style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>{label ?? 'Datos de tu tarjeta'}</p>
      <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:16 }}>Pago seguro · ${amount} MXN</p>

      <div ref={mountRef} style={{ minHeight:140 }} />

      {!ready && !loadFailed && (
        <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:8 }}>Cargando formulario seguro...</p>
      )}
      {loadFailed && (
        <p style={{ fontSize:12, color:'var(--red)', marginTop:8 }}>
          No se pudo cargar el formulario de pago. Revisa tu conexión e intenta de nuevo.
        </p>
      )}

      {cardError && (
        <div style={{ marginTop:10, background:'var(--red-light)', border:'1px solid #F09595', borderRadius:'var(--radius-md)', padding:'8px 12px' }}>
          <p style={{ fontSize:13, color:'var(--red)' }}>{cardError}</p>
        </div>
      )}

      <button onClick={handlePay} disabled={!ready || processing} className="btn-primary" style={{ marginTop:14 }}>
        <i className="ti ti-lock" style={{ fontSize:16 }} />
        {confirming ? 'Confirmando tu pago...' : processing ? 'Procesando...' : `Pagar $${amount}`}
      </button>

      {onCancel && (
        <button onClick={onCancel} disabled={processing} style={{ width:'100%', marginTop:8, background:'none', border:'none', color:'var(--text-muted)', fontSize:12, cursor:'pointer' }}>
          Cancelar
        </button>
      )}

      <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', marginTop:10 }}>
        <i className="ti ti-lock" style={{ fontSize:11 }} /> Tus datos nunca pasan por nuestros servidores
      </p>
    </div>
  )
}
