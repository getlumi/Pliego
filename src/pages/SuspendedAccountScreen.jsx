import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import StripeCardForm from '../components/StripeCardForm'

// Bloqueo total de la app cuando un suscriptor no recogió su documento a
// tiempo (ver supabase_migration_suspension.sql). Solo se levanta pagando
// $50 MXN manualmente — no hay cobro automático. Al confirmar el pago,
// se le avisa a App.jsx (onReactivated) para que vuelva a consultar el
// estado real de la cuenta y, si ya se reactivó, deje pasar.
export default function SuspendedAccountScreen({ session, onReactivated }) {
  const [step, setStep]           = useState('info') // 'info' | 'form' | 'checking' | 'done'
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [cardSecret, setCardSecret] = useState(null)

  const invokeFn = async (fnName, body) => {
    const { data: { session: s } } = await supabase.auth.getSession()
    return supabase.functions.invoke(fnName, {
      body,
      headers: { Authorization: `Bearer ${s.access_token}` },
    })
  }

  const handleStartPayment = async () => {
    setError(''); setLoading(true)
    const { data, error: fnErr } = await invokeFn('create-reactivation-payment', {})
    setLoading(false)
    if (fnErr || data?.error) { setError(data?.error ?? 'No se pudo iniciar el pago. Intenta de nuevo.'); return }
    setCardSecret(data.client_secret)
    setStep('form')
  }

  const handlePaymentSuccess = async () => {
    setStep('checking')
    // El webhook de Stripe reactiva la cuenta en cuanto procesa el pago —
    // puede tardar un par de segundos. Reintentamos unas cuantas veces
    // antes de avisar que algo salió mal, en vez de dejar a la persona
    // viendo una pantalla que nunca avanza.
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 1500))
      const { data: u } = await supabase.from('users')
        .select('account_suspended').eq('id', session.user.id).maybeSingle()
      if (u && !u.account_suspended) {
        setStep('done')
        setTimeout(() => onReactivated(), 1500)
        return
      }
    }
    setStep('form')
    setError('Tu pago se procesó, pero la reactivación está tardando más de lo normal. Espera un momento y revisa de nuevo, o contacta a soporte.')
  }

  return (
    <div className="page" style={{ display:'flex', flexDirection:'column' }}>
      <div style={{ background:'var(--gradient-dark)', padding:'56px 20px 32px', textAlign:'center' }}>
        <div style={{
          width:64, height:64, borderRadius:18, background:'rgba(226,75,74,0.18)',
          display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px',
        }}>
          <i className="ti ti-lock" style={{ fontSize:30, color:'#F87171' }} />
        </div>
        <p style={{ fontSize:20, fontWeight:900, color:'#fff' }}>Cuenta suspendida</p>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)', marginTop:6, maxWidth:280, marginLeft:'auto', marginRight:'auto' }}>
          No recogiste un documento a tiempo con tu plan mensual
        </p>
      </div>

      <div className="scroll-content" style={{ flex:1 }}>
        {step === 'done' ? (
          <div className="card" style={{ textAlign:'center', padding:32 }}>
            <i className="ti ti-circle-check-filled" style={{ fontSize:56, color:'var(--green)', display:'block', marginBottom:16 }} />
            <p style={{ fontSize:18, fontWeight:900, marginBottom:8 }}>¡Cuenta reactivada!</p>
            <p style={{ fontSize:14, color:'var(--text-secondary)' }}>Ya puedes seguir usando tu plan normal.</p>
          </div>
        ) : step === 'checking' ? (
          <div className="card" style={{ textAlign:'center', padding:32 }}>
            <i className="ti ti-loader-2" style={{ fontSize:40, color:'var(--text-muted)', display:'block', marginBottom:12 }} />
            <p style={{ fontSize:14, color:'var(--text-secondary)' }}>Confirmando tu pago...</p>
          </div>
        ) : (
          <>
            <div className="card">
              <p style={{ fontSize:14, fontWeight:800, marginBottom:10 }}>¿Por qué se suspendió?</p>
              <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:14 }}>
                Con el plan mensual, cada documento de hasta $50 se imprime sin
                apartar nada por adelantado — pero si no pasas a recogerlo
                dentro de las 24 horas después de que esté listo, tu cuenta se
                suspende por completo.
              </p>
              <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.6 }}>
                Para reactivarla, paga una multa fija de <strong>$50 MXN</strong>.
                Tu plan mensual sigue pausado (no se te cobra) mientras estés
                suspendido, y vuelve a la normalidad en cuanto reactives.
              </p>
            </div>

            {error && (
              <div style={{ background:'var(--red-light)', border:'1px solid #F09595', borderRadius:'var(--radius-md)', padding:'10px 14px', display:'flex', gap:8 }}>
                <i className="ti ti-alert-circle" style={{ fontSize:16, color:'var(--red)', flexShrink:0 }} />
                <p style={{ fontSize:13, color:'var(--red)' }}>{error}</p>
              </div>
            )}

            {step === 'form' && cardSecret ? (
              <StripeCardForm
                clientSecret={cardSecret}
                amount={50}
                label="Pagar $50 para reactivar"
                onSuccess={handlePaymentSuccess}
                onCancel={() => setStep('info')}
              />
            ) : (
              <button onClick={handleStartPayment} disabled={loading} className="btn-primary">
                <i className="ti ti-credit-card" style={{ fontSize:18 }} />
                {loading ? 'Un momento...' : 'Pagar $50 y reactivar mi cuenta'}
              </button>
            )}

            <button onClick={() => supabase.auth.signOut()} style={{
              width:'100%', background:'none', border:'none',
              color:'var(--text-muted)', fontSize:12, cursor:'pointer', padding:8, marginTop:4,
            }}>
              Cerrar sesión
            </button>
          </>
        )}
      </div>
    </div>
  )
}
