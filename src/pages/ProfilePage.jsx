import React from 'react'
import { supabase } from '../lib/supabase'
export default function ProfilePage({ session, onNavigate }) {
  const name = session?.user?.user_metadata?.name ?? 'Usuario'
  const initial = name[0]?.toUpperCase()
  return (
    <div className="page">
      <div style={{ background:'var(--gradient-dark)', padding:'48px 20px 32px', textAlign:'center' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:28, fontWeight:900, color:'#fff' }}>
          {initial}
        </div>
        <p style={{ fontSize:20, fontWeight:800, color:'#fff' }}>{name}</p>
      </div>
      <div className="scroll-content">
        <button className="btn-outline" onClick={() => supabase.auth.signOut()}>
          <i className="ti ti-logout" style={{ fontSize:18 }} /> Cerrar sesión
        </button>
        <a href="#" style={{ display:'block', textAlign:'center', fontSize:13, color:'var(--text-muted)', marginTop:8 }}>
          Aviso de privacidad
        </a>
      </div>
    </div>
  )
}
