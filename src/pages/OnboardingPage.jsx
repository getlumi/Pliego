import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const steps = [
  { icon: 'ti-upload',      title: 'Sube tu documento', desc: 'PDF, Word o fotos de tu identificación. Todo se elimina en 3 días.' },
  { icon: 'ti-map-pin',     title: 'Elige dónde imprimir', desc: 'Ve las papelerías abiertas cerca de ti, con precios y calificaciones.' },
  { icon: 'ti-cash',        title: 'Recoge y paga', desc: 'Pasa a recoger tu impresión y paga en efectivo directo en el lugar.' },
]

export default function OnboardingPage({ session, onComplete }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const finish = async () => {
    setSaving(true)
    await supabase.from('users').update({ onboarding_seen: true }).eq('id', session.user.id)
    onComplete()
  }

  const current = steps[step]

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
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, marginBottom: 32, maxWidth: 280 }}>
        {current.desc}
      </p>

      {/* Dots */}
      <div style={{ display:'flex', gap:6, marginBottom: 32 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 20 : 6, height: 6,
            borderRadius: 3,
            background: i === step ? '#fff' : 'rgba(255,255,255,0.3)',
            transition: 'all 0.3s',
          }} />
        ))}
      </div>

      {step < steps.length - 1 ? (
        <button onClick={() => setStep(s => s + 1)} style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 14, padding: '14px 40px',
          color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', maxWidth: 300, width: '100%',
        }}>
          Siguiente <i className="ti ti-arrow-right" style={{ fontSize: 16, verticalAlign: -2 }} />
        </button>
      ) : (
        <button onClick={finish} disabled={saving} className="btn-primary" style={{ maxWidth: 300 }}>
          {saving ? 'Un momento...' : '¡Listo, empezar!'}
        </button>
      )}
    </div>
  )
}
