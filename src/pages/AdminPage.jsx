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
      <div style={{ background: 'var(--gradient-dark)', padding: '48px 20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>
              <i className="ti ti-shield" style={{ fontSize: 18, marginRight: 8 }} />Admin · Pliego
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
        <div style={{ display: 'flex', gap: 6, marginTop: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flexShrink: 0, padding: '6px 12px', fontSize: 12, fontWeight: 700,
              borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
              background: tab === t.id ? '#fff' : 'rgba(255,255,255,0.15)',
              color: tab === t.id ? 'var(--text-primary)' : '#fff',
            }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 13, verticalAlign: -2, marginRight: 4 }} />{t.label}
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
// VERIFICACIONES — aprobación/rechazo por documento
// ============================================================
const DOC_FIELDS = [
  { key: 'ine_url',          statusKey: 'doc_ine_status',     label: 'INE / Pasaporte',         icon: 'ti-id-badge' },
  { key: 'selfie_url',       statusKey: 'doc_selfie_status',  label: 'Selfie con ID',            icon: 'ti-camera-selfie' },
  { key: 'address_proof_url',statusKey: 'doc_address_status', label: 'Comprobante de domicilio', icon: 'ti-home' },
]

function VerificationsTab() {
  const [shops, setShops]       = useState([])
  const [selected, setSelected] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [docReasons, setDocReasons] = useState({}) // { doc_ine_status: 'rejected', ... }
  const [docStatuses, setDocStatuses] = useState({})
  const [globalReason, setGlobalReason] = useState('')
  const [loading, setLoading]   = useState(true)

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

  const openDetail = (shop) => {
    setSelected(shop)
    // Inicializar estados de documentos
    const statuses = {}
    DOC_FIELDS.forEach(d => { statuses[d.statusKey] = shop[d.statusKey] ?? 'pending' })
    setDocStatuses(statuses)
    setDocReasons({})
    setGlobalReason('')
  }

  const getDocUrl = async (path) => {
    const { data } = await supabase.storage.from('verification-docs').createSignedUrl(path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const setDocStatus = (statusKey, value) => {
    setDocStatuses(prev => ({ ...prev, [statusKey]: value }))
  }

  const canApprove = () => Object.values(docStatuses).every(s => s === 'approved')
  const hasRejected = () => Object.values(docStatuses).some(s => s === 'rejected')

  const saveDecision = async () => {
    if (!selected) return
    setSaving(true)

    const allApproved = canApprove()
    const anyRejected = hasRejected()

    // Construir razón de rechazo por documentos
    let rejectionReason = globalReason.trim()
    if (!rejectionReason && anyRejected) {
      const rejected = DOC_FIELDS.filter(d => docStatuses[d.statusKey] === 'rejected').map(d => d.label)
      rejectionReason = `Documentos rechazados: ${rejected.join(', ')}. Por favor vuelve a subirlos correctamente.`
    }

    await supabase.from('printshops').update({
      ...docStatuses,
      verified: allApproved,
      verification_status: allApproved ? 'approved' : anyRejected ? 'rejected' : 'pending',
      rejection_reason: anyRejected ? rejectionReason : null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', selected.id)

    setSaving(false)
    setSelected(null)
    load()
  }

  if (loading) return <div className="scroll-content"><p style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>Cargando...</p></div>

  if (selected) return (
    <div className="scroll-content">
      <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', color:'var(--green)', fontWeight:700, cursor:'pointer', fontSize:13, marginBottom:8 }}>
        ← Volver a lista
      </button>

      <div className="card">
        <p style={{ fontSize:16, fontWeight:900 }}>{selected.name}</p>
        <p style={{ fontSize:13, color:'var(--text-secondary)' }}>{selected.users?.name} · {selected.users?.phone}</p>
        <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
          Enviado: {new Date(selected.submitted_at).toLocaleString('es-MX')}
        </p>
      </div>

      {/* Documento por documento con botones individuales */}
      {DOC_FIELDS.map(doc => {
        const status = docStatuses[doc.statusKey] ?? 'pending'
        return (
          <div key={doc.key} className="card">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <i className={`ti ${doc.icon}`} style={{ fontSize:20, color:'var(--green)' }} />
                <p style={{ fontSize:13, fontWeight:700 }}>{doc.label}</p>
              </div>
              {selected[doc.key] ? (
                <button onClick={() => getDocUrl(selected[doc.key])} className="btn-outline" style={{ padding:'6px 12px', fontSize:12 }}>
                  <i className="ti ti-eye" style={{ fontSize:13 }} /> Ver
                </button>
              ) : (
                <span style={{ fontSize:12, color:'var(--text-muted)' }}>No subido</span>
              )}
            </div>

            {/* Estado del documento */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
              {[
                { value:'pending',  label:'Pendiente', bg:'var(--border-light)', color:'var(--text-muted)' },
                { value:'approved', label:'✓ Correcto', bg:'var(--green-light)', color:'var(--green-dark)' },
                { value:'rejected', label:'✗ Rechazar', bg:'var(--red-light)',   color:'var(--red)' },
              ].map(opt => (
                <button key={opt.value} onClick={() => setDocStatus(doc.statusKey, opt.value)} style={{
                  padding:'8px 4px', fontSize:12, fontWeight:700, borderRadius:'var(--radius-md)',
                  border: status === opt.value ? '2px solid currentColor' : '1px solid transparent',
                  background: status === opt.value ? opt.bg : 'var(--bg)',
                  color: status === opt.value ? opt.color : 'var(--text-muted)',
                  cursor:'pointer',
                }}>{opt.label}</button>
              ))}
            </div>
          </div>
        )
      })}

      {/* Mensaje adicional si hay rechazos */}
      {hasRejected() && (
        <div className="card">
          <p style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'var(--red)' }}>Mensaje al solicitante (opcional)</p>
          <textarea value={globalReason} onChange={e => setGlobalReason(e.target.value)}
            placeholder="Agrega instrucciones adicionales si lo necesitas..."
            style={{ width:'100%', minHeight:70, resize:'none', fontSize:13, padding:'10px 12px', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', fontFamily:'inherit' }}
          />
        </div>
      )}

      {/* Resumen y acción final */}
      <div className="card" style={{
        background: canApprove() ? 'var(--green-light)' : hasRejected() ? 'var(--red-light)' : 'var(--bg)',
        border: canApprove() ? '1px solid var(--green)' : hasRejected() ? '1px solid #F09595' : '1px solid var(--border)',
      }}>
        <p style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>
          {canApprove() ? '✓ Todos los documentos correctos — listo para aprobar' :
           hasRejected() ? '✗ Hay documentos rechazados — se notificará al solicitante' :
           'Revisa cada documento antes de decidir'}
        </p>
        <button onClick={saveDecision} disabled={saving || Object.values(docStatuses).every(s => s === 'pending')}
          style={{
            width:'100%', padding:12, marginTop:8, borderRadius:'var(--radius-md)', border:'none',
            background: canApprove() ? 'var(--green)' : hasRejected() ? 'var(--red)' : 'var(--border)',
            color: '#fff', fontWeight:700, fontSize:14, cursor:'pointer',
          }}>
          {saving ? 'Guardando...' : canApprove() ? '✓ Aprobar papelería' : hasRejected() ? '✗ Enviar rechazo' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="scroll-content">
      <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>
        {shops.length === 0 ? 'No hay solicitudes pendientes ✓' : `${shops.length} solicitud${shops.length > 1 ? 'es' : ''} pendiente${shops.length > 1 ? 's' : ''}`}
      </p>
      {shops.map(shop => (
        <div key={shop.id} className="card" style={{ cursor:'pointer' }} onClick={() => openDetail(shop)}>
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
            {DOC_FIELDS.map(d => (
              <span key={d.key} style={{
                fontSize:11, padding:'2px 8px', borderRadius:'var(--radius-full)',
                background: shop[d.statusKey] === 'approved' ? 'var(--green-light)' : shop[d.statusKey] === 'rejected' ? 'var(--red-light)' : 'var(--border-light)',
                color: shop[d.statusKey] === 'approved' ? 'var(--green-dark)' : shop[d.statusKey] === 'rejected' ? 'var(--red)' : 'var(--text-muted)',
              }}>
                {d.label.split(' ')[0]} {shop[d.key] ? (shop[d.statusKey] === 'approved' ? '✓' : shop[d.statusKey] === 'rejected' ? '✗' : '·') : '—'}
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

  useEffect(() => {
    setLoading(true)
    supabase.from('printshops').select('*, users(name, phone)')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setShops(data ?? []); setLoading(false) })
  }, [])

  const counts = {
    all:      shops.length,
    approved: shops.filter(s => s.verified).length,
    pending:  shops.filter(s => s.verification_status === 'pending').length,
    rejected: shops.filter(s => s.verification_status === 'rejected').length,
  }
  const filtered = filter === 'all' ? shops
    : filter === 'approved' ? shops.filter(s => s.verified)
    : filter === 'pending'  ? shops.filter(s => s.verification_status === 'pending')
    : shops.filter(s => s.verification_status === 'rejected')

  const STATUS = {
    approved: { label:'Verificada', bg:'var(--green-light)', color:'var(--green-dark)' },
    pending:  { label:'Pendiente',  bg:'var(--amber-light)', color:'#92530a' },
    rejected: { label:'Rechazada',  bg:'var(--red-light)',   color:'var(--red)' },
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
          }}>{label} ({counts[id]})</button>
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
                <span style={{ fontSize:11, background:st.bg, color:st.color, padding:'3px 8px', borderRadius:'var(--radius-full)', fontWeight:700 }}>{st.label}</span>
              </div>
              {shop.rejection_reason && (
                <p style={{ fontSize:11, color:'var(--red)', marginTop:4 }}>Motivo: {shop.rejection_reason}</p>
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

  const STATUS_COLOR = { nuevo:'var(--amber-light)', en_proceso:'#dbeafe', listo:'var(--green-light)', entregado:'var(--border-light)' }
  const STATUS_LABEL = { nuevo:'Nuevo', en_proceso:'Imprimiendo', listo:'Listo', entregado:'Entregado' }
  const totalFees = orders.reduce((sum, o) => sum + (o.service_fee ?? 0), 0)

  return (
    <div className="scroll-content">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <div className="card" style={{ textAlign:'center' }}>
          <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Total pedidos</p>
          <p style={{ fontSize:24, fontWeight:900 }}>{orders.length}</p>
        </div>
        <div className="card" style={{ textAlign:'center', background:'var(--green-light)' }}>
          <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Cuotas cobradas</p>
          <p style={{ fontSize:24, fontWeight:900 }}>${totalFees.toFixed(2)}</p>
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
              {o.service_fee > 0 && <Chip label={`Fee: $${o.service_fee}`} bold />}
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
    supabase.from('users').select('*').order('created_at', { ascending: false })
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
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <p style={{ fontSize:13, fontWeight:700 }}>{u.name || '—'}</p>
                {u.is_admin && <span style={{ fontSize:10, background:'var(--green)', color:'#fff', padding:'1px 6px', borderRadius:'var(--radius-full)' }}>Admin</span>}
              </div>
              <p style={{ fontSize:12, color:'var(--text-secondary)' }}>{u.phone}</p>
              <p style={{ fontSize:11, color:'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString('es-MX')}</p>
            </div>
            <p style={{ fontSize:16, fontWeight:900 }}>${(u.wallet_balance ?? 0).toFixed(2)}</p>
          </div>
        ))
      }
    </div>
  )
}

// ============================================================
// FINANZAS — por día, por hora, % método de pago, por zona
// ============================================================
function FinancesTab() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')

  useEffect(() => { load() }, [period])

  const load = async () => {
    setLoading(true)
    const now = new Date()
    let since = new Date(0)
    if (period === 'today') { since = new Date(now); since.setHours(0,0,0,0) }
    else if (period === 'week')  { since = new Date(now); since.setDate(now.getDate()-7) }
    else if (period === 'month') { since = new Date(now.getFullYear(), now.getMonth(), 1) }

    const [ordersRes, txRes] = await Promise.all([
      supabase.from('orders')
        .select('service_fee, estimated_cost, status, created_at, printshop_id, printshops(name, latitude, longitude)')
        .gte('created_at', since.toISOString()),
      supabase.from('wallet_transactions')
        .select('amount, type, payment_method, created_at')
        .eq('type', 'recarga')
        .gte('created_at', since.toISOString()),
    ])

    const orders = ordersRes.data ?? []
    const txs    = txRes.data ?? []

    // Totales generales
    const totalFees      = orders.reduce((s, o) => s + (o.service_fee ?? 0), 0)
    const totalRecargas  = txs.reduce((s, t) => s + (t.amount ?? 0), 0)
    const entregados     = orders.filter(o => o.status === 'entregado')
    const totalImpresiones = entregados.reduce((s, o) => s + (o.estimated_cost ?? 0), 0)

    // Ingresos por día (últimos 7 días)
    const byDay = {}
    orders.forEach(o => {
      const day = new Date(o.created_at).toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' })
      byDay[day] = (byDay[day] ?? 0) + (o.service_fee ?? 0)
    })

    // Ingresos por hora del día
    const byHour = Array(24).fill(0)
    orders.forEach(o => {
      const h = new Date(o.created_at).getHours()
      byHour[h] += (o.service_fee ?? 0)
    })
    const peakHour = byHour.indexOf(Math.max(...byHour))

    // % método de pago
    const byMethod = { tarjeta: 0, oxxo: 0 }
    txs.forEach(t => {
      if (t.payment_method === 'tarjeta') byMethod.tarjeta += t.amount ?? 0
      else if (t.payment_method === 'oxxo') byMethod.oxxo += t.amount ?? 0
    })
    const totalMethods = byMethod.tarjeta + byMethod.oxxo || 1

    // Por papelería (ranking)
    const byShop = {}
    entregados.forEach(o => {
      const id = o.printshop_id
      if (!byShop[id]) byShop[id] = { name: o.printshops?.name ?? id, total: 0, count: 0 }
      byShop[id].total += o.estimated_cost ?? 0
      byShop[id].count += 1
    })

    setData({
      totalFees, totalRecargas, totalPedidos: orders.length, totalImpresiones,
      byDay, byHour, peakHour, byMethod, totalMethods,
      byShop: Object.values(byShop).sort((a, b) => b.total - a.total),
    })
    setLoading(false)
  }

  const maxDay = data ? Math.max(...Object.values(data.byDay), 1) : 1
  const maxHour = data ? Math.max(...data.byHour, 1) : 1

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

        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div className="card" style={{ background:'var(--gradient-dark)', textAlign:'center' }}>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>Ingresos Pliego</p>
            <p style={{ fontSize:26, fontWeight:900, color:'#fff' }}>${data.totalFees.toFixed(2)}</p>
          </div>
          <div className="card" style={{ background:'var(--gradient-dark)', textAlign:'center' }}>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>Recargas</p>
            <p style={{ fontSize:26, fontWeight:900, color:'#fff' }}>${data.totalRecargas.toFixed(2)}</p>
          </div>
          <div className="card" style={{ textAlign:'center' }}>
            <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Pedidos</p>
            <p style={{ fontSize:26, fontWeight:900 }}>{data.totalPedidos}</p>
          </div>
          <div className="card" style={{ textAlign:'center' }}>
            <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Facturado impresiones</p>
            <p style={{ fontSize:26, fontWeight:900 }}>${data.totalImpresiones.toFixed(2)}</p>
          </div>
        </div>

        {/* Método de pago */}
        <div className="card">
          <p style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>Método de recarga</p>
          {[
            { label:'Tarjeta', amount: data.byMethod.tarjeta, color:'var(--green)' },
            { label:'OXXO',    amount: data.byMethod.oxxo,    color:'var(--amber)' },
          ].map(m => (
            <div key={m.label} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:12, fontWeight:700 }}>{m.label}</span>
                <span style={{ fontSize:12, color:'var(--text-secondary)' }}>
                  ${m.amount.toFixed(2)} · {Math.round(m.amount / data.totalMethods * 100)}%
                </span>
              </div>
              <div style={{ height:8, borderRadius:4, background:'var(--border-light)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${m.amount / data.totalMethods * 100}%`, background:m.color, borderRadius:4 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Ingresos por día */}
        {Object.keys(data.byDay).length > 0 && (
          <div className="card">
            <p style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>Ingresos por día</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {Object.entries(data.byDay).slice(-7).map(([day, amount]) => (
                <div key={day}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:11, color:'var(--text-secondary)' }}>{day}</span>
                    <span style={{ fontSize:11, fontWeight:700 }}>${amount.toFixed(2)}</span>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:'var(--border-light)' }}>
                    <div style={{ height:'100%', width:`${amount / maxDay * 100}%`, background:'var(--green)', borderRadius:3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hora pico */}
        <div className="card">
          <p style={{ fontSize:13, fontWeight:800, marginBottom:4 }}>Hora pico de actividad</p>
          <p style={{ fontSize:28, fontWeight:900, color:'var(--green)' }}>
            {data.peakHour}:00 — {data.peakHour + 1}:00 hrs
          </p>
          <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:4 }}>Es cuando más pedidos se generan</p>
          {/* Mini gráfica de horas */}
          <div style={{ display:'flex', gap:2, alignItems:'flex-end', height:40, marginTop:12 }}>
            {data.byHour.map((val, h) => (
              <div key={h} title={`${h}:00 — $${val.toFixed(2)}`} style={{
                flex:1, background: h === data.peakHour ? 'var(--green)' : 'var(--border-light)',
                borderRadius:2,
                height: `${Math.max(val / maxHour * 100, 4)}%`,
              }} />
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
            <span style={{ fontSize:10, color:'var(--text-muted)' }}>0h</span>
            <span style={{ fontSize:10, color:'var(--text-muted)' }}>12h</span>
            <span style={{ fontSize:10, color:'var(--text-muted)' }}>23h</span>
          </div>
        </div>

        {/* Ranking de papelerías */}
        {data.byShop.length > 0 && (
          <div className="card">
            <p style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>Ranking de papelerías</p>
            {data.byShop.map((shop, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:8, borderBottom: i < data.byShop.length-1 ? '1px solid var(--border-light)' : 'none', marginBottom: i < data.byShop.length-1 ? 8 : 0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:16, fontWeight:900, color:'var(--text-muted)', width:20 }}>#{i+1}</span>
                  <div>
                    <p style={{ fontSize:13, fontWeight:700 }}>{shop.name}</p>
                    <p style={{ fontSize:11, color:'var(--text-muted)' }}>{shop.count} pedidos</p>
                  </div>
                </div>
                <p style={{ fontSize:15, fontWeight:900 }}>${shop.total.toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}
      </>}
    </div>
  )
}

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
