import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthPage({ onAuth }) {
  const [mode,     setMode]     = useState('login')
  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [intent, setIntent] = useState('consumer') // 'consumer' | 'business'
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  // OTP
  const [otpStep,    setOtpStep]    = useState(false)
  const [otpCode,    setOtpCode]    = useState('')
  const [otpLoading, setOtpLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      const email = `${phone.replace(/\s/g,'')}@pliego.com`
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error('Número o contraseña incorrectos')
        onAuth(intent)
      } else {
        if (!name.trim())        throw new Error('Por favor escribe tu nombre')
        if (!phone.trim())       throw new Error('Por favor escribe tu WhatsApp')
        if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')

        // 1) Enviar OTP al WhatsApp
        const { data: otpData, error: otpError } = await supabase.functions.invoke('send-otp', {
          body: { action: 'send', phone: phone.replace(/\s/g,'') }
        })
        if (otpError || otpData?.error) throw new Error('No pudimos enviar el código. Verifica tu número.')

        // 2) Mostrar campo OTP
        setOtpStep(true)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    setError('')
    setOtpLoading(true)
    try {
      if (otpCode.length !== 6) throw new Error('El código debe tener 6 dígitos')

      // 1) Verificar OTP
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('send-otp', {
        body: { action: 'verify', phone: phone.replace(/\s/g,''), code: otpCode }
      })
      if (verifyError || !verifyData?.ok) throw new Error('Código incorrecto o expirado')

      // 2) Crear la cuenta
      const { data: regData, error: regError } = await supabase.functions.invoke('smart-task', {
        body: { name, phone: phone.replace(/\s/g,''), password }
      })
      if (regError) throw new Error('No se pudo crear tu cuenta. Intenta de nuevo.')
      if (regData?.error) throw new Error(regData.error)

      // 3) Iniciar sesión
      const email = `${phone.replace(/\s/g,'')}@pliego.com`
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw new Error('Tu cuenta se creó. Ahora entra con "Entrar".')
      onAuth(intent)
    } catch (e) {
      setError(e.message)
    } finally {
      setOtpLoading(false)
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
        background: 'rgba(255,255,255,0.04)', borderRadius: '50%',
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
          <i className="ti ti-printer" style={{ fontSize: 38, color: '#fff' }} />
        </div>
        <p style={{ fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: -0.5 }}>Pliego</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
          Imprime cerca de ti, sin complicaciones
        </p>

        <div style={{ display:'flex', gap:10, width:'100%', marginTop:16 }}>
          {[
            { value:'consumer', icon:'ti-user',           label:'Soy usuario' },
            { value:'business', icon:'ti-building-store', label:'Soy negocio' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setIntent(opt.value)}
              style={{
                flex:1, padding:'12px 6px', borderRadius:16,
                border:'2px solid rgba(255,255,255,0.8)',
                background: intent === opt.value ? '#fff' : 'transparent',
                color:       intent === opt.value ? '#111' : '#fff',
                cursor:'pointer', display:'flex', flexDirection:'column',
                alignItems:'center', gap:6,
                fontSize:13, fontWeight:800, fontFamily:'inherit',
              }}
            >
              <i className={`ti ${opt.icon}`} style={{ fontSize:22, color: intent === opt.value ? '#111' : '#fff' }} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Card */}
      <div style={{
        flex: 1, background: 'var(--bg)',
        borderRadius: '32px 32px 0 0',
        padding: '32px 24px 40px',
      }}>
        {intent === 'business' && (
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            background:'#111', color:'#fff', borderRadius:10,
            padding:'8px 14px', fontSize:13, fontWeight:700, marginBottom:16,
          }}>
            <i className="ti ti-building-store" style={{ fontSize:15 }} />
            Registrando como negocio
          </div>
        )}
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
              boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
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
              type={showPassword ? 'text' : 'password'} placeholder="Mínimo 6 caracteres"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={inputStyle} autoComplete="current-password" name="password"
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} style={{
              background:'none', border:'none', padding:0, cursor:'pointer',
              color:'var(--text-muted)', display:'flex', alignItems:'center', flexShrink:0,
            }} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              <i className={`ti ${showPassword ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize:18 }} />
            </button>
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

          {/* Paso OTP */}
          {otpStep && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{
                background:'#F0F9FF', border:'1.5px solid #BAE6FD',
                borderRadius:14, padding:'12px 16px',
                display:'flex', gap:10, alignItems:'flex-start',
              }}>
                <i className="ti ti-brand-whatsapp" style={{ fontSize:20, color:'#25D366', flexShrink:0, marginTop:2 }} />
                <p style={{ fontSize:13, color:'#0369A1', fontWeight:600, lineHeight:1.4 }}>
                  Enviamos un código de 6 dígitos a tu WhatsApp {phone}
                </p>
              </div>
              <Field label="CÓDIGO DE VERIFICACIÓN" icon="ti-shield-check">
                <input
                  type="tel" placeholder="123456" maxLength={6}
                  value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g,''))}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                  style={{ ...inputStyle, letterSpacing: 6, fontSize: 20, fontWeight: 800 }}
                  autoFocus
                />
              </Field>
              <button
                onClick={handleVerifyOtp} disabled={otpLoading}
                className="btn-primary" style={{ marginTop: 4, opacity: otpLoading ? 0.7 : 1 }}
              >
                {otpLoading ? 'Verificando...' : 'Verificar y crear cuenta'}
                {!otpLoading && <i className="ti ti-check" style={{ fontSize: 18 }} />}
              </button>
              <button
                onClick={() => { setOtpStep(false); setOtpCode(''); setError('') }}
                style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}
              >
                ← Cambiar número
              </button>
            </div>
          )}

          {!otpStep && (
          <button
            onClick={handleSubmit} disabled={loading}
            className="btn-primary" style={{ marginTop: 8, opacity: loading ? 0.7 : 1 }}
          >
            {loading
              ? 'Un momento...'
              : mode === 'login'
                ? (intent === 'business' ? 'Entrar a mi negocio' : 'Entrar a Pliego')
                : (intent === 'business' ? 'Crear cuenta de negocio' : 'Crear mi cuenta')}
            {!loading && <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />}
          </button>
          )}

          {/* Privacidad */}
          <p style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)', marginTop:8 }}>
            Al registrarte aceptas nuestro{' '}
            <a href="/privacidad.html" target="_blank" style={{ color:'var(--green)', textDecoration:'underline' }}>
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
  fontSize: 16, color: 'var(--text-primary)',
  background: 'transparent', fontFamily: 'inherit', width: '100%',
}

