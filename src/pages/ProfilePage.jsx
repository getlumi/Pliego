import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import SupportPage  from './SupportPage'
import TutorialPage from './TutorialPage'

export default function ProfilePage({ session, onNavigate }) {
  const [showSupport,  setShowSupport]  = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const name    = session?.user?.user_metadata?.name ?? 'Usuario'
  const initial = name[0]?.toUpperCase()

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
        <button className="btn-primary" onClick={() => setShowTutorial(true)}>
          <i className="ti ti-help" style={{ fontSize:18 }} /> Ver tutorial
        </button>
        <button className="btn-primary" onClick={() => setShowSupport(true)} style={{ marginTop:8 }}>
          <i className="ti ti-headset" style={{ fontSize:18 }} /> Soporte
        </button>
        <button className="btn-outline" onClick={() => supabase.auth.signOut()} style={{ marginTop:8 }}>
          <i className="ti ti-logout" style={{ fontSize:18 }} /> Cerrar sesión
        </button>
        <a href="#" style={{ display:'block', textAlign:'center', fontSize:13, color:'var(--text-muted)', marginTop:8 }}>
          Aviso de privacidad
        </a>
      </div>
    </div>
  )
}
