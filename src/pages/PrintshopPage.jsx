import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { DAY_KEYS, DAY_LABELS, DEFAULT_HOURS } from '../lib/hours'

const SERVICE_OPTIONS = [
  { type: 'bn_bond',       icon: 'ti-file-text', label: 'B/N · Bond carta',     defaultPrice: 1 },
  { type: 'color_bond',    icon: 'ti-palette',   label: 'Color · Bond carta',   defaultPrice: 5 },
  { type: 'opalina_bn',    icon: 'ti-sparkles',  label: 'Opalina · B/N',        defaultPrice: 3 },
  { type: 'opalina_color', icon: 'ti-sparkles',  label: 'Opalina · Color',      defaultPrice: 8 },
  { type: 'doble_carta',   icon: 'ti-files',     label: 'Doble carta / oficio', defaultPrice: 2 },
]

const STATUS_LABEL = { nuevo: 'Nuevo', en_proceso: 'En proceso', listo: 'Listo', entregado: 'Entregado' }
const STATUS_BADGE = { nuevo: 'badge-green', en_proceso: 'badge-amber', listo: 'badge-green', entregado: 'badge' }

function deriveCustom(services) {
  return services
    .filter(s => !SERVICE_OPTIONS.some(opt => opt.type === s.service_type))
    .map(s => ({ id: s.id, service_type: s.service_type, label: s.label ?? s.service_type, price: s.price_per_sheet, enabled: s.enabled }))
}

export default function PrintshopPage({ session }) {
  const [loading, setLoading] = useState(true)
  const [shop, setShop]       = useState(null)
  const [services, setServices] = useState([])
  const [orders, setOrders]   = useState([])
  const [tab, setTab]         = useState('orders')

  useEffect(() => { loadShop() }, [])

  const loadShop = async () => {
    const { data } = await supabase
      .from('printshops')
      .select('*, printshop_services(*)')
      .eq('owner_id', session.user.id)
      .maybeSingle()
    setShop(data)
    setServices(data?.printshop_services ?? [])
    if (data) await loadOrders(data.id)
    setLoading(false)
  }

  const loadOrders = async (shopId) => {
    const { data } = await supabase
      .from('orders')
      .select('id, created_at, status, file_name, file_url, file_count, copies, orientation, color_mode, paper_size, service_type, estimated_cost, special_instructions, ready_at, delivered_at, user_name, expires_at')
      .eq('printshop_id', shopId)
      .order('created_at', { ascending: false })
    setOrders(data ?? [])
  }

  if (loading) {
    return (
      <div className="page" style={{ paddingBottom: 0 }}>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>
      </div>
    )
  }

  if (!shop) return <RegisterShop session={session} onRegistered={loadShop} />

  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <div style={{ background: 'var(--gradient-dark)', padding: '48px 20px 20px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:32, height:32, borderRadius:10, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-printer" style={{ fontSize:18, color:'#fff' }} />
            </div>
            <p style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>Pliego · Negocio</p>
          </div>
          <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff' }}>
            {shop.name?.[0]?.toUpperCase() ?? 'P'}
          </div>
        </div>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>{shop.name}</p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, padding:'14px 16px 0' }}>
        {[
          {id:'orders',   label:'Pedidos',     icon:'ti-list-details'},
          {id:'earnings', label:'Ganancias',   icon:'ti-cash'},
          {id:'config',   label:'Config',      icon:'ti-settings'},
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:1, padding:'10px 0', borderRadius:'var(--radius-md)',
            border: tab === t.id ? 'none' : '1px solid var(--border)',
            background: tab === t.id ? 'var(--gradient)' : '#fff',
            color: tab === t.id ? '#fff' : 'var(--text-secondary)',
            fontSize:12, fontWeight:700, cursor:'pointer',
          }}>
            <i className={`ti ${t.icon}`} style={{ fontSize:14, verticalAlign:-2, marginRight:4 }} />{t.label}
          </button>
        ))}
      </div>

      {tab === 'orders'
        ? <OrdersTab shop={shop} orders={orders} setOrders={setOrders} onReload={loadShop} />
        : tab === 'earnings'
        ? <EarningsTab shop={shop} />
        : <ConfigTab shop={shop} services={services} onSaved={loadShop} />}
    </div>
  )
}

// ============================================================
// REGISTRO
// ============================================================
export function RegisterShop({ session, onRegistered, onCancel }) {
  const [name, setName]   = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [coords, setCoords] = useState(null)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const getLocation = () => {
    setError('')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false) },
      ()  => { setError('No pudimos obtener tu ubicación. Revisa los permisos del navegador.'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const submit = async () => {
    setError('')
    if (!name.trim())     return setError('Escribe el nombre de tu negocio')
    if (!whatsapp.trim()) return setError('Escribe tu número de WhatsApp')
    if (!coords)          return setError('Necesitamos tu ubicación para registrarte')

    setSaving(true)
    const { data: shop, error: shopError } = await supabase
      .from('printshops')
      .insert({
        name: name.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        whatsapp: whatsapp.replace(/\s/g,''),
        owner_id: session.user.id,
        hours: DEFAULT_HOURS,
      })
      .select()
      .single()

    if (shopError) {
      setError('No se pudo registrar tu papelería. Intenta de nuevo.')
      setSaving(false)
      return
    }

    // Servicios por defecto (B/N bond activado, el resto desactivado con precio sugerido)
    await supabase.from('printshop_services').insert(
      SERVICE_OPTIONS.map(s => ({
        printshop_id: shop.id,
        service_type: s.type,
        price_per_sheet: s.defaultPrice,
        enabled: s.type === 'bn_bond',
      }))
    )

    onRegistered()
  }

  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <div className="scroll-content" style={{ paddingTop: 48 }}>
        <div className="card">
          <p style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>Registra tu negocio</p>
          <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:16 }}>
            Toma 1 minuto. Solo necesitamos tu ubicación exacta.
          </p>

          <button onClick={getLocation} disabled={locating} className={coords ? 'btn-outline' : 'btn-primary'} style={{ marginBottom: 14 }}>
            <i className={`ti ${coords ? 'ti-circle-check' : 'ti-current-location'}`} style={{ fontSize:16 }} />
            {locating ? 'Buscando ubicación...' : coords ? 'Ubicación obtenida' : 'Usar mi ubicación actual'}
          </button>

          <label style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>NOMBRE DE TU PAPELERÍA</label>
          <input type="text" placeholder="Ej. Papelería Lupita" value={name} onChange={e => setName(e.target.value)}
            style={{ width:'100%', marginBottom:14, padding:'12px 14px', border:'1.5px solid var(--border)', borderRadius:'var(--radius-md)' }} />

          <label style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>WHATSAPP PARA AVISOS DE PEDIDOS</label>
          <input type="tel" placeholder="998 123 4567" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
            style={{ width:'100%', marginBottom:14, padding:'12px 14px', border:'1.5px solid var(--border)', borderRadius:'var(--radius-md)' }} />

          {error && (
            <div style={{ background:'var(--red-light)', border:'1px solid #F09595', borderRadius:12, padding:'10px 14px', marginBottom:14, display:'flex', gap:8, alignItems:'center' }}>
              <i className="ti ti-alert-circle" style={{ fontSize:16, color:'var(--red)', flexShrink:0 }} />
              <p style={{ fontSize:13, color:'var(--red)', fontWeight:600 }}>{error}</p>
            </div>
          )}

          <button onClick={submit} disabled={saving} className="btn-primary">
            {saving ? 'Registrando...' : 'Registrar mi papelería'}
            {!saving && <i className="ti ti-arrow-right" style={{ fontSize:16 }} />}
          </button>

          {onCancel && (
            <button onClick={onCancel} style={{
              width:'100%', marginTop:10, background:'none', border:'none',
              color:'var(--text-muted)', fontSize:13, cursor:'pointer', textAlign:'center',
            }}>
              No tengo papelería, soy cliente
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// TAB: PEDIDOS
// ============================================================
function OrdersTab({ shop, orders, setOrders, onReload }) {
  const [toggling, setToggling] = useState(false)

  // Realtime: llegan pedidos nuevos sin refresh
  useEffect(() => {
    const channel = supabase
      .channel(`orders:printshop:${shop.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `printshop_id=eq.${shop.id}`,
      }, () => onReload())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [shop.id])

  const pending = orders.filter(o => o.status === 'nuevo' || o.status === 'en_proceso')
  const today = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString())
  const cashToCollect = pending.reduce((sum, o) => sum + (o.estimated_cost ?? 0), 0)

  const toggleAvailable = async () => {
    setToggling(true)
    await supabase.from('printshops').update({ is_available: !shop.is_available }).eq('id', shop.id)
    await onReload()
    setToggling(false)
  }

  const updateStatus = async (orderId, status) => {
    const extra = status === 'listo' ? { ready_at: new Date().toISOString() }
      : status === 'entregado' ? { delivered_at: new Date().toISOString() } : {}
    await supabase.from('orders').update({ status, ...extra }).eq('id', orderId)
    await onReload()
  }

  const download = async (order) => {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(order.file_url, 60)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank')
    else alert('No se pudo generar el enlace de descarga')
  }

  const fmtTime = (iso) => iso
    ? new Date(iso).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : null

  return (
    <div className="scroll-content">
      <div style={{ display:'flex', gap:8 }}>
        <SummaryCard label="Pendientes" value={pending.length} />
        <SummaryCard label="Hoy" value={today.length} />
        <SummaryCard label="Por cobrar" value={`$${cashToCollect.toFixed(0)}`} highlight />
      </div>

      <div className="card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:14, fontWeight:700 }}>Recibiendo pedidos</span>
        <ToggleSwitch checked={shop.is_available} onChange={toggleAvailable} disabled={toggling} />
      </div>

      <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>Pedidos</p>

      {orders.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:32 }}>
          <i className="ti ti-inbox" style={{ fontSize:40, color:'var(--text-muted)', display:'block', marginBottom:12 }} />
          <p style={{ color:'var(--text-muted)', fontSize:14 }}>Todavía no te ha llegado ningún pedido</p>
        </div>
      ) : orders.map(o => (
        <div key={o.id} className="card" style={{
          border: o.status === 'nuevo' ? '1.5px solid var(--amber)' :
                  o.status === 'en_proceso' ? '1.5px solid var(--green)' : undefined,
        }}>

          {/* Nombre del cliente — prominente arriba */}
          <div style={{
            display:'flex', alignItems:'center', gap:8,
            background: o.status === 'nuevo' ? 'var(--amber-light)' : 'var(--green-light)',
            borderRadius:'var(--radius-md)', padding:'8px 12px', marginBottom:10,
          }}>
            <div style={{
              width:32, height:32, borderRadius:'50%',
              background: o.status === 'nuevo' ? 'var(--amber)' : 'var(--green)',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            }}>
              <i className="ti ti-user" style={{ fontSize:16, color:'#fff' }} />
            </div>
            <div>
              <p style={{ fontSize:14, fontWeight:900 }}>{o.user_name ?? 'Cliente'}</p>
              <p style={{ fontSize:11, color:'var(--text-secondary)' }}>
                Llegó: {fmtTime(o.created_at)}
              </p>
            </div>
            <span className={`badge ${STATUS_BADGE[o.status]}`} style={{ marginLeft:'auto' }}>
              {STATUS_LABEL[o.status]}
            </span>
          </div>

          {/* Nombre del archivo */}
          <p style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'var(--text-secondary)' }}>
            <i className="ti ti-file-text" style={{ fontSize:14, verticalAlign:-2 }} /> {o.file_name ?? 'Documento'}
          </p>

          {/* Chips de detalle */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
            <Chip icon="ti-file-text" label={`${o.file_count} hoja${o.file_count > 1 ? 's' : ''}`} />
            <Chip icon="ti-copy" label={`${o.copies} copia${o.copies > 1 ? 's' : ''}`} />
            <Chip icon={o.color_mode === 'color' ? 'ti-palette' : 'ti-file-text'} label={`${o.color_mode === 'color' ? 'Color' : 'B/N'} · ${o.paper_size}`} />
            {o.estimated_cost != null && <Chip label={`$${o.estimated_cost}`} bold />}
          </div>

          {/* Tiempos discretos */}
          {(o.ready_at || o.delivered_at) && (
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8, display:'flex', flexDirection:'column', gap:2 }}>
              {o.ready_at && <span><i className="ti ti-clock" style={{ fontSize:11 }} /> Listo a las {fmtTime(o.ready_at)}</span>}
              {o.delivered_at && <span><i className="ti ti-circle-check" style={{ fontSize:11 }} /> Entregado: {fmtTime(o.delivered_at)}</span>}
            </div>
          )}

          {/* 3 botones independientes, siempre visibles */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>

            {/* Botón 1: Descargar — siempre activo */}
            <button onClick={() => download(o)} style={{
              padding:'8px 4px', fontSize:12, fontWeight:700, cursor:'pointer',
              borderRadius:'var(--radius-md)', border:'1px solid var(--border)', background:'#fff',
              color:'var(--text-primary)', display:'flex', alignItems:'center', justifyContent:'center', gap:4,
            }}>
              <i className="ti ti-download" style={{ fontSize:14 }} /> Bajar
            </button>

            {/* Botón 2: Imprimiendo — activo cuando es 'nuevo' */}
            <button
              onClick={() => o.status === 'nuevo' && updateStatus(o.id, 'en_proceso')}
              style={{
                padding:'8px 4px', fontSize:12, fontWeight:700,
                borderRadius:'var(--radius-md)', border:'none',
                cursor: o.status === 'nuevo' ? 'pointer' : 'default',
                background: o.status === 'nuevo' ? 'var(--amber)' :
                            ['en_proceso','listo','entregado'].includes(o.status) ? 'var(--green-light)' : 'var(--border)',
                color: o.status === 'nuevo' ? '#fff' :
                       ['en_proceso','listo','entregado'].includes(o.status) ? 'var(--green-dark)' : 'var(--text-muted)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:4,
              }}>
              <i className={`ti ${['en_proceso','listo','entregado'].includes(o.status) ? 'ti-circle-check-filled' : 'ti-printer'}`} style={{ fontSize:14 }} />
              {o.status === 'nuevo' ? 'Imprimir' : 'Impreso ✓'}
            </button>

            {/* Botón 3: Listo / Entregado */}
            <button
              onClick={() => {
                if (o.status === 'en_proceso') updateStatus(o.id, 'listo')
                else if (o.status === 'listo') updateStatus(o.id, 'entregado')
              }}
              style={{
                padding:'8px 4px', fontSize:12, fontWeight:700,
                borderRadius:'var(--radius-md)', border:'none',
                cursor: ['en_proceso','listo'].includes(o.status) ? 'pointer' : 'default',
                background: o.status === 'entregado' ? 'var(--green-light)' :
                            o.status === 'listo' ? '#2A2A2A' :
                            o.status === 'en_proceso' ? 'var(--green)' : 'var(--border)',
                color: o.status === 'entregado' ? 'var(--green-dark)' :
                       ['listo','en_proceso'].includes(o.status) ? '#fff' : 'var(--text-muted)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:4,
              }}>
              <i className={`ti ${o.status === 'entregado' ? 'ti-circle-check-filled' : o.status === 'listo' ? 'ti-hand-stop' : 'ti-check'}`} style={{ fontSize:14 }} />
              {o.status === 'entregado' ? 'Entregado ✓' : o.status === 'listo' ? 'Entregar' : 'Listo'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// TAB: GANANCIAS
// ============================================================
function EarningsTab({ shop }) {
  const [orders, setOrders] = useState([])
  const [period, setPeriod] = useState('week') // 'today' | 'week' | 'month' | 'all'
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEarnings()
  }, [period])

  const loadEarnings = async () => {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select('id, created_at, delivered_at, status, estimated_cost, file_name, file_count, copies, color_mode, user_name, service_fee')
      .eq('printshop_id', shop.id)
      .eq('status', 'entregado')
      .order('delivered_at', { ascending: false })

    const now = new Date()
    if (period === 'today') {
      const start = new Date(now); start.setHours(0,0,0,0)
      query = query.gte('delivered_at', start.toISOString())
    } else if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 7)
      query = query.gte('delivered_at', start.toISOString())
    } else if (period === 'month') {
      const start = new Date(now); start.setDate(1); start.setHours(0,0,0,0)
      query = query.gte('delivered_at', start.toISOString())
    }

    const { data } = await query
    setOrders(data ?? [])
    setLoading(false)
  }

  const SERVICE_FEE = 2 // cuota de Pliego por pedido
  const totalBruto = orders.reduce((sum, o) => sum + (o.estimated_cost ?? 0), 0)
  const totalCuotas = orders.length * SERVICE_FEE
  const totalNeto = totalBruto - totalCuotas

  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es-MX', { day:'numeric', month:'short' }) : '-'
  const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' }) : '-'

  const PERIODS = [
    { id:'today', label:'Hoy' },
    { id:'week',  label:'7 días' },
    { id:'month', label:'Este mes' },
    { id:'all',   label:'Todo' },
  ]

  return (
    <div className="scroll-content">

      {/* Selector de periodo */}
      <div style={{ display:'flex', gap:6 }}>
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)} style={{
            flex:1, padding:'8px 0', fontSize:12, fontWeight:700, borderRadius:'var(--radius-md)',
            border: period === p.id ? 'none' : '1px solid var(--border)',
            background: period === p.id ? 'var(--green)' : '#fff',
            color: period === p.id ? '#fff' : 'var(--text-secondary)',
            cursor:'pointer',
          }}>{p.label}</button>
        ))}
      </div>

      {/* Resumen */}
      <div className="card" style={{ background:'var(--gradient-dark)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
          <div>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:2 }}>Pedidos entregados</p>
            <p style={{ fontSize:28, fontWeight:900, color:'#fff' }}>{orders.length}</p>
          </div>
          <div style={{ textAlign:'right' }}>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:2 }}>Total cobrado</p>
            <p style={{ fontSize:28, fontWeight:900, color:'#fff' }}>${totalBruto.toFixed(2)}</p>
          </div>
        </div>
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.15)', paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>Cuota Pliego ({orders.length} × $2)</p>
            <p style={{ fontSize:14, color:'rgba(255,255,255,0.7)', fontWeight:700 }}>-${totalCuotas.toFixed(2)}</p>
          </div>
          <div style={{ textAlign:'right' }}>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>Tus ganancias netas</p>
            <p style={{ fontSize:22, fontWeight:900, color:'#fff' }}>${totalNeto.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Lista de pedidos entregados */}
      <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>
        Detalle de pedidos
      </p>

      {loading ? (
        <div className="card" style={{ textAlign:'center', padding:24 }}>
          <p style={{ color:'var(--text-muted)', fontSize:14 }}>Cargando...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:32 }}>
          <i className="ti ti-cash" style={{ fontSize:40, color:'var(--text-muted)', display:'block', marginBottom:12 }} />
          <p style={{ color:'var(--text-muted)', fontSize:14 }}>No hay pedidos entregados en este periodo</p>
        </div>
      ) : orders.map(o => (
        <div key={o.id} className="card" style={{ padding:'12px 14px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
            <div>
              <p style={{ fontSize:13, fontWeight:700 }}>{o.user_name ?? 'Cliente'}</p>
              <p style={{ fontSize:11, color:'var(--text-muted)' }}>
                {fmtDate(o.delivered_at)} · {fmtTime(o.delivered_at)}
              </p>
            </div>
            <div style={{ textAlign:'right' }}>
              <p style={{ fontSize:15, fontWeight:900, color:'var(--green)' }}>${(o.estimated_cost ?? 0).toFixed(2)}</p>
              <p style={{ fontSize:10, color:'var(--text-muted)' }}>-$2.00 cuota</p>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <Chip icon="ti-file-text" label={`${o.file_count} hoja${o.file_count > 1 ? 's' : ''}`} />
            <Chip icon="ti-copy" label={`${o.copies} copia${o.copies > 1 ? 's' : ''}`} />
            <Chip icon={o.color_mode === 'color' ? 'ti-palette' : 'ti-file-text'} label={o.color_mode === 'color' ? 'Color' : 'B/N'} />
            <Chip label={`Neto: $${((o.estimated_cost ?? 0) - SERVICE_FEE).toFixed(2)}`} bold />
          </div>
        </div>
      ))}

    </div>
  )
}


function ConfigTab({ shop, services, onSaved }) {
  const [name, setName] = useState(shop.name)
  const [hours, setHours] = useState(() => {
    const h = shop.hours ?? DEFAULT_HOURS
    // copia profunda para no mutar el prop
    const copy = {}
    DAY_KEYS.forEach(d => { copy[d] = (h[d] ?? []).map(p => ({ ...p })) })
    return copy
  })
  const [svcState, setSvcState] = useState(() => {
    const byType = {}
    services.forEach(s => { byType[s.service_type] = { enabled: s.enabled, price: s.price_per_sheet } })
    SERVICE_OPTIONS.forEach(opt => {
      if (!byType[opt.type]) byType[opt.type] = { enabled: false, price: opt.defaultPrice }
    })
    return byType
  })

  // Tipos personalizados (cualquier service_type que no sea de los 5 predefinidos)
  const [customServices, setCustomServices] = useState(() => deriveCustom(services))
  const [removedCustomIds, setRemovedCustomIds] = useState([])
  const [newCustomLabel, setNewCustomLabel] = useState('')
  const [newCustomPrice, setNewCustomPrice] = useState('')

  // Re-sincroniza tras guardar (cuando el padre recarga `services` con los ids reales)
  useEffect(() => { setCustomServices(deriveCustom(services)) }, [services])

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const toggleService = (type) => {
    setSvcState(prev => ({ ...prev, [type]: { ...prev[type], enabled: !prev[type].enabled } }))
  }
  const setPrice = (type, price) => {
    setSvcState(prev => ({ ...prev, [type]: { ...prev[type], price } }))
  }

  const toggleCustomService = (idx) => {
    setCustomServices(prev => prev.map((s,i) => i===idx ? { ...s, enabled: !s.enabled } : s))
  }
  const setCustomPrice = (idx, price) => {
    setCustomServices(prev => prev.map((s,i) => i===idx ? { ...s, price } : s))
  }
  const updateCustomLabel = (idx, label) => {
    setCustomServices(prev => prev.map((s,i) => i===idx ? { ...s, label } : s))
  }
  const addCustomService = () => {
    if (!newCustomLabel.trim()) return
    setCustomServices(prev => [...prev, {
      id: null, service_type: `custom_${Date.now()}`, label: newCustomLabel.trim(),
      price: newCustomPrice || 0, enabled: true,
    }])
    setNewCustomLabel('')
    setNewCustomPrice('')
  }
  const removeCustomService = (idx) => {
    const item = customServices[idx]
    if (item.id) setRemovedCustomIds(prev => [...prev, item.id])
    setCustomServices(prev => prev.filter((_, i) => i !== idx))
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)

    await supabase.from('printshops').update({
      name: name.trim(),
      hours,
    }).eq('id', shop.id)

    for (const opt of SERVICE_OPTIONS) {
      const s = svcState[opt.type]
      await supabase.from('printshop_services').upsert({
        printshop_id: shop.id,
        service_type: opt.type,
        price_per_sheet: Number(s.price) || 0,
        enabled: s.enabled,
      }, { onConflict: 'printshop_id,service_type' })
    }

    for (const cs of customServices) {
      if (cs.id) {
        await supabase.from('printshop_services').update({
          label: cs.label.trim(),
          price_per_sheet: Number(cs.price) || 0,
          enabled: cs.enabled,
        }).eq('id', cs.id)
      } else {
        await supabase.from('printshop_services').insert({
          printshop_id: shop.id,
          service_type: cs.service_type,
          label: cs.label.trim(),
          price_per_sheet: Number(cs.price) || 0,
          enabled: cs.enabled,
        })
      }
    }

    for (const id of removedCustomIds) {
      await supabase.from('printshop_services').delete().eq('id', id)
    }
    setRemovedCustomIds([])

    setSaving(false)
    setSaved(true)
    onSaved()
  }

  return (
    <div className="scroll-content">
      <div className="card">
        <label style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>NOMBRE DEL NEGOCIO</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          style={{ width:'100%', marginBottom:14, padding:'12px 14px', border:'1.5px solid var(--border)', borderRadius:'var(--radius-md)' }} />

        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', marginBottom:2 }}>HORARIOS</label>
          {DAY_KEYS.map(day => (
            <DayHours
              key={day}
              label={DAY_LABELS[day]}
              periods={hours[day]}
              onChange={periods => setHours(prev => ({ ...prev, [day]: periods }))}
            />
          ))}
          <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
            Si abres en dos turnos (ej. mañana y tarde), usa "+ Agregar turno".
          </p>
        </div>
      </div>

      <div className="card">
        <p style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>Tipos de impresión disponibles</p>
        <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:12 }}>Selecciona y define el precio por hoja</p>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {SERVICE_OPTIONS.map(opt => {
            const s = svcState[opt.type]
            return (
              <label key={opt.type} style={{
                display:'flex', alignItems:'center', gap:10,
                border:'1px solid var(--border)', borderRadius:'var(--radius-md)',
                padding:'10px 12px', cursor:'pointer',
                opacity: s.enabled ? 1 : 0.55,
              }}>
                <input type="checkbox" checked={s.enabled} onChange={() => toggleService(opt.type)} style={{ width:'auto' }} />
                <i className={`ti ${opt.icon}`} style={{ fontSize:18, color:'var(--text-secondary)' }} />
                <span style={{ flex:1, fontSize:14 }}>{opt.label}</span>
                <span style={{ fontSize:13, color:'var(--text-secondary)' }}>$</span>
                <input type="number" min="0" step="0.5" value={s.price} disabled={!s.enabled}
                  onChange={e => setPrice(opt.type, e.target.value)}
                  style={{ width:56, padding:'6px 8px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)' }} />
              </label>
            )
          })}

          {customServices.map((s, idx) => (
            <div key={s.id ?? `new-${idx}`} style={{
              display:'flex', alignItems:'center', gap:10,
              border:'1px solid var(--border)', borderRadius:'var(--radius-md)',
              padding:'10px 12px', opacity: s.enabled ? 1 : 0.55,
            }}>
              <input type="checkbox" checked={s.enabled} onChange={() => toggleCustomService(idx)} style={{ width:'auto' }} />
              <i className="ti ti-file" style={{ fontSize:18, color:'var(--text-secondary)' }} />
              <input type="text" value={s.label} onChange={e => updateCustomLabel(idx, e.target.value)}
                placeholder="Nombre del tipo"
                style={{ flex:1, fontSize:14, border:'none', background:'transparent', padding:0, color:'var(--text-primary)' }} />
              <span style={{ fontSize:13, color:'var(--text-secondary)' }}>$</span>
              <input type="number" min="0" step="0.5" value={s.price} disabled={!s.enabled}
                onChange={e => setCustomPrice(idx, e.target.value)}
                style={{ width:56, padding:'6px 8px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)' }} />
              <button onClick={() => removeCustomService(idx)} aria-label="Eliminar tipo" style={{
                width:24, height:24, borderRadius:'50%', border:'none', background:'var(--red-light)',
                color:'var(--red)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0,
              }}>
                <i className="ti ti-x" style={{ fontSize:13 }} />
              </button>
            </div>
          ))}
        </div>

        {/* Agregar tipo personalizado */}
        <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center' }}>
          <input type="text" placeholder="Ej. Cartulina, Adhesivo..." value={newCustomLabel}
            onChange={e => setNewCustomLabel(e.target.value)}
            style={{ flex:1, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', fontSize:13 }} />
          <span style={{ fontSize:13, color:'var(--text-secondary)' }}>$</span>
          <input type="number" min="0" step="0.5" placeholder="0" value={newCustomPrice}
            onChange={e => setNewCustomPrice(e.target.value)}
            style={{ width:56, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', fontSize:13 }} />
          <button onClick={addCustomService} disabled={!newCustomLabel.trim()} aria-label="Agregar tipo" style={{
            width:32, height:32, borderRadius:'var(--radius-sm)', border:'none', flexShrink:0,
            background: newCustomLabel.trim() ? 'var(--green)' : 'var(--border)',
            color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
          }}>
            <i className="ti ti-plus" style={{ fontSize:16 }} />
          </button>
        </div>
        <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>
          Agrega aquí otros tipos de hoja que manejes (cartulina, adhesivo, fotográfico, etc.) con su precio por hoja.
        </p>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary">
        <i className="ti ti-check" style={{ fontSize:16 }} />
        {saving ? 'Guardando...' : saved ? 'Guardado ✓' : 'Guardar configuración'}
      </button>

      <button
        onClick={() => { if (window.confirm('¿Seguro que quieres cerrar sesión?')) supabase.auth.signOut() }}
        style={{
          width:'100%', marginTop:6, padding:12, background:'none',
          border:'1px solid var(--border)', borderRadius:'var(--radius-md)',
          color:'var(--text-secondary)', fontSize:13, fontWeight:600, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:6,
        }}
      >
        <i className="ti ti-logout" style={{ fontSize:15 }} />
        Cerrar sesión
      </button>
    </div>
  )
}

// ============================================================
// Componentes auxiliares
// ============================================================
function SummaryCard({ label, value, highlight }) {
  return (
    <div className="card" style={{ flex:1, textAlign:'center', padding:12, background: highlight ? 'var(--green-light)' : '#fff' }}>
      <p style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:2 }}>{label}</p>
      <p style={{ fontSize:20, fontWeight:900 }}>{value}</p>
    </div>
  )
}

function Chip({ icon, label, bold }) {
  return (
    <span style={{
      display:'flex', alignItems:'center', gap:4, fontSize:12,
      background:'var(--bg)', color:'var(--text-secondary)',
      padding:'3px 8px', borderRadius:'var(--radius-full)',
      border:'1px solid var(--border-light)',
      fontWeight: bold ? 700 : 400,
    }}>
      {icon && <i className={`ti ${icon}`} style={{ fontSize:13 }} />}
      {label}
    </span>
  )
}

function DayHours({ label, periods, onChange }) {
  const closed = periods.length === 0

  const updatePeriod = (idx, key, value) => {
    const copy = periods.map((p, i) => i === idx ? { ...p, [key]: value } : p)
    onChange(copy)
  }
  const addPeriod = () => onChange([...periods, { open: '16:00', close: '20:00' }])
  const removePeriod = (idx) => onChange(periods.filter((_, i) => i !== idx))
  const toggleClosed = () => onChange(closed ? [{ open: '09:00', close: '21:00' }] : [])

  return (
    <div style={{ border:'1px solid var(--border-light)', borderRadius:'var(--radius-md)', padding:'8px 10px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: closed ? 0 : 6 }}>
        <span style={{ fontSize:13, fontWeight:700, width:80 }}>{label}</span>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-secondary)', cursor:'pointer' }}>
          <input type="checkbox" checked={!closed} onChange={toggleClosed} style={{ width:'auto' }} />
          {closed ? 'Cerrado' : 'Abierto'}
        </label>
      </div>

      {!closed && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {periods.map((p, idx) => (
            <div key={idx} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input type="time" value={p.open} onChange={e => updatePeriod(idx, 'open', e.target.value)}
                style={{ flex:1, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', fontSize:13 }} />
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>–</span>
              <input type="time" value={p.close} onChange={e => updatePeriod(idx, 'close', e.target.value)}
                style={{ flex:1, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', fontSize:13 }} />
              {periods.length > 1 && (
                <button onClick={() => removePeriod(idx)} aria-label="Quitar turno" style={{
                  width:28, height:28, borderRadius:'50%', border:'none', background:'var(--red-light)',
                  color:'var(--red)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0,
                }}>
                  <i className="ti ti-x" style={{ fontSize:13 }} />
                </button>
              )}
            </div>
          ))}
          {periods.length < 2 && (
            <button onClick={addPeriod} style={{
              alignSelf:'flex-start', background:'none', border:'none',
              color:'var(--green)', fontSize:12, fontWeight:700, cursor:'pointer', padding:'2px 0',
            }}>
              <i className="ti ti-plus" style={{ fontSize:12, verticalAlign:-1 }} /> Agregar turno
            </button>
          )}
        </div>
      )}
    </div>
  )
}


function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <label style={{ position:'relative', display:'inline-block', width:44, height:24, cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled}
        style={{ opacity:0, width:0, height:0 }} />
      <span style={{
        position:'absolute', inset:0, borderRadius:12,
        background: checked ? 'var(--green)' : '#D9D9D6',
        transition:'0.2s',
      }}>
        <span style={{
          position:'absolute', top:3, left: checked ? 23 : 3,
          width:18, height:18, borderRadius:'50%',
          background:'#fff', transition:'0.2s',
        }} />
      </span>
    </label>
  )
}
