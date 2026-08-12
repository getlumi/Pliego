import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import SupportPage  from './SupportPage'
import TutorialPage from './TutorialPage'

export default function ProfilePage({ session, onNavigate }) {
  const [showSupport,  setShowSupport]  = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [saving, setSaving]   = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [error, setError]     = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => { loadProfile() }, [session])

  const loadProfile = async () => {
    const { data } = await supabase.from('users').select('name, avatar_url')
      .eq('id', session.user.id).maybeSingle()
    setProfile(data)
    setEditName(data?.name ?? '')
  }

  const name    = profile?.name || 'Usuario'
  const initial = name[0]?.toUpperCase()

  const saveName = async () => {
    if (!editName.trim()) { setError('Escribe tu nombre'); return }
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('users')
      .update({ name: editName.trim() }).eq('id', session.user.id)
    if (updateError) { setError('No se pudo guardar. Intenta de nuevo.'); setSaving(false); return }
    // Mantener sincronizado el metadata de auth (lo usa el registro/otros flujos)
    await supabase.auth.updateUser({ data: { name: editName.trim() } })
    setProfile(p => ({ ...p, name: editName.trim() }))
    setSaving(false)
    setEditing(false)
  }

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Elige una imagen (JPG o PNG)'); return }
    if (file.size > 5 * 1024 * 1024) { setError('La imagen debe pesar menos de 5MB'); return }

    setUploadingPhoto(true)
    setError('')
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${session.user.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage.from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) { setError('No se pudo subir la foto. Intenta de nuevo.'); setUploadingPhoto(false); return }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    // Cache-bust para que se vea la foto nueva de inmediato, no la vieja en caché
    const freshUrl = `${urlData.publicUrl}?t=${Date.now()}`

    const { error: updateError } = await supabase.from('users')
      .update({ avatar_url: freshUrl }).eq('id', session.user.id)
    if (updateError) { setError('La foto se subió pero no se pudo guardar. Intenta de nuevo.'); setUploadingPhoto(false); return }

    setProfile(p => ({ ...p, avatar_url: freshUrl }))
    setUploadingPhoto(false)
    e.target.value = ''
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
        <div style={{ position:'relative', width:88, height:88, margin:'0 auto 12px' }}>
          <div style={{
            width:88, height:88, borderRadius:'50%', overflow:'hidden',
            background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:32, fontWeight:900, color:'#fff',
          }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="Tu foto de perfil" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : initial}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            aria-label="Cambiar foto de perfil"
            style={{
              position:'absolute', bottom:-2, right:-2, width:30, height:30, borderRadius:'50%',
              background:'var(--accent)', border:'2.5px solid #0A0A0A',
              display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
            }}
          >
            <i className={`ti ${uploadingPhoto ? 'ti-loader-2' : 'ti-camera'}`} style={{ fontSize:14, color:'#16803C' }} />
          </button>
          <input
            ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange}
            style={{ position:'absolute', width:1, height:1, opacity:0, overflow:'hidden', pointerEvents:'none' }}
          />
        </div>

        {editing ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <input
              type="text" value={editName} onChange={e => setEditName(e.target.value)}
              autoFocus
              style={{
                fontSize:18, fontWeight:800, textAlign:'center', color:'#111',
                background:'#fff', border:'none', borderRadius:10, padding:'8px 14px',
                width:'80%', maxWidth:240,
              }}
            />
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { setEditing(false); setEditName(profile?.name ?? ''); setError('') }} style={{
                background:'rgba(255,255,255,0.15)', color:'#fff', border:'none', borderRadius:8,
                padding:'6px 14px', fontSize:13, fontWeight:700, cursor:'pointer',
              }}>Cancelar</button>
              <button onClick={saveName} disabled={saving} style={{
                background:'var(--accent)', color:'#16803C', border:'none', borderRadius:8,
                padding:'6px 14px', fontSize:13, fontWeight:700, cursor:'pointer',
              }}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} style={{
            background:'none', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', gap:6, margin:'0 auto',
          }}>
            <p style={{ fontSize:20, fontWeight:800, color:'#fff' }}>{name}</p>
            <i className="ti ti-pencil" style={{ fontSize:15, color:'rgba(255,255,255,0.6)' }} />
          </button>
        )}

        {error && <p style={{ fontSize:12, color:'#FFB4B4', marginTop:8 }}>{error}</p>}
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
        <a href="/privacidad.html" target="_blank" style={{ display:'block', textAlign:'center', fontSize:13, color:'var(--text-muted)', marginTop:8 }}>
          Aviso de privacidad
        </a>
      </div>
    </div>
  )
}
