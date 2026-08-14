import React, { useState, useEffect, useRef } from 'react'

// Formulario de tarjeta con Stripe Elements — compartido entre WalletPage
// (compra de créditos / suscripción) y SuspendedAccountScreen (pago de
// reactivación de $50).
export default function StripeCardForm({ clientSecret, amount, onSuccess, onCancel, label }) {
  const [stripeLoaded, setStripeLoaded] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [cardError, setCardError] = useState('')
  const [stripe, setStripe] = useState(null)
  const [elements, setElements] = useState(null)
  const cardRef = useRef(null)
  const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLIC_KEY

  useEffect(() => {
    // Cargar Stripe.js dinámicamente
    const script = document.createElement('script')
    script.src = 'https://js.stripe.com/v3/'
    script.onload = () => {
      const s = window.Stripe(STRIPE_PK)
      const els = s.elements()
      const card = els.create('card', {
        style: {
          base: { fontSize:'16px', fontFamily:'Nunito, sans-serif', color:'#1A1A1A', '::placeholder': { color:'#B4B2A9' } },
          invalid: { color:'#E24B4A' },
        },
      })
      card.mount(cardRef.current)
      setStripe(s)
      setElements(els)
      setStripeLoaded(true)
    }
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  const handlePay = async () => {
    if (!stripe || !elements) return
    setProcessing(true)
    setCardError('')
    const card = elements.getElement('card')
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card },
    })
    setProcessing(false)
    if (error) {
      setCardError(error.message)
    } else if (paymentIntent.status === 'succeeded') {
      onSuccess()
    }
  }

  return (
    <div className="card">
      <p style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>{label ?? 'Datos de tu tarjeta'}</p>
      <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:16 }}>Pago seguro · ${amount} MXN</p>

      <div ref={cardRef} style={{ border:'1.5px solid var(--border)', borderRadius:'var(--radius-md)', padding:'14px 16px', background:'#fff', minHeight:46 }} />

      {!stripeLoaded && (
        <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:8 }}>Cargando formulario seguro...</p>
      )}

      {cardError && (
        <div style={{ marginTop:10, background:'var(--red-light)', border:'1px solid #F09595', borderRadius:'var(--radius-md)', padding:'8px 12px' }}>
          <p style={{ fontSize:13, color:'var(--red)' }}>{cardError}</p>
        </div>
      )}

      <button onClick={handlePay} disabled={!stripeLoaded || processing} className="btn-primary" style={{ marginTop:14 }}>
        <i className="ti ti-lock" style={{ fontSize:16 }} />
        {processing ? 'Procesando...' : `Pagar $${amount}`}
      </button>

      {onCancel && (
        <button onClick={onCancel} style={{ width:'100%', marginTop:8, background:'none', border:'none', color:'var(--text-muted)', fontSize:12, cursor:'pointer' }}>
          Cancelar
        </button>
      )}

      <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', marginTop:10 }}>
        <i className="ti ti-lock" style={{ fontSize:11 }} /> Tus datos nunca pasan por nuestros servidores
      </p>
    </div>
  )
}
