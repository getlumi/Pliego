import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import StripeCardForm from '../components/StripeCardForm'

const PACKAGES = [
  { id: 'basic',   amount: 26.5, prints: 2 },
  { id: 'popular', amount: 55,   prints: 5 },
]
const MENSUALIDAD = { amount: 75, label: 'Ilimitado' }

export default function WalletPage({ session }) {
  const [balance, setBalance]       = useState(null)
  const [held, setHeld]             = useState(0)
  const [subStatus, setSubStatus]   = useState(null) // 'none' | 'active' | 'past_due' | 'canceled'
  const [subPeriodEnd, setSubPeriodEnd] = useState(null)
  const [selectedPkg, setSelectedPkg]   = useState('mensualidad') // por defecto en el plan destacado
  const [activeTab, setActiveTab]       = useState('mensual') // 'mensual' | 'creditos'
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [oxxoData, setOxxoData]     = useState(null) // voucher OXXO
  const [cardStep, setCardStep]     = useState(null)  // 'form' | 'done'
  const [cardSecret, setCardSecret] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!session) return
    loadData()
    const channel = supabase
      .channel(`wallet:${session.user.id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'users', filter:`id=eq.${session.user.id}` },
        payload => {
          setBalance(payload.new.credits_balance)
          setHeld(payload.new.credits_held ?? 0)
          setSubStatus(payload.new.subscription_status)
          setSubPeriodEnd(payload.new.subscription_period_end)
        })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session])

  const loadData = async () => {
    const { data: u } = await supabase.from('users')
      .select('credits_balance, credits_held, subscription_status, subscription_period_end')
      .eq('id', session.user.id).maybeSingle()
    setBalance(u?.credits_balance ?? 0)
    setHeld(u?.credits_held ?? 0)
    setSubStatus(u?.subscription_status ?? 'none')
    setSubPeriodEnd(u?.subscription_period_end ?? null)
  }

  const isSubscriber = subStatus === 'active'

  const invokeFn = async (fnName, body) => {
    const { data: { session: s } } = await supabase.auth.getSession()
    return supabase.functions.invoke(fnName, {
      body,
      headers: { Authorization: `Bearer ${s.access_token}` },
    })
  }

  const handleCard = async () => {
    setError(''); setLoading(true); setOxxoData(null)
    const { data, error: fnErr } = await invokeFn('create-stripe-payment', { package_id: selectedPkg, method: 'card' })
    setLoading(false)
    if (fnErr || data?.error) { setError(data?.error ?? 'Error al iniciar pago'); return }
    setCardSecret(data.client_secret)
    setCardStep('form')
  }

  const handleOxxo = async () => {
    setError(''); setLoading(true); setCardStep(null)
    const { data, error: fnErr } = await invokeFn('create-stripe-payment', { package_id: selectedPkg, method: 'oxxo' })
    setLoading(false)
    if (fnErr || data?.error) { setError(data?.error ?? 'Error al generar voucher OXXO'); return }
    setOxxoData(data)
  }

  const handleSubscribe = async () => {
    setError(''); setLoading(true); setOxxoData(null)
    const { data, error: fnErr } = await invokeFn('create-subscription', {})
    setLoading(false)
    if (fnErr || data?.error) { setError(data?.error ?? 'Error al iniciar la suscripción'); return }
    setCardSecret(data.client_secret)
    setCardStep('form-sub')
  }

  const handleCancelSubscription = async () => {
    if (!window.confirm('¿Seguro que quieres cancelar? Sigues teniendo acceso ilimitado hasta el final de tu periodo ya pagado.')) return
    setCancelling(true)
    const { data, error: fnErr } = await invokeFn('cancel-subscription', {})
    setCancelling(false)
    if (fnErr || data?.error) { setError(data?.error ?? 'No se pudo cancelar. Intenta de nuevo.'); return }
    await loadData()
  }

  const pkg = PACKAGES.find(p => p.id === selectedPkg)
  const fmtDateOnly = iso => new Date(iso).toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })

  return (
    <div className="page">
      <div style={{ background:'var(--gradient-dark)', padding:'48px 20px 32px' }}>
        {isSubscriber ? (
          <>
            <p style={{ fontSize:12, color:'rgba(255,255,255,0.6)', fontWeight:600, marginBottom:4 }}>Tu plan</p>
            <p style={{ fontSize:34, fontWeight:900, color:'var(--accent)' }}>Ilimitado</p>
            <p style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:4 }}>
              {subPeriodEnd ? `Se renueva el ${fmtDateOnly(subPeriodEnd)}` : 'Imprime sin preocuparte por tu saldo'}
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize:12, color:'rgba(255,255,255,0.6)', fontWeight:600, marginBottom:4 }}>Tus créditos disponibles</p>
            <p style={{ fontSize:40, fontWeight:900, color:'var(--accent)' }}>
              {balance === null ? '...' : Math.max(0, Number(balance) - Number(held))}
            </p>
            {held > 0 ? (
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:4 }}>
                + {held} apartado{held !== 1 ? 's' : ''} en garantía de pedido{held !== 1 ? 's' : ''} activo{held !== 1 ? 's' : ''} ({Number(balance)} en total)
              </p>
            ) : (
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:4 }}>Cada impresión usa 1 crédito</p>
            )}
          </>
        )}
      </div>

      <div className="scroll-content">

        {isSubscriber ? (
          /* Ya es suscriptor — mostrar su plan, sin opciones de compra */
          <div className="card">
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'var(--accent-light)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <i className="ti ti-infinity" style={{ fontSize:20, color:'#16803C' }} />
              </div>
              <div>
                <p style={{ fontSize:14, fontWeight:800 }}>Plan Ilimitado activo</p>
                <p style={{ fontSize:12, color:'var(--text-secondary)' }}>$75/mes · imprime sin límite</p>
              </div>
            </div>
            {error && (
              <div style={{ background:'var(--red-light)', border:'1px solid #F09595', borderRadius:'var(--radius-md)', padding:'10px 14px', marginBottom:12 }}>
                <p style={{ fontSize:13, color:'var(--red)' }}>{error}</p>
              </div>
            )}
            <button onClick={handleCancelSubscription} disabled={cancelling} className="btn-outline">
              {cancelling ? 'Cancelando...' : 'Cancelar suscripción'}
            </button>
          </div>
        ) : subStatus === 'past_due' ? (
          <div className="card" style={{ background:'var(--red-light)', border:'1px solid #F09595' }}>
            <p style={{ fontSize:14, fontWeight:800, color:'var(--red)', marginBottom:4 }}>Hubo un problema con tu pago</p>
            <p style={{ fontSize:13, color:'var(--red)' }}>No pudimos renovar tu suscripción. Actualiza tu método de pago para seguir con acceso ilimitado.</p>
          </div>
        ) : null}

        {/* Selector de paquete / mensualidad — oculto si ya es suscriptor */}
        {!isSubscriber && (
        <div className="card" style={{ padding: 16 }}>

          {/* Pestañas segmentadas: Plan mensual vs Comprar créditos */}
          <div style={{ display:'flex', background:'var(--bg)', borderRadius:'var(--radius-full)', padding:4, marginBottom:18, gap:4 }}>
            <button
              onClick={() => { setActiveTab('mensual'); setSelectedPkg('mensualidad'); setError(''); setOxxoData(null); setCardStep(null) }}
              style={{
                flex:1, border:'none', borderRadius:'var(--radius-full)', padding:'9px 10px',
                background: activeTab === 'mensual' ? 'var(--dark)' : 'transparent',
                color: activeTab === 'mensual' ? '#fff' : 'var(--text-secondary)',
                fontSize:13, fontWeight:800, cursor:'pointer', transition:'background 0.15s, color 0.15s',
              }}
            >
              Plan mensual
            </button>
            <button
              onClick={() => { setActiveTab('creditos'); setSelectedPkg('popular'); setError(''); setOxxoData(null); setCardStep(null) }}
              style={{
                flex:1, border:'none', borderRadius:'var(--radius-full)', padding:'9px 10px',
                background: activeTab === 'creditos' ? 'var(--dark)' : 'transparent',
                color: activeTab === 'creditos' ? '#fff' : 'var(--text-secondary)',
                fontSize:13, fontWeight:800, cursor:'pointer', transition:'background 0.15s, color 0.15s',
              }}
            >
              Comprar créditos
            </button>
          </div>

          {activeTab === 'mensual' ? (
            <>
              <div style={{
                border:'1.5px solid var(--accent)', borderRadius:'var(--radius-lg)', padding:20,
                background:'var(--accent-light)', position:'relative', marginBottom:14,
              }}>
                <span style={{ position:'absolute', top:-10, left:18, fontSize:10, background:'var(--accent)', color:'#16803C', padding:'3px 10px', borderRadius:'var(--radius-full)', fontWeight:800, letterSpacing:0.3 }}>
                  RECOMENDADO
                </span>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <i className="ti ti-infinity" style={{ fontSize:22, color:'#16803C' }} />
                  </div>
                  <div>
                    <p style={{ fontSize:30, fontWeight:900, lineHeight:1, color:'#14532D' }}>
                      $75<span style={{ fontSize:14, fontWeight:700, color:'#16803C' }}>/mes</span>
                    </p>
                    <p style={{ fontSize:12.5, color:'#3F6B2A', marginTop:3, fontWeight:600 }}>Ilimitado — nunca te quedas sin saldo</p>
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {['Impresiones sin límite todo el mes', 'Sin apartar créditos por adelantado', 'Cancela cuando quieras'].map(txt => (
                    <div key={txt} style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <i className="ti ti-circle-check-filled" style={{ fontSize:14, color:'#16803C', flexShrink:0 }} />
                      <p style={{ fontSize:12.5, color:'#2E4D1F' }}>{txt}</p>
                    </div>
                  ))}
                </div>
              </div>

              <p style={{ fontSize:11.5, color:'var(--text-muted)', textAlign:'center', marginBottom:14 }}>
                Si imprimes 10 veces al mes, esto te sale más barato que comprar paquetes
              </p>

              {error && (
                <div style={{ background:'var(--red-light)', border:'1px solid #F09595', borderRadius:'var(--radius-md)', padding:'10px 14px', marginBottom:12, display:'flex', gap:8 }}>
                  <i className="ti ti-alert-circle" style={{ fontSize:16, color:'var(--red)', flexShrink:0 }} />
                  <p style={{ fontSize:13, color:'var(--red)' }}>{error}</p>
                </div>
              )}

              <button onClick={handleSubscribe} disabled={loading} className="btn-primary">
                <i className="ti ti-credit-card" style={{ fontSize:18 }} />
                {loading ? 'Un momento...' : 'Suscribirme'}
              </button>
            </>
          ) : (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                {PACKAGES.map(p => {
                  const isSelected = selectedPkg === p.id
                  const isPopular = p.id === 'popular'
                  return (
                    <button key={p.id} onClick={() => { setSelectedPkg(p.id); setOxxoData(null); setCardStep(null); setError('') }} style={{
                      border: isSelected ? '2px solid var(--accent)' : '1.5px solid var(--border)',
                      borderRadius:'var(--radius-lg)', padding:'18px 14px', textAlign:'center',
                      background: isSelected ? 'var(--accent-light)' : '#fff',
                      cursor:'pointer', position:'relative', display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                    }}>
                      {isPopular && (
                        <span style={{ position:'absolute', top:-9, left:'50%', transform:'translateX(-50%)', fontSize:9.5, background: isSelected ? 'var(--accent)' : 'var(--dark)', color: isSelected ? '#16803C' : '#fff', padding:'3px 9px', borderRadius:'var(--radius-full)', fontWeight:800, whiteSpace:'nowrap' }}>
                          MÁS POPULAR
                        </span>
                      )}
                      <div style={{ width:34, height:34, borderRadius:10, background: isSelected ? '#fff' : 'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:4 }}>
                        <i className={`ti ${isPopular ? 'ti-bolt' : 'ti-stack-2'}`} style={{ fontSize:17, color: isSelected ? '#16803C' : 'var(--text-secondary)' }} />
                      </div>
                      <p style={{ fontSize:24, fontWeight:900, color: isSelected ? '#16803C' : 'var(--text-primary)', lineHeight:1.1 }}>
                        ${p.amount}
                      </p>
                      <p style={{ fontSize:12.5, fontWeight:700, color: isSelected ? '#2E4D1F' : 'var(--text-secondary)' }}>
                        {p.prints} créditos
                      </p>
                    </button>
                  )
                })}
              </div>

              {error && (
                <div style={{ background:'var(--red-light)', border:'1px solid #F09595', borderRadius:'var(--radius-md)', padding:'10px 14px', marginBottom:12, display:'flex', gap:8 }}>
                  <i className="ti ti-alert-circle" style={{ fontSize:16, color:'var(--red)', flexShrink:0 }} />
                  <p style={{ fontSize:13, color:'var(--red)' }}>{error}</p>
                </div>
              )}

              <button onClick={handleCard} disabled={loading} className="btn-primary" style={{ marginBottom:10 }}>
                <i className="ti ti-credit-card" style={{ fontSize:18 }} />
                {loading && cardStep !== 'form' ? 'Un momento...' : `Pagar $${pkg?.amount} con tarjeta`}
              </button>
              <button onClick={handleOxxo} disabled={loading} className="btn-outline">
                <i className="ti ti-building-store" style={{ fontSize:18 }} />
                {loading && !cardStep ? 'Generando voucher...' : 'Pagar en OXXO'}
              </button>
            </>
          )}

          <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', marginTop:10 }}>
            <i className="ti ti-shield-check" style={{ fontSize:12 }} /> Pagos seguros con Stripe
          </p>
        </div>
        )}

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
        {(cardStep === 'form' || cardStep === 'form-sub') && cardSecret && (
          <StripeCardForm
            clientSecret={cardSecret}
            amount={cardStep === 'form-sub' ? MENSUALIDAD.amount : pkg?.amount}
            onSuccess={() => { setCardStep(cardStep === 'form-sub' ? 'done-sub' : 'done'); loadData() }}
            onCancel={() => setCardStep(null)}
          />
        )}

        {cardStep === 'done' && (
          <div className="card" style={{ textAlign:'center', padding:32 }}>
            <i className="ti ti-circle-check-filled" style={{ fontSize:56, color:'var(--green)', display:'block', marginBottom:16 }} />
            <p style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>¡Pago exitoso!</p>
            <p style={{ fontSize:14, color:'var(--text-secondary)', marginBottom:20 }}>Tus créditos ya están disponibles.</p>
            <button onClick={() => setCardStep(null)} className="btn-primary">Listo</button>
          </div>
        )}

        {cardStep === 'done-sub' && (
          <div className="card" style={{ textAlign:'center', padding:32 }}>
            <i className="ti ti-circle-check-filled" style={{ fontSize:56, color:'var(--green)', display:'block', marginBottom:16 }} />
            <p style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>¡Suscripción activada!</p>
            <p style={{ fontSize:14, color:'var(--text-secondary)', marginBottom:20 }}>Ya puedes imprimir sin preocuparte por tu saldo.</p>
            <button onClick={() => setCardStep(null)} className="btn-primary">Listo</button>
          </div>
        )}

      </div>
    </div>
  )
}
