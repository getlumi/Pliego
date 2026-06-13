import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function HomePage({ session, onNavigate }) {
  const [shops,    setShops]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [userPos,  setUserPos]  = useState(null)
  const [user,     setUser]     = useState(null)

  useEffect(() => {
    if (session) loadUser()
    navigator.geolocation?.getCurrentPosition(
      pos => { setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }); loadShops(pos.coords) },
      ()  => loadShops(null),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [session])

  const loadUser = async () => {
    const { data } = await supabase.from('users').select('name, wallet_balance').eq('id', session.user.id).single()
    setUser(data)
  }

  const loadShops = async (coords) => {
    const now = new Date()
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    const { data } = await supabase.from('printshops').select('*, printshop_services(*)').order('rating_avg', { ascending: false })
    if (!data) { setLoading(false); return }
    let shops = data.filter(s => s.opens_at <= hhmm && s.closes_at >= hhmm)
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
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
            {session ? `Hola, ${user?.name?.split(' ')[0] ?? ''}` : 'Bienvenido'}
          </p>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>Pliego</p>
        </div>
        {session ? (
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
        ) : (
          <button onClick={() => onNavigate('auth')} className="btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}>
            Regístrate
          </button>
        )}
      </div>

      {/* Upload zone */}
      <div style={{ padding: '0 16px', marginTop: -16 }}>
        <button onClick={() => onNavigate('upload')} style={{
          width: '100%', background: '#fff',
          border: '2px dashed var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px 16px', textAlign: 'center',
          cursor: 'pointer', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 8,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'var(--green-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="ti ti-upload" style={{ fontSize: 24, color: 'var(--green)' }} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Sube tu documento</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>PDF, Word o fotos · Toca para empezar</p>
        </button>
      </div>

      {/* Shops list */}
      <div className="scroll-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-map-pin" style={{ fontSize: 16, color: 'var(--green)' }} />
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
            Papelerías cerca de ti
          </p>
        </div>

        {loading ? (
          <p style={{ textAlign:'center', color:'var(--text-muted)', fontSize:14, padding:20 }}>Buscando...</p>
        ) : shops.length === 0 ? (
          <p style={{ textAlign:'center', color:'var(--text-muted)', fontSize:14, padding:20 }}>No hay papelerías disponibles en este momento</p>
        ) : shops.map(shop => (
          <ShopCard key={shop.id} shop={shop} serviceIcons={serviceIcons} Stars={Stars} />
        ))}
      </div>

      {/* Privacy link */}
      <p style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)', padding:'8px 0 20px' }}>
        <i className="ti ti-shield-check" style={{ fontSize:13, verticalAlign:-1 }} />{' '}
        <a href="#" style={{ color:'var(--text-muted)' }}>Aviso de privacidad</a>
      </p>
    </div>
  )
}

function ShopCard({ shop, serviceIcons, Stars }) {
  const [expanded, setExpanded] = useState(false)
  const services = shop.printshop_services?.filter(s => s.enabled) ?? []

  return (
    <div className="card" style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize:15, fontWeight:700 }}>{shop.name}</p>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
            <Stars rating={shop.rating_avg ?? 0} />
            <span style={{ fontSize:12, color:'var(--text-secondary)' }}>
              {(shop.rating_avg ?? 0).toFixed(1)} promedio · {shop.rating_count ?? 0} reseñas
            </span>
          </div>
          <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:3 }}>
            {shop.dist ? `${shop.dist.toFixed(1)} km · ` : ''}Abierto hasta {shop.closes_at}
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

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border-light)' }}>
          {shop.latest_comment && (
            <p style={{ fontSize:12, color:'var(--text-secondary)', fontStyle:'italic', marginBottom:10 }}>
              "{shop.latest_comment}"
            </p>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <button
              onClick={e => { e.stopPropagation(); window.open(`https://maps.google.com/?q=${shop.latitude},${shop.longitude}`) }}
              className="btn-outline" style={{ fontSize:13, padding:'8px 12px' }}
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
      )}
    </div>
  )
}
