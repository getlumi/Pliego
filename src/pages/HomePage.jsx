import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { isOpenNow, todayLabel } from '../lib/hours'
import { sendOrder } from '../lib/sendOrder'

export default function HomePage({ session, onNavigate, draft, onUpdateDraft, onClearDraft, onShowTutorial }) {
  const [shops,    setShops]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [userPos,  setUserPos]  = useState(null)
  const [user,     setUser]     = useState(null)
  const [showSelectPrompt, setShowSelectPrompt] = useState(false)
  const shopsRef = useRef(null)

  // Cuando el usuario elige papelería, ocultamos el aviso
  const handleSelectShop = (shopId) => {
    onUpdateDraft({ shopId })
    setShowSelectPrompt(false)
  }

  useEffect(() => {
    if (session) loadUser()
    navigator.geolocation?.getCurrentPosition(
      pos => { setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }); loadShops(pos.coords) },
      ()  => loadShops(null),
      { enableHighAccuracy: true, timeout: 8000 }
    )

    // Realtime: actualiza saldo cuando cambia (ej. después de enviar pedido)
    const channel = supabase
      .channel(`users:${session?.user?.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'users',
        filter: `id=eq.${session?.user?.id}`,
      }, payload => {
        setUser(prev => ({ ...prev, ...payload.new }))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session])

  const loadUser = async () => {
    let { data } = await supabase.from('users').select('name, wallet_balance').eq('id', session.user.id).maybeSingle()
    if (!data) {
      const meta = session.user.user_metadata ?? {}
      // Intenta crear el perfil si aún no existe (insert ignorado si ya lo creó otra parte del flujo)
      await supabase.from('users').insert({
        id: session.user.id,
        name: meta.name ?? 'Usuario',
        phone: meta.phone ?? '',
        wallet_balance: 0,
        privacy_accepted_at: new Date().toISOString(),
        onboarding_seen: true,
      })
      const retry = await supabase.from('users').select('name, wallet_balance').eq('id', session.user.id).maybeSingle()
      data = retry.data
    }
    setUser(data)
  }

  const loadShops = async (coords) => {
    const { data } = await supabase.from('printshops').select('*, printshop_services(*)').order('rating_avg', { ascending: false })
    if (!data) { setLoading(false); return }
    let shops = data.filter(s => isOpenNow(s.hours))
    if (coords) {
      shops = shops.map(s => ({ ...s, dist: distKm(coords.latitude, coords.longitude, s.latitude, s.longitude) }))
      shops.sort((a, b) => a.dist - b.dist)
    }
    setShops(shops)
    setLoading(false)
  }

  const distKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  const selectedShop = shops.find(s => s.id === draft.shopId)

  const handleUploadTap = () => {
    if (!draft.shopId) {
      setShowSelectPrompt(true)
      shopsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    onNavigate('upload')
  }

  const serviceIcons = {
    bn_bond:      { icon: 'ti-file-text',  label: 'B/N' },
    color_bond:   { icon: 'ti-palette',    label: 'Color' },
    opalina_bn:   { icon: 'ti-sparkles',   label: 'Opalina B/N' },
    opalina_color:{ icon: 'ti-sparkles',   label: 'Opalina Color' },
    doble_carta:  { icon: 'ti-files',      label: 'Doble carta' },
  }

  const Stars = ({ rating }) => (
    <span className="stars">
      {[1,2,3,4,5].map(i => (
        <i key={i} className={`ti ${i <= Math.round(rating) ? 'ti-star-filled star-filled' : 'ti-star star-empty'}`} />
      ))}
    </span>
  )

  return (
    <div className="page">
      {/* Header */}
      <div style={{
        background: 'var(--gradient-dark)', padding: '48px 20px 24px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="ti ti-printer" style={{ fontSize: 18, color: '#fff' }} />
          </div>
          <p style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>Pliego</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginBottom: 6 }}>
            Hola, {user?.name?.split(' ')[0] ?? ''}
          </p>
          <button onClick={() => onNavigate('wallet')} style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 12, padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 6,
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            <i className="ti ti-wallet" style={{ fontSize: 16 }} />
            ${(user?.wallet_balance ?? 0).toFixed(2)}
          </button>
        </div>
      </div>

      {/* Papelería elegida */}
      {selectedShop && (
        <div style={{ padding: '0 16px', marginTop: -16, marginBottom: 10 }}>
          <div className="card" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', border: '1.5px solid var(--green)', background: 'var(--green-light)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-circle-check" style={{ fontSize: 16, color: 'var(--green)' }} />
              Imprimirás en: {selectedShop.name}
            </span>
            <button
              onClick={() => shopsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Cambiar
            </button>
          </div>
        </div>
      )}

      {/* Upload zone */}
      <div style={{ padding: '0 16px', marginTop: selectedShop ? 0 : -16 }}>
        <button onClick={handleUploadTap} style={{
          width: '100%', background: '#fff',
          border: '2px dashed var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px 16px', textAlign: 'center',
          cursor: 'pointer', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 8, position: 'relative',
        }}>
          {draft?.files?.length > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm('¿Empezarás de cero? Se perderá el documento que estás editando.')) onClearDraft()
              }}
              role="button" aria-label="Cancelar documento en edición"
              style={{
                position: 'absolute', top: 10, right: 10,
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--bg)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <i className="ti ti-x" style={{ fontSize: 13, color: 'var(--text-secondary)' }} />
            </span>
          )}
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'var(--green-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className={`ti ${draft?.files?.length > 0 ? 'ti-file-check' : 'ti-upload'}`} style={{ fontSize: 24, color: 'var(--green)' }} />
          </div>
          {draft?.files?.length > 0 ? (
            <>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Continuar con tu documento ({draft.files.length})
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Toca para seguir editando</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Sube tu documento</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>PDF, Word o fotos · Toca para empezar</p>
            </>
          )}
        </button>
      </div>

      {/* Shops list */}
      <div className="scroll-content">
        <div ref={shopsRef} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-map-pin" style={{ fontSize: 16, color: 'var(--green)' }} />
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
            Papelerías cerca de ti
          </p>
        </div>

        {showSelectPrompt && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center',
            background: 'var(--amber-light)', border: '1px solid var(--amber)',
            borderRadius: 'var(--radius-md)', padding: '10px 12px',
          }}>
            <i className="ti ti-arrow-down" style={{ fontSize: 16, color: 'var(--amber)', flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>
              Selecciona primero tu papelería con "Elegir" para continuar
            </p>
          </div>
        )}

        {loading ? (
          <p style={{ textAlign:'center', color:'var(--text-muted)', fontSize:14, padding:20 }}>Buscando...</p>
        ) : shops.length === 0 ? (
          <p style={{ textAlign:'center', color:'var(--text-muted)', fontSize:14, padding:20 }}>No hay papelerías disponibles en este momento</p>
        ) : shops.map(shop => (
          <ShopCard key={shop.id} shop={shop} serviceIcons={serviceIcons} Stars={Stars}
            isSelected={draft.shopId === shop.id}
            onSelect={() => handleSelectShop(shop.id)}
            draft={draft} session={session} user={user} onClearDraft={onClearDraft} onNavigate={onNavigate}
          />
        ))}
      </div>

      {/* Privacy link */}
      <p style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)', padding:'8px 0 4px' }}>
        <i className="ti ti-shield-check" style={{ fontSize:13, verticalAlign:-1 }} />{' '}
        <a href="#" style={{ color:'var(--text-muted)' }}>Aviso de privacidad</a>
      </p>
      <p style={{ textAlign:'center', fontSize:12, padding:'0 0 20px' }}>
        <button onClick={onShowTutorial} style={{
          background:'none', border:'none', color:'var(--text-muted)',
          fontSize:12, cursor:'pointer', textDecoration:'underline', padding:0,
        }}>
          Ver tutorial de nuevo
        </button>
      </p>
    </div>
  )
}

function ShopCard({ shop, serviceIcons, Stars, isSelected, onSelect, draft, session, user, onClearDraft, onNavigate }) {
  const [sending, setSending] = useState(false)
  const services = shop.printshop_services?.filter(s => s.enabled) ?? []

  const totalPages = draft.files.reduce((sum, f) => sum + (f.pageCount ?? 1), 0)

  // Usa el servicio elegido en UploadPage, o el primero disponible si aún no eligió
  const selectedService = shop.printshop_services?.find(s => s.id === draft.serviceId)
    ?? services[0]
    ?? null

  const total = (selectedService?.price_per_sheet ?? 0) * totalPages * draft.copies

  const handleSend = async (e) => {
    e.stopPropagation()
    if (!window.confirm(`¿Vas a enviar tu documento a ${shop.name}? Esto no se puede deshacer. Total estimado: $${total.toFixed(2)}.`)) return
    setSending(true)
    const result = await sendOrder({ session, draft, selectedService, totalPages, total })
    setSending(false)
    if (result.success) {
      onClearDraft()
      alert(`¡Listo! Tu pedido se envió a ${shop.name}. Puedes ver su estado en Historial.`)
      onNavigate('history')
    } else if (result.error === 'INSUFFICIENT_BALANCE') {
      alert('Parece que tu saldo cambió justo ahora. Te falta un poco para cubrir la cuota de $2 — recarga en Wallet y vuelve a intentar 🙂')
    } else {
      alert(result.error)
    }
  }

  return (
    <div className="card" style={{
      border: isSelected ? '1.5px solid var(--green)' : '1px solid var(--border)',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize:15, fontWeight:700 }}>{shop.name}</p>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
            <Stars rating={shop.rating_avg ?? 0} />
            <span style={{ fontSize:12, color:'var(--text-secondary)' }}>
              <i className="ti ti-star-filled" style={{ fontSize:12, color:'#EF9F27', verticalAlign:-1, marginRight:3 }} />
              {(shop.rating_avg ?? 0).toFixed(1)} promedio · {shop.rating_count ?? 0} reseñas
            </span>
          </div>
          <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:3 }}>
            {shop.dist ? `${shop.dist.toFixed(1)} km · ` : ''}{todayLabel(shop.hours)}
          </p>
        </div>
        <span style={{
          fontSize:12, background:'var(--green-light)', color:'var(--green-dark)',
          padding:'3px 10px', borderRadius:'var(--radius-full)', fontWeight:600, whiteSpace:'nowrap',
        }}>
          {shop.is_available ? 'Disponible' : 'Ocupado'}
        </span>
      </div>

      {/* Services chips */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:10 }}>
        {services.map(s => {
          const meta = serviceIcons[s.service_type] ?? { icon:'ti-file', label: s.service_type }
          return (
            <span key={s.id} style={{
              display:'flex', alignItems:'center', gap:4,
              fontSize:12, background:'var(--bg)', color:'var(--text-secondary)',
              padding:'3px 8px', borderRadius:'var(--radius-full)',
              border:'1px solid var(--border-light)',
            }}>
              <i className={`ti ${meta.icon}`} style={{ fontSize:13 }} />
              {meta.label} ${s.price_per_sheet}
            </span>
          )
        })}
      </div>

      {/* Elegir */}
      <button
        onClick={e => { e.stopPropagation(); onSelect() }}
        style={{
          width:'100%', marginTop:10, padding:10, fontSize:13, fontWeight:700,
          borderRadius:'var(--radius-md)', cursor:'pointer',
          border: isSelected ? 'none' : '1.5px solid var(--green)',
          background: isSelected ? 'var(--green)' : '#fff',
          color: isSelected ? '#fff' : 'var(--green)',
          display:'flex', alignItems:'center', justifyContent:'center', gap:6,
        }}
      >
        <i className={`ti ${isSelected ? 'ti-circle-check-filled' : 'ti-circle-check'}`} style={{ fontSize:16 }} />
        {isSelected ? 'Elegida' : 'Elegir'}
      </button>

      {isSelected && draft.files.length > 0 && (
        !selectedService ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
            Elige un tipo de impresión en "Subir documento" para enviar
          </p>
        ) : (user?.wallet_balance ?? 0) < 2 ? (
          <div style={{
            marginTop: 8, padding: '12px 14px', borderRadius: 'var(--radius-md)',
            background: 'var(--amber-light)', border: '1px solid var(--amber)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <i className="ti ti-wallet" style={{ fontSize: 18, color: 'var(--amber)', marginTop: 1, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Te falta saldo para enviar</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                Cada pedido usa $2 de tu cuenta. Recarga desde $20 y sigue imprimiendo sin complicaciones.
              </p>
              <button onClick={e => { e.stopPropagation(); onNavigate('wallet') }} style={{
                background: 'var(--green)', color: '#fff', border: 'none',
                padding: '8px 14px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <i className="ti ti-wallet" style={{ fontSize: 14 }} />
                Recargar saldo
              </button>
            </div>
          </div>
        ) : (
          <button onClick={handleSend} disabled={sending} className="btn-primary" style={{ marginTop: 8 }}>
            <i className="ti ti-send" style={{ fontSize: 16 }} />
            {sending ? 'Enviando...' : `Enviar pedido · $${total.toFixed(2)}`}
          </button>
        )
      )}
      {isSelected && draft.files.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
          Sube tu documento para poder enviarlo aquí
        </p>
      )}

      {/* Expanded detail */}
      {/* Cómo llegar y Reportar — siempre visibles */}
      <div style={{ display:'flex', gap:8, marginTop:10 }}>
        <button
          onClick={e => { e.stopPropagation(); window.open(`https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}`, '_blank') }}
          className="btn-outline" style={{ flex:1, fontSize:13, padding:'8px 12px' }}
        >
          <i className="ti ti-map-pin" style={{ fontSize:15 }} /> Cómo llegar
        </button>
        <button
          onClick={e => { e.stopPropagation(); alert('Reporte enviado') }}
          style={{
            flex:1, fontSize:13, padding:'8px 12px',
            background:'var(--red-light)', border:'1px solid #F09595',
            borderRadius:'var(--radius-md)', color:'var(--red)',
            fontWeight:700, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
          }}
        >
          <i className="ti ti-flag" style={{ fontSize:15 }} /> Reportar
        </button>
      </div>

    </div>
  )
}