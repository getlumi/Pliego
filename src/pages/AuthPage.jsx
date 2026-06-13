import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthPage({ onAuth }) {
  const [mode,     setMode]     = useState('login')
  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [remember, setRemember] = useState(true)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      const email = `${phone.replace(/\s/g,'')}@pliego.com`
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error('Número o contraseña incorrectos')
        onAuth()
      } else {
        if (!name.trim())      throw new Error('Por favor escribe tu nombre')
        if (!phone.trim())     throw new Error('Por favor escribe tu WhatsApp')
        if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { name, phone } }
        })
        if (error) throw error
        if (data?.user) {
          await supabase.from('users').insert({
            id: data.user.id,
            name,
            phone: phone.replace(/\s/g,''),
            wallet_balance: 0,
            privacy_accepted_at: new Date().toISOString(),
            onboarding_seen: false,
          })
          onAuth()
        }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--gradient-dark)',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Decoración fondo */}
      <div style={{
        position: 'absolute', top: -60, right: -60,
        width: 200, height: 200,
        background: 'rgba(255,255,255,0.05)', borderRadius: '50%',
      }} />
      <div style={{
        position: 'absolute', bottom: -80, left: -40,
        width: 160, height: 160,
        background: 'rgba(159,225,203,0.08)', borderRadius: '50%',
      }} />

      {/* Logo */}
      <div style={{
        padding: '60px 32px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 22,
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid rgba(255,255,255,0.3)', marginBottom: 16,
        }}>
          <i className="ti ti-file-text" style={{ fontSize: 38, color: '#fff' }} />
        </div>
        <p style={{ fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: -0.5 }}>Pliego</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
          Imprime cerca de ti, sin complicaciones
        </p>
      </div>

      {/* Card */}
      <div style={{
        flex: 1, background: 'var(--bg)',
        borderRadius: '32px 32px 0 0',
        padding: '32px 24px 40px',
      }}>
        {/* Tabs */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          background: 'var(--green-light)',
          borderRadius: 14, padding: 4, marginBottom: 28,
        }}>
          {['login','register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError('') }} style={{
              background: mode === m ? '#fff' : 'transparent',
              border: 'none', borderRadius: 11,
              padding: '10px 0', fontSize: 14, fontWeight: 700,
              color: mode === m ? 'var(--green)' : 'var(--text-secondary)',
              cursor: 'pointer',
              boxShadow: mode === m ? '0 2px 8px rgba(29,158,117,0.1)' : 'none',
              transition: 'all 0.2s',
            }}>
              {m === 'login' ? 'Entrar' : 'Registrarme'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'register' && (
            <Field label="TU NOMBRE" icon="ti-user">
              <input
                type="text" placeholder="¿Cómo te llamas?"
                value={name} onChange={e => setName(e.target.value)}
                style={inputStyle} autoComplete="name"
              />
            </Field>
          )}

          <Field label="WHATSAPP" icon="ti-phone">
            <input
              type="tel" placeholder="998 123 4567"
              value={phone} onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={inputStyle} autoComplete="tel"
            />
          </Field>

          <Field label="CONTRASEÑA" icon="ti-lock">
            <input
              type="password" placeholder="Mínimo 6 caracteres"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={inputStyle} autoComplete="current-password" name="password"
            />
          </Field>

          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            Guardar contraseña en este dispositivo
          </label>

          {error && (
            <div style={{
              background: 'var(--red-light)', border: '1px solid #F09595',
              borderRadius: 12, padding: '10px 14px',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <i className="ti ti-alert-circle" style={{ fontSize:16, color:'var(--red)', flexShrink:0 }} />
              <p style={{ fontSize:13, color:'var(--red)', fontWeight:600 }}>{error}</p>
            </div>
          )}

          <button
            onClick={handleSubmit} disabled={loading}
            className="btn-primary" style={{ marginTop: 8, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Un momento...' : mode === 'login' ? 'Entrar a Pliego' : 'Crear mi cuenta'}
            {!loading && <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />}
          </button>

          {/* Privacidad */}
          <p style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)', marginTop:8 }}>
            Al registrarte aceptas nuestro{' '}
            <a href="#" style={{ color:'var(--green)', textDecoration:'underline' }}>
              aviso de privacidad
            </a>
            {' '}y términos de uso.
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, icon, children }) {
  return (
    <div>
      <p style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', marginBottom:6 }}>{label}</p>
      <div style={{
        background: '#fff', border: '1.5px solid var(--border)',
        borderRadius: 14, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className={`ti ${icon}`} style={{ fontSize:18, color:'var(--text-muted)', flexShrink:0 }} />
        {children}
      </div>
    </div>
  )
}

const inputStyle = {
  border: 'none', outline: 'none', flex: 1,
  fontSize: 14, color: 'var(--text-primary)',
  background: 'transparent', fontFamily: 'inherit', width: '100%',
}
