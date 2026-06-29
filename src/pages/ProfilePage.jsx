import React, { useState, useEffect } from 'react'
import { registerPush, isPushSupported, isIOS, isStandalone } from '../lib/push'
import { supabase } from '../lib/supabase'
import SupportPage  from './SupportPage'
import TutorialPage from './TutorialPage'

export default function ProfilePage({ session, onNavigate }) {
  const [showSupport,  setShowSupport]  = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [pushStatus,   setPushStatus]   = useState('idle') // idle | requesting | granted | denied | unsupported
  const name    = session?.user?.user_metadata?.name ?? 'Usuario'
  const initial = name[0]?.toUpperCase()

  useEffect(() => {
    if (!isPushSupported()) { setPushStatus('unsupported'); return }
    if (Notification.permission === 'granted') setPushStatus('granted')
    else if (Notification.permission === 'denied') setPushStatus('denied')
  }, [])

  const activatePush = async () => {
    if (!isPushSupported()) return
    setPushStatus('requesting')
    const result = await registerPush(session.user.id)
    if (result.ok) setPushStatus('granted')
    else if (result.reason === 'denied') setPushStatus('denied')
    else setPushStatus('idle')
  }

  if (showSupport) return (
    <SupportPage session={session} fromType="user" onBack={() => setShowSupport(false)} />
  )

  if (showTutorial) return (
    <TutorialPage type="user" onClose={() => setShowTutorial(false)} />
  )

  return (
    <div className="page">
      <div style={{ background:'var(--gradient-dark)', padding:'48px 20px 32px', textAlign:'center' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:28, fontWeight:900, color:'#fff' }}>
          {initial}
        </div>
        <p style={{ fontSize:20, fontWeight:800, color:'#fff' }}>{name}</p>
      </div>
      <div className="scroll-content">
        {/* Notificaciones push */}
        {pushStatus === 'granted' ? (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px',
            background:'var(--green-light)', borderRadius:'var(--radius-md)', marginBottom:8 }}>
            <i className="ti ti-bell-check" style={{ fontSize:20, color:'var(--green-dark)' }} />
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:'var(--green-dark)' }}>Notificaciones activas</p>
              <p style={{ fontSize:11, color:'var(--green-dark)', opacity:0.8 }}>Te avisaremos cuando tu pedido esté listo</p>
            </div>
          </div>
        ) : pushStatus === 'denied' ? (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px',
            background:'var(--red-light)', borderRadius:'var(--radius-md)', marginBottom:8 }}>
            <i className="ti ti-bell-off" style={{ fontSize:20, color:'var(--red)' }} />
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:'var(--red)' }}>Notificaciones bloqueadas</p>
              <p style={{ fontSize:11, color:'var(--red)', opacity:0.8 }}>Actívalas en la configuración de tu navegador</p>
            </div>
          </div>
        ) : pushStatus === 'unsupported' || (isIOS() && !isStandalone()) ? (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px',
            background:'#FFF8E1', border:'1px solid #F59E0B', borderRadius:'var(--radius-md)', marginBottom:8 }}>
            <i className="ti ti-device-mobile" style={{ fontSize:20, color:'#854F0B' }} />
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:'#854F0B' }}>Instala la app para notificaciones</p>
              <p style={{ fontSize:11, color:'#854F0B', opacity:0.8 }}>Toca Compartir → "Añadir a inicio" en Safari</p>
            </div>
          </div>
        ) : (
          <button className="btn-primary" onClick={activatePush}
            disabled={pushStatus === 'requesting'} style={{ marginBottom:8 }}>
            <i className="ti ti-bell" style={{ fontSize:18 }} />
            {pushStatus === 'requesting' ? 'Activando...' : '🔔 Activar notificaciones'}
          </button>
        )}

        <button className="btn-primary" onClick={() => setShowTutorial(true)}>
          <i className="ti ti-help" style={{ fontSize:18 }} /> Ver tutorial
        </button>
        <button className="btn-primary" onClick={() => setShowSupport(true)} style={{ marginTop:8 }}>
          <i className="ti ti-headset" style={{ fontSize:18 }} /> Soporte
        </button>
        <button className="btn-outline" onClick={() => supabase.auth.signOut()} style={{ marginTop:8 }}>
          <i className="ti ti-logout" style={{ fontSize:18 }} /> Cerrar sesión
        </button>
        <a href="/privacidad.html" target="_blank" style={{ display:'block', textAlign:'center', fontSize:13, color:'var(--text-muted)', marginTop:8 }}>
          Aviso de privacidad
        </a>
      </div>
    </div>
  )
}

