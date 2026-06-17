import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TABS = [
  { id: 'verifications', label: 'Verificaciones', icon: 'ti-shield-check' },
  { id: 'printshops',   label: 'Papelerías',     icon: 'ti-building-store' },
  { id: 'orders',       label: 'Pedidos',         icon: 'ti-list-details' },
  { id: 'users',        label: 'Usuarios',        icon: 'ti-users' },
  { id: 'finances',     label: 'Finanzas',        icon: 'ti-cash' },
]

export default function AdminPage({ session, onSignOut }) {
  const [tab, setTab] = useState('verifications')

  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      {/* Header */}
      <div style={{ background: 'var(--gradient-dark)', padding: '48px 20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>
              <i className="ti ti-shield" style={{ fontSize: 18, marginRight: 8 }} />
              Admin · Pliego
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Panel de administración</p>
          </div>
          <button onClick={() => { if (window.confirm('¿Cerrar sesión de admin?')) onSignOut() }} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <i className="ti ti-logout" style={{ fontSize: 16, color: '#fff' }} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginTop: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flexShrink: 0, padding: '6px 12px', fontSize: 12, fontWeight: 700,
              borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
              background: tab === t.id ? '#fff' : 'rgba(255,255,255,0.15)',
              color: tab === t.id ? 'var(--text-primary)' : '#fff',
            }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 13, verticalAlign: -2, marginRight: 4 }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'verifications' && <VerificationsTab />}
      {tab === 'printshops'   && <PrintshopsTab />}
      {tab === 'orders'       && <OrdersTab />}
      {tab === 'users'        && <UsersTab />}
      {tab === 'finances'     && <FinancesTab />}
    </div>
  )
}

// ============================================================
// VERIFICACIONES
// ============================================================
function VerificationsTab() {
  const [shops, setShops] = useState([])
  const [selected, setSelected] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('printshops')
      .select('*, users(name, phone)')
      .eq('verification_status', 'pending')
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: true })
    setShops(data ?? [])
    setLoading(false)
  }

  const getDocUrl = async (path) => {
    const { data } = await supabase.storage
      .from('verification-docs')
      .createSignedUrl(path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const approve = async (shopId) => {
    await supabase.from('printshops').update({
      verified: true,
      verification_status: 'approved',
      reviewed_at: new Date().toISOString(),
    }).eq('id', shopId)
    setSelected(null)
    load()
  }

  const reject = async (shopId) => {
    if (!reason.trim()) return alert('Escribe el motivo del rechazo')
    await supabase.from('printshops').update({
      verified: false,
      verification_status: 'rejected',
      rejection_reason: reason.trim(),
      reviewed_at: new Date().toISOString(),
    }).eq('id', shopId)
    setSelected(null)
    setRejecting(false)
    setReason('')
    load()
  }

  if (loading) return <div className="scroll-content"><p style={{ color:'var(--text-muted)', textAlign:'center', padding:32 }}>Cargando...</p></div>

  if (selected) {
    const shop = shops.find(s => s.id === selected)
    return (
      <div className="scroll-content">
        <button onClick={() => { setSelected(null); setRejecting(false); setReason('') }} style={{ background:'none', border:'none', color:'var(--green)', fontWeight:700, cursor:'pointer', fontSize:13, marginBottom:8 }}>
          ← Volver a lista
        </button>

        <div className="card">
          <p style={{ fontSize:16, fontWeight:900 }}>{shop.name}</p>
          <p style={{ fontSize:13, color:'var(--text-secondary)' }}>{shop.users?.name} · {shop.users?.phone}</p>
          <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
            Enviado: {new Date(shop.submitted_at).toLocaleString('es-MX')}
          </p>
        </div>

        {/* Documentos */}
        {[
          { key: 'ine_url',           label: 'INE / Pasaporte',        icon: 'ti-id-badge' },
          { key: 'selfie_url',         label: 'Selfie con ID',          icon: 'ti-camera-selfie' },
          { key: 'address_proof_url',  label: 'Comprobante de domicilio', icon: 'ti-home' },
        ].map(doc => (
          <div key={doc.key} className="card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <i className={`ti ${doc.icon}`} style={{ fontSize:20, color:'var(--green)' }} />
              <p style={{ fontSize:13, fontWeight:600 }}>{doc.label}</p>
            </div>
            {shop[doc.key] ? (
              <button onClick={() => getDocUrl(shop[doc.key])} className="btn-outline" style={{ padding:'8px 14px', fontSize:12 }}>
                <i className="ti ti-eye" style={{ fontSize:14 }} /> Ver
              </button>
            ) : (
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>No subido</span>
            )}
          </div>
        ))}

        {/* Acciones */}
        {!rejecting ? (
          <div style={{ display:'flex', gap:10, marginTop:8 }}>
            <button onClick={() => approve(shop.id)} className="btn-primary" style={{ flex:1 }}>
              <i className="ti ti-circle-check" style={{ fontSize:16 }} /> Aprobar
            </button>
            <button onClick={() => setRejecting(true)} style={{
              flex:1, padding:12, borderRadius:'var(--radius-md)', border:'1px solid var(--red)',
              background:'var(--red-light)', color:'var(--red)', fontWeight:700, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            }}>
              <i className="ti ti-x" style={{ fontSize:16 }} /> Rechazar
            </button>
          </div>
        ) : (
          <div className="card" style={{ border:'1px solid var(--red)' }}>
            <p style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'var(--red)' }}>Motivo del rechazo</p>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Ej. La foto de la INE no es legible, por favor sube una imagen más clara."
              style={{ width:'100%', minHeight:80, resize:'none', fontSize:14, padding:'10px 12px', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', fontFamily:'inherit', marginBottom:10 }}
            />
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { setRejecting(false); setReason('') }} className="btn-outline" style={{ flex:1 }}>Cancelar</button>
              <button onClick={() => reject(shop.id)} style={{
                flex:1, padding:12, borderRadius:'var(--radius-md)', border:'none',
                background:'var(--red)', color:'#fff', fontWeight:700, cursor:'pointer',
              }}>Confirmar rechazo</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="scroll-content">
      <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>
        {shops.length === 0 ? 'No hay solicitudes pendientes' : `${shops.length} solicitud${shops.length > 1 ? 'es' : ''} pendiente${shops.length > 1 ? 's' : ''}`}
      </p>
      {shops.map(shop => (
        <div key={shop.id} className="card" style={{ cursor:'pointer' }} onClick={() => setSelected(shop.id)}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <p style={{ fontSize:14, fontWeight:700 }}>{shop.name}</p>
              <p style={{ fontSize:12, color:'var(--text-secondary)' }}>{shop.users?.name} · {shop.users?.phone}</p>
              <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                {new Date(shop.submitted_at).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
              </p>
            </div>
            <span style={{ fontSize:11, background:'var(--amber-light)', color:'#92530a', padding:'3px 8px', borderRadius:'var(--radius-full)', fontWeight:700 }}>Pendiente</span>
          </div>
          <div style={{ display:'flex', gap:6, marginTop:8 }}>
            {[shop.ine_url, shop.selfie_url, shop.address_proof_url].map((url, i) => (
              <span key={i} style={{ fontSize:11, padding:'2px 8px', borderRadius:'var(--radius-full)', background: url ? 'var(--green-light)' : 'var(--border-light)', color: url ? 'var(--green)' : 'var(--text-muted)' }}>
                {['INE', 'Selfie', 'Domicilio'][i]} {url ? '✓' : '—'}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// PAPELERÍAS
// ============================================================
function PrintshopsTab() {
  const [shops, setShops]     = useState([])
  const [filter, setFilter]   = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('printshops')
      .select('*, users(name, phone)')
      .order('created_at', { ascending: false })
    setShops(data ?? [])
    setLoading(false)
  }

  const filtered = filter === 'all' ? shops
    : filter === 'approved' ? shops.filter(s => s.verified)
    : filter === 'pending'  ? shops.filter(s => s.verification_status === 'pending')
    : shops.filter(s => s.verification_status === 'rejected')

  const STATUS = {
    approved: { label:'Verificada',  bg:'var(--green-light)',  color:'var(--green-dark)' },
    pending:  { label:'Pendiente',   bg:'var(--amber-light)',  color:'#92530a' },
    rejected: { label:'Rechazada',   bg:'var(--red-light)',    color:'var(--red)' },
  }

  return (
    <div className="scroll-content">
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {[['all','Todas'],['approved','Verificadas'],['pending','Pendientes'],['rejected','Rechazadas']].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{
            padding:'6px 12px', fontSize:12, fontWeight:700, borderRadius:'var(--radius-full)',
            border: filter === id ? 'none' : '1px solid var(--border)',
            background: filter === id ? 'var(--green)' : '#fff',
            color: filter === id ? '#fff' : 'var(--text-secondary)', cursor:'pointer',
          }}>{label} ({id === 'all' ? shops.length : id === 'approved' ? shops.filter(s=>s.verified).length : id === 'pending' ? shops.filter(s=>s.verification_status==='pending').length : shops.filter(s=>s.verification_status==='rejected').length})</button>
        ))}
      </div>

      {loading ? <p style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>Cargando...</p> :
        filtered.map(shop => {
          const st = STATUS[shop.verification_status] ?? STATUS.pending
          return (
            <div key={shop.id} className="card">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                <div>
                  <p style={{ fontSize:14, fontWeight:700 }}>{shop.name}</p>
                  <p style={{ fontSize:12, color:'var(--text-secondary)' }}>{shop.users?.name} · {shop.users?.phone}</p>
                </div>
                <span style={{ fontSize:11, background:st.bg, color:st.color, padding:'3px 8px', borderRadius:'var(--radius-full)', fontWeight:700, whiteSpace:'nowrap' }}>{st.label}</span>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <Chip label={`${shop.rating_avg?.toFixed(1) ?? '—'} ⭐`} />
                <Chip label={`${shop.rating_count ?? 0} reseñas`} />
                <Chip label={shop.is_available ? 'Disponible' : 'No disponible'} />
              </div>
              {shop.rejection_reason && (
                <p style={{ fontSize:11, color:'var(--red)', marginTop:6 }}>Motivo: {shop.rejection_reason}</p>
              )}
            </div>
          )
        })
      }
    </div>
  )
}

// ============================================================
// PEDIDOS
// ============================================================
function OrdersTab() {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase.from('orders')
      .select('*, printshops(name), users(name, phone)')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => { setOrders(data ?? []); setLoading(false) })
  }, [])

  const STATUS_COLOR = {
    nuevo:     'var(--amber-light)',
    en_proceso:'#dbeafe',
    listo:     'var(--green-light)',
    entregado: 'var(--border-light)',
  }
  const STATUS_LABEL = { nuevo:'Nuevo', en_proceso:'Imprimiendo', listo:'Listo', entregado:'Entregado' }

  const total = orders.reduce((sum, o) => sum + (o.service_fee ?? 0), 0)

  return (
    <div className="scroll-content">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <div className="card" style={{ textAlign:'center' }}>
          <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Total pedidos</p>
          <p style={{ fontSize:24, fontWeight:900 }}>{orders.length}</p>
        </div>
        <div className="card" style={{ textAlign:'center', background:'var(--green-light)' }}>
          <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Cuotas cobradas</p>
          <p style={{ fontSize:24, fontWeight:900 }}>${total.toFixed(2)}</p>
        </div>
      </div>

      {loading ? <p style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>Cargando...</p> :
        orders.map(o => (
          <div key={o.id} className="card" style={{ padding:'10px 14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
              <div>
                <p style={{ fontSize:13, fontWeight:700 }}>{o.users?.name ?? o.user_name ?? 'Usuario'}</p>
                <p style={{ fontSize:11, color:'var(--text-secondary)' }}>{o.printshops?.name}</p>
                <p style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {new Date(o.created_at).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                </p>
              </div>
              <div style={{ textAlign:'right' }}>
                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:'var(--radius-full)', fontWeight:700, background: STATUS_COLOR[o.status] ?? 'var(--bg)' }}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
                <p style={{ fontSize:12, fontWeight:700, marginTop:4 }}>${o.estimated_cost ?? 0}</p>
              </div>
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <Chip label={`${o.file_count} hoja${o.file_count > 1 ? 's' : ''}`} />
              <Chip label={`${o.copies} copia${o.copies > 1 ? 's' : ''}`} />
              <Chip label={o.color_mode === 'color' ? 'Color' : 'B/N'} />
              {o.service_fee && <Chip label={`Fee: $${o.service_fee}`} bold />}
            </div>
          </div>
        ))
      }
    </div>
  )
}

// ============================================================
// USUARIOS
// ============================================================
function UsersTab() {
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase.from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setUsers(data ?? []); setLoading(false) })
  }, [])

  const totalBalance = users.reduce((sum, u) => sum + (u.wallet_balance ?? 0), 0)

  return (
    <div className="scroll-content">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <div className="card" style={{ textAlign:'center' }}>
          <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Usuarios</p>
          <p style={{ fontSize:24, fontWeight:900 }}>{users.length}</p>
        </div>
        <div className="card" style={{ textAlign:'center', background:'var(--green-light)' }}>
          <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Saldo total</p>
          <p style={{ fontSize:24, fontWeight:900 }}>${totalBalance.toFixed(2)}</p>
        </div>
      </div>

      {loading ? <p style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>Cargando...</p> :
        users.map(u => (
          <div key={u.id} className="card" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <p style={{ fontSize:13, fontWeight:700 }}>{u.name || '—'}</p>
              <p style={{ fontSize:12, color:'var(--text-secondary)' }}>{u.phone}</p>
              <p style={{ fontSize:11, color:'var(--text-muted)' }}>
                {new Date(u.created_at).toLocaleDateString('es-MX')}
              </p>
            </div>
            <div style={{ textAlign:'right' }}>
              <p style={{ fontSize:14, fontWeight:900 }}>${(u.wallet_balance ?? 0).toFixed(2)}</p>
              {u.is_admin && <span style={{ fontSize:10, background:'var(--green)', color:'#fff', padding:'1px 6px', borderRadius:'var(--radius-full)' }}>Admin</span>}
            </div>
          </div>
        ))
      }
    </div>
  )
}

// ============================================================
// FINANZAS
// ============================================================
function FinancesTab() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod]   = useState('month')

  useEffect(() => { load() }, [period])

  const load = async () => {
    setLoading(true)
    const now = new Date()
    let since = new Date(0)
    if (period === 'today') { since = new Date(now); since.setHours(0,0,0,0) }
    else if (period === 'week') { since = new Date(now); since.setDate(now.getDate()-7) }
    else if (period === 'month') { since = new Date(now.getFullYear(), now.getMonth(), 1) }

    const [ordersRes, txRes] = await Promise.all([
      supabase.from('orders').select('service_fee, estimated_cost, status, created_at, printshop_id, printshops(name)').gte('created_at', since.toISOString()),
      supabase.from('wallet_transactions').select('amount, type, payment_method, created_at').eq('type', 'recarga').gte('created_at', since.toISOString()),
    ])

    const orders = ordersRes.data ?? []
    const txs    = txRes.data ?? []

    const totalFees     = orders.reduce((s, o) => s + (o.service_fee ?? 0), 0)
    const totalRecargas = txs.reduce((s, t) => s + (t.amount ?? 0), 0)
    const totalPedidos  = orders.length
    const entregados    = orders.filter(o => o.status === 'entregado')
    const totalImpresiones = entregados.reduce((s, o) => s + (o.estimated_cost ?? 0), 0)

    // Agrupar por papelería
    const byShop = {}
    entregados.forEach(o => {
      const id = o.printshop_id
      if (!byShop[id]) byShop[id] = { name: o.printshops?.name ?? id, total: 0, count: 0 }
      byShop[id].total += o.estimated_cost ?? 0
      byShop[id].count += 1
    })

    setData({ totalFees, totalRecargas, totalPedidos, totalImpresiones, byShop: Object.values(byShop).sort((a,b) => b.total - a.total) })
    setLoading(false)
  }

  return (
    <div className="scroll-content">
      <div style={{ display:'flex', gap:6, marginBottom:8 }}>
        {[['today','Hoy'],['week','7 días'],['month','Este mes'],['all','Todo']].map(([id, label]) => (
          <button key={id} onClick={() => setPeriod(id)} style={{
            flex:1, padding:'7px 0', fontSize:12, fontWeight:700, borderRadius:'var(--radius-md)',
            border: period === id ? 'none' : '1px solid var(--border)',
            background: period === id ? 'var(--green)' : '#fff',
            color: period === id ? '#fff' : 'var(--text-secondary)', cursor:'pointer',
          }}>{label}</button>
        ))}
      </div>

      {loading || !data ? <p style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>Cargando...</p> : <>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div className="card" style={{ background:'var(--gradient-dark)', textAlign:'center' }}>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>Ingresos Pliego</p>
            <p style={{ fontSize:26, fontWeight:900, color:'#fff' }}>${data.totalFees.toFixed(2)}</p>
            <p style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>cuotas de servicio</p>
          </div>
          <div className="card" style={{ background:'var(--gradient-dark)', textAlign:'center' }}>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>Recargas</p>
            <p style={{ fontSize:26, fontWeight:900, color:'#fff' }}>${data.totalRecargas.toFixed(2)}</p>
            <p style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>wallets recargados</p>
          </div>
          <div className="card" style={{ textAlign:'center' }}>
            <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Pedidos</p>
            <p style={{ fontSize:26, fontWeight:900 }}>{data.totalPedidos}</p>
          </div>
          <div className="card" style={{ textAlign:'center' }}>
            <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Facturado en impresiones</p>
            <p style={{ fontSize:26, fontWeight:900 }}>${data.totalImpresiones.toFixed(2)}</p>
          </div>
        </div>

        {data.byShop.length > 0 && (
          <>
            <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>Ranking de papelerías</p>
            {data.byShop.map((shop, i) => (
              <div key={i} className="card" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ fontSize:13, fontWeight:700 }}>{shop.name}</p>
                  <p style={{ fontSize:11, color:'var(--text-muted)' }}>{shop.count} pedidos entregados</p>
                </div>
                <p style={{ fontSize:16, fontWeight:900 }}>${shop.total.toFixed(2)}</p>
              </div>
            ))}
          </>
        )}
      </>}
    </div>
  )
}

// Componente auxiliar
function Chip({ label, bold }) {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', fontSize:11,
      background:'var(--bg)', color:'var(--text-secondary)',
      padding:'2px 8px', borderRadius:'var(--radius-full)',
      border:'1px solid var(--border-light)', fontWeight: bold ? 700 : 400,
    }}>{label}</span>
  )
}
