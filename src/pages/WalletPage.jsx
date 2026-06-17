import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const PACKAGES = [
  { id: 'basic',   amount: 20, prints: 10, pricePerPrint: '2.00' },
  { id: 'popular', amount: 50, prints: 30, pricePerPrint: '1.67', badge: 'Mejor precio' },
]

const SERVICE_FEE = 2

export default function WalletPage({ session }) {
  const [balance, setBalance]       = useState(null)
  const [transactions, setTransactions] = useState([])
  const [selectedPkg, setSelectedPkg]   = useState('popular')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [oxxoData, setOxxoData]     = useState(null) // voucher OXXO
  const [cardStep, setCardStep]     = useState(null)  // 'form' | 'done'
  const [cardSecret, setCardSecret] = useState(null)

  useEffect(() => {
    if (!session) return
    loadData()
    const channel = supabase
      .channel(`wallet:${session.user.id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'users', filter:`id=eq.${session.user.id}` },
        payload => setBalance(payload.new.wallet_balance))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session])

  const loadData = async () => {
    const { data: u } = await supabase.from('users').select('wallet_balance').eq('id', session.user.id).maybeSingle()
    setBalance(u?.wallet_balance ?? 0)
    const { data: txs } = await supabase.from('wallet_transactions').select('*')
      .eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(20)
    setTransactions(txs ?? [])
  }

  const invoke = async (body) => {
    const { data: { session: s } } = await supabase.auth.getSession()
    return supabase.functions.invoke('create-stripe-payment', {
      body,
      headers: { Authorization: `Bearer ${s.access_token}` },
    })
  }

  const handleCard = async () => {
    setError(''); setLoading(true); setOxxoData(null)
    const { data, error: fnErr } = await invoke({ package_id: selectedPkg, method: 'card' })
    setLoading(false)
    if (fnErr || data?.error) { setError(data?.error ?? 'Error al iniciar pago'); return }
    setCardSecret(data.client_secret)
    setCardStep('form')
  }

  const handleOxxo = async () => {
    setError(''); setLoading(true); setCardStep(null)
    const { data, error: fnErr } = await invoke({ package_id: selectedPkg, method: 'oxxo' })
    setLoading(false)
    if (fnErr || data?.error) { setError(data?.error ?? 'Error al generar voucher OXXO'); return }
    setOxxoData(data)
  }

  const pkg = PACKAGES.find(p => p.id === selectedPkg)
  const fmtDate = iso => new Date(iso).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })

  return (
    <div className="page">
      <div style={{ background:'var(--gradient-dark)', padding:'48px 20px 32px' }}>
        <p style={{ fontSize:12, color:'rgba(255,255,255,0.6)', fontWeight:600, marginBottom:4 }}>Tu saldo disponible</p>
        <p style={{ fontSize:40, fontWeight:900, color:'#fff' }}>${balance === null ? '...' : Number(balance).toFixed(2)}</p>
        <p style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:4 }}>Cada impresión usa $2.00 de tu saldo</p>
      </div>

      <div className="scroll-content">

        {/* Selector de paquete */}
        <div className="card">
          <p style={{ fontSize:14, fontWeight:800, marginBottom:14 }}>Recargar saldo</p>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {PACKAGES.map(p => (
              <button key={p.id} onClick={() => { setSelectedPkg(p.id); setOxxoData(null); setCardStep(null) }} style={{
                border: selectedPkg === p.id ? '2px solid var(--green)' : '1.5px solid var(--border)',
                borderRadius:'var(--radius-md)', padding:16, textAlign:'center',
                background: selectedPkg === p.id ? 'var(--green-light)' : '#fff',
                cursor:'pointer', position:'relative',
              }}>
                {p.badge && (
                  <span style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', fontSize:11, background:'var(--green)', color:'#fff', padding:'2px 8px', borderRadius:'var(--radius-full)', fontWeight:700, whiteSpace:'nowrap' }}>{p.badge}</span>
                )}
                <p style={{ fontSize:26, fontWeight:900, color: selectedPkg === p.id ? 'var(--green)' : 'var(--text-primary)' }}>${p.amount}</p>
                <p style={{ fontSize:13, color:'var(--text-secondary)', marginTop:2 }}>{p.prints} impresiones</p>
                <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>${p.pricePerPrint} c/u</p>
              </button>
            ))}
          </div>

          {error && (
            <div style={{ background:'var(--red-light)', border:'1px solid #F09595', borderRadius:'var(--radius-md)', padding:'10px 14px', marginBottom:12, display:'flex', gap:8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize:16, color:'var(--red)', flexShrink:0 }} />
              <p style={{ fontSize:13, color:'var(--red)' }}>{error}</p>
            </div>
          )}

          {/* Botón tarjeta */}
          <button onClick={handleCard} disabled={loading} className="btn-primary" style={{ marginBottom:10 }}>
            <i className="ti ti-credit-card" style={{ fontSize:18 }} />
            {loading && cardStep !== 'form' ? 'Un momento...' : `Pagar $${pkg?.amount} con tarjeta`}
          </button>

          {/* Botón OXXO */}
          <button onClick={handleOxxo} disabled={loading} className="btn-outline">
            <i className="ti ti-building-store" style={{ fontSize:18 }} />
            {loading && !cardStep ? 'Generando voucher...' : 'Pagar en OXXO'}
          </button>

          <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', marginTop:10 }}>
            <i className="ti ti-shield-check" style={{ fontSize:12 }} /> Pagos seguros con Stripe
          </p>
        </div>

        {/* Voucher OXXO */}
        {oxxoData && (
          <div className="card" style={{ textAlign:'center' }}>
            <div style={{ background:'var(--green-light)', borderRadius:'var(--radius-md)', padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
              <i className="ti ti-circle-check-filled" style={{ fontSize:22, color:'var(--green)', flexShrink:0 }} />
              <div style={{ textAlign:'left' }}>
                <p style={{ fontSize:14, fontWeight:700 }}>Voucher generado</p>
                <p style={{ fontSize:12, color:'var(--text-secondary)' }}>Paga en cualquier OXXO con este número</p>
              </div>
            </div>

            <div style={{ background:'var(--bg)', borderRadius:'var(--radius-md)', padding:20, marginBottom:16 }}>
              <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:8 }}>NÚMERO DE REFERENCIA</p>
              <p style={{ fontSize:15, fontWeight:900, letterSpacing:1, color:'var(--text-primary)', marginBottom:8, wordBreak:'break-all', fontFamily:'monospace' }}>
                {oxxoData.number}
              </p>
              <p style={{ fontSize:13, color:'var(--text-secondary)' }}>
                Monto a pagar: <strong>${oxxoData.amount} MXN</strong>
              </p>
              {oxxoData.expires_at && (
                <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>
                  Vence: {new Date(oxxoData.expires_at * 1000).toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })}
                </p>
              )}
            </div>

            <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:12, lineHeight:1.5 }}>
              Di al cajero "pago de servicios" y muestra el número. Tu saldo se acreditará automáticamente en 1-2 horas después de pagar.
            </p>

            {oxxoData.hosted_voucher && (
              <button onClick={() => window.open(oxxoData.hosted_voucher, '_blank')} className="btn-outline" style={{ marginBottom:8 }}>
                <i className="ti ti-printer" style={{ fontSize:16 }} />
                Ver e imprimir voucher completo
              </button>
            )}

            <button onClick={() => setOxxoData(null)} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:12, cursor:'pointer' }}>
              Generar otro voucher
            </button>
          </div>
        )}

        {/* Formulario de tarjeta (Stripe Elements) */}
        {cardStep === 'form' && cardSecret && (
          <StripeCardForm
            clientSecret={cardSecret}
            amount={pkg?.amount}
            onSuccess={() => { setCardStep('done'); loadData() }}
            onCancel={() => setCardStep(null)}
          />
        )}

        {cardStep === 'done' && (
          <div className="card" style={{ textAlign:'center', padding:32 }}>
            <i className="ti ti-circle-check-filled" style={{ fontSize:56, color:'var(--green)', display:'block', marginBottom:16 }} />
            <p style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>¡Pago exitoso!</p>
            <p style={{ fontSize:14, color:'var(--text-secondary)', marginBottom:20 }}>Tu saldo fue acreditado.</p>
            <button onClick={() => setCardStep(null)} className="btn-primary">Listo</button>
          </div>
        )}

        {/* Historial */}
        {transactions.length > 0 && (
          <div className="card">
            <p style={{ fontSize:14, fontWeight:800, marginBottom:12 }}>Movimientos recientes</p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {transactions.map(tx => (
                <div key={tx.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:10, borderBottom:'1px solid var(--border-light)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:10, flexShrink:0, background: tx.amount > 0 ? 'var(--green-light)' : 'var(--red-light)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <i className={`ti ${tx.amount > 0 ? 'ti-arrow-down-left' : 'ti-printer'}`} style={{ fontSize:16, color: tx.amount > 0 ? 'var(--green)' : 'var(--red)' }} />
                    </div>
                    <div>
                      <p style={{ fontSize:13, fontWeight:600 }}>{tx.amount > 0 ? `Recarga · ${tx.payment_method === 'oxxo' ? 'OXXO' : 'Tarjeta'}` : 'Impresión'}</p>
                      <p style={{ fontSize:11, color:'var(--text-muted)' }}>{fmtDate(tx.created_at)}</p>
                    </div>
                  </div>
                  <p style={{ fontSize:15, fontWeight:700, color: tx.amount > 0 ? 'var(--green)' : 'var(--text-primary)' }}>
                    {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Formulario de tarjeta con Stripe Elements
function StripeCardForm({ clientSecret, amount, onSuccess, onCancel }) {
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
      <p style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>Datos de tu tarjeta</p>
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

      <button onClick={onCancel} style={{ width:'100%', marginTop:8, background:'none', border:'none', color:'var(--text-muted)', fontSize:12, cursor:'pointer' }}>
        Cancelar
      </button>

      <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', marginTop:10 }}>
        <i className="ti ti-lock" style={{ fontSize:11 }} /> Tus datos nunca pasan por nuestros servidores
      </p>
    </div>
  )
}
