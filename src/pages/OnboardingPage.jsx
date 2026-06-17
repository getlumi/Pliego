import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { registerPush, isIOS, isStandalone, isPushSupported } from '../lib/push'

const STEPS_BASE = [
  { icon: 'ti-upload',      title: 'Sube tu documento', desc: 'PDF, Word o fotos de tu identificación. Todo se elimina en 3 días.' },
  { icon: 'ti-map-pin',     title: 'Elige dónde imprimir', desc: 'Ve las papelerías abiertas cerca de ti, con precios y calificaciones.' },
  { icon: 'ti-cash',        title: 'Recoge y paga', desc: 'Pasa a recoger tu impresión y paga en efectivo directo en el lugar.' },
]

const IOS_STEP = {
  icon: 'ti-device-mobile',
  title: 'Instala Pliego en tu iPhone',
  desc: null, // Se renderiza custom
  isIosInstall: true,
}

const PUSH_STEP = {
  icon: 'ti-bell',
  title: 'Activa notificaciones',
  desc: 'Recibe un aviso cuando tu impresión esté lista, sin necesidad de revisar la app.',
  isPush: true,
}

export default function OnboardingPage({ session, onComplete }) {
  const [step, setStep]     = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [steps, setSteps]   = useState(STEPS_BASE)

  useEffect(() => {
    // Construir los pasos según el dispositivo
    const extraSteps = []
    if (isIOS() && !isStandalone()) extraSteps.push(IOS_STEP)
    if (isPushSupported()) extraSteps.push(PUSH_STEP)
    setSteps([...STEPS_BASE, ...extraSteps])
  }, [])

  const handlePush = async () => {
    await registerPush(session.user.id)
    advanceOrFinish()
  }

  const advanceOrFinish = () => {
    if (step < steps.length - 1) setStep(s => s + 1)
    else finish()
  }

  const finish = async () => {
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase
      .from('users')
      .update({ onboarding_seen: true })
      .eq('id', session.user.id)
      .select('onboarding_seen')
      .maybeSingle()

    if (err || !data?.onboarding_seen) {
      setError('No se pudo guardar. Verifica tu conexión e intenta de nuevo.')
      setSaving(false)
      return
    }
    onComplete()
  }

  const current = steps[step]
  const isLast  = step === steps.length - 1

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--gradient-dark)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 32, textAlign: 'center',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: 24,
        background: 'rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24, border: '2px solid rgba(255,255,255,0.3)',
      }}>
        <i className={`ti ${current.icon}`} style={{ fontSize: 40, color: '#fff' }} />
      </div>

      <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginBottom: 12 }}>
        PASO {step + 1} DE {steps.length}
      </p>
      <p style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 12 }}>{current.title}</p>

      {/* Paso especial: instalar en iOS */}
      {current.isIosInstall ? (
        <div style={{ maxWidth: 300, marginBottom: 32 }}>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, marginBottom: 20 }}>
            Para recibir notificaciones en tu iPhone, instala Pliego en tu pantalla de inicio:
          </p>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 16, textAlign: 'left' }}>
            {[
              { n: 1, text: 'Toca el botón compartir', icon: '⬆️' },
              { n: 2, text: 'Baja y toca "Agregar a pantalla de inicio"', icon: '➕' },
              { n: 3, text: 'Toca "Agregar" arriba a la derecha', icon: '✓' },
              { n: 4, text: 'Abre Pliego desde tu pantalla de inicio', icon: '🏠' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 }}>{s.text}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 12 }}>
            Si ya la instalaste, puedes continuar
          </p>
        </div>
      ) : (
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, marginBottom: 32, maxWidth: 280 }}>
          {current.desc}
        </p>
      )}

      {/* Dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 20 : 6, height: 6,
            borderRadius: 3,
            background: i === step ? '#fff' : 'rgba(255,255,255,0.3)',
            transition: 'all 0.3s',
          }} />
        ))}
      </div>

      {/* Botón según el paso */}
      {current.isPush ? (
        <div style={{ width: '100%', maxWidth: 300 }}>
          <button onClick={handlePush} disabled={saving} className="btn-primary" style={{ marginBottom: 10 }}>
            <i className="ti ti-bell" style={{ fontSize: 16 }} />
            Activar notificaciones
          </button>
          <button onClick={advanceOrFinish} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
            fontSize: 13, cursor: 'pointer', padding: 8,
          }}>
            Ahora no
          </button>
        </div>
      ) : isLast ? (
        <>
          <button onClick={finish} disabled={saving} className="btn-primary" style={{ maxWidth: 300 }}>
            {saving ? 'Un momento...' : '¡Listo, empezar!'}
          </button>
          {error && (
            <p style={{ fontSize: 12, color: '#FCA5A5', marginTop: 12, maxWidth: 280 }}>{error}</p>
          )}
        </>
      ) : (
        <button onClick={() => setStep(s => s + 1)} style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 14, padding: '14px 40px',
          color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', maxWidth: 300, width: '100%',
        }}>
          Siguiente <i className="ti ti-arrow-right" style={{ fontSize: 16, verticalAlign: -2 }} />
        </button>
      )}
    </div>
  )
}

