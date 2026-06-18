import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const TABS = [
  { id: 'verifications', label: 'KYC',       icon: 'ti-shield-check' },
  { id: 'printshops',   label: 'Imprentas',  icon: 'ti-building-store' },
  { id: 'orders',       label: 'Pedidos',    icon: 'ti-list-details' },
  { id: 'users',        label: 'Usuarios',   icon: 'ti-users' },
  { id: 'finances',     label: 'Finanzas',   icon: 'ti-cash' },
  { id: 'support',      label: 'Soporte',    icon: 'ti-headset' },
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
      {tab === 'support'      && <AdminSupportTab />}
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
            style={{ width:'100%', minHeight:70, resize:'none', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', fontFamily:'inherit' }}
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
  const [toggling, setToggling] = useState(null)

  const load = () => {
    setLoading(true)
    supabase.from('users').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setUsers(data ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const toggleActive = async (user) => {
    if (user.is_admin) return // no desactivar admins
    setToggling(user.id)
    await supabase.from('users')
      .update({ is_active: !user.is_active })
      .eq('id', user.id)
    await load()
    setToggling(null)
  }

  const totalBalance = users.reduce((sum, u) => sum + (u.wallet_balance ?? 0), 0)
  const activeUsers  = users.filter(u => u.is_active !== false)

  return (
    <div className="scroll-content">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        <div className="card" style={{ textAlign:'center' }}>
          <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Total</p>
          <p style={{ fontSize:22, fontWeight:900 }}>{users.length}</p>
        </div>
        <div className="card" style={{ textAlign:'center', background:'var(--green-light)' }}>
          <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Activos</p>
          <p style={{ fontSize:22, fontWeight:900 }}>{activeUsers.length}</p>
        </div>
        <div className="card" style={{ textAlign:'center' }}>
          <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Saldo total</p>
          <p style={{ fontSize:22, fontWeight:900 }}>${totalBalance.toFixed(0)}</p>
        </div>
      </div>

      {loading ? <p style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>Cargando...</p> :
        users.map(u => {
          const isActive = u.is_active !== false
          return (
            <div key={u.id} className="card" style={{
              opacity: isActive ? 1 : 0.6,
              border: !isActive ? '1px solid var(--red)' : undefined,
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                    <p style={{ fontSize:13, fontWeight:700 }}>{u.name || '—'}</p>
                    {u.is_admin && (
                      <span style={{ fontSize:10, background:'var(--green)', color:'#fff', padding:'1px 6px', borderRadius:'var(--radius-full)' }}>Admin</span>
                    )}
                    {!isActive && (
                      <span style={{ fontSize:10, background:'var(--red-light)', color:'var(--red)', padding:'1px 6px', borderRadius:'var(--radius-full)', fontWeight:700 }}>Desactivada</span>
                    )}
                  </div>
                  <p style={{ fontSize:12, color:'var(--text-secondary)' }}>{u.phone}</p>
                  <p style={{ fontSize:11, color:'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString('es-MX')} · ${(u.wallet_balance ?? 0).toFixed(2)}</p>
                </div>
                {!u.is_admin && (
                  <button
                    onClick={() => toggleActive(u)}
                    disabled={toggling === u.id}
                    style={{
                      flexShrink:0, padding:'7px 12px', fontSize:12, fontWeight:700,
                      borderRadius:'var(--radius-md)', cursor:'pointer',
                      border: isActive ? '1px solid var(--red)' : '1px solid var(--green)',
                      background: isActive ? 'var(--red-light)' : 'var(--green-light)',
                      color: isActive ? 'var(--red)' : 'var(--green-dark)',
                    }}
                  >
                    {toggling === u.id ? '...' : isActive ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            </div>
          )
        })
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

    // Recargas por día
    const byDayRecargas = {}
    txs.forEach(t => {
      const day = new Date(t.created_at).toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' })
      byDayRecargas[day] = (byDayRecargas[day] ?? 0) + (t.amount ?? 0)
    })

    // Registros por día (usuarios nuevos)
    const usersRes = await supabase
      .from('users')
      .select('created_at')
      .gte('created_at', since.toISOString())
    const byDayUsers = {}
    ;(usersRes.data ?? []).forEach(u => {
      const day = new Date(u.created_at).toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' })
      byDayUsers[day] = (byDayUsers[day] ?? 0) + 1
    })

    // Comisión Stripe estimada (3.6% + $3 MXN por transacción)
    const stripeCommission = txs.reduce((s, t) => s + ((t.amount ?? 0) * 0.036 + 3), 0)
    const netRevenue = totalRecargas - stripeCommission

    setData({
      totalFees, totalRecargas, totalPedidos: orders.length, totalImpresiones,
      byDay, byDayRecargas, byDayUsers, byHour, peakHour, byMethod, totalMethods,
      stripeCommission, netRevenue,
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
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>Recargas brutas</p>
            <p style={{ fontSize:26, fontWeight:900, color:'#fff' }}>${data.totalRecargas.toFixed(2)}</p>
          </div>
          <div className="card" style={{ background:'var(--gradient-dark)', textAlign:'center' }}>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>Ganancia neta</p>
            <p style={{ fontSize:26, fontWeight:900, color:'#fff' }}>${data.netRevenue.toFixed(2)}</p>
            <p style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>después de Stripe</p>
          </div>
          <div className="card" style={{ textAlign:'center' }}>
            <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Comisión Stripe est.</p>
            <p style={{ fontSize:22, fontWeight:900, color:'var(--red)' }}>-${data.stripeCommission.toFixed(2)}</p>
            <p style={{ fontSize:10, color:'var(--text-muted)' }}>3.6% + $3 por tx</p>
          </div>
          <div className="card" style={{ textAlign:'center' }}>
            <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Pedidos</p>
            <p style={{ fontSize:22, fontWeight:900 }}>{data.totalPedidos}</p>
            <p style={{ fontSize:10, color:'var(--text-muted)' }}>cuotas: ${data.totalFees.toFixed(2)}</p>
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

        {/* Solicitudes por día */}
        {Object.keys(data.byDay).length > 0 && (
          <div className="card">
            <p style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>Solicitudes por día</p>
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

        {/* Registros por día */}
        {Object.keys(data.byDayUsers).length > 0 && (
          <div className="card">
            <p style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>Registros por día</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {(() => {
                const maxU = Math.max(...Object.values(data.byDayUsers), 1)
                return Object.entries(data.byDayUsers).slice(-7).map(([day, count]) => (
                  <div key={day}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:11, color:'var(--text-secondary)' }}>{day}</span>
                      <span style={{ fontSize:11, fontWeight:700 }}>{count} usuario{count > 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ height:6, borderRadius:3, background:'var(--border-light)' }}>
                      <div style={{ height:'100%', width:`${count / maxU * 100}%`, background:'#6366f1', borderRadius:3 }} />
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>
        )}

        {/* Recargas por día */}
        {Object.keys(data.byDayRecargas).length > 0 && (
          <div className="card">
            <p style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>Recargas por día</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {(() => {
                const maxR = Math.max(...Object.values(data.byDayRecargas), 1)
                return Object.entries(data.byDayRecargas).slice(-7).map(([day, amount]) => (
                  <div key={day}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:11, color:'var(--text-secondary)' }}>{day}</span>
                      <span style={{ fontSize:11, fontWeight:700 }}>${amount.toFixed(2)}</span>
                    </div>
                    <div style={{ height:6, borderRadius:3, background:'var(--border-light)' }}>
                      <div style={{ height:'100%', width:`${amount / maxR * 100}%`, background:'var(--amber)', borderRadius:3 }} />
                    </div>
                  </div>
                ))
              })()}
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

// ============================================================
// SOPORTE — panel de admin
// ============================================================
function AdminSupportTab() {
  const [tickets, setTickets]       = useState([])
  const [selected, setSelected]     = useState(null)
  const [messages, setMessages]     = useState([])
  const [reply, setReply]           = useState('')
  const [loading, setLoading]       = useState(true)
  const [sending, setSending]       = useState(false)
  const bottomRef                   = useRef(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('support_tickets')
      .select('*, users(name, phone), support_messages(id)')
      .order('updated_at', { ascending: false })
    setTickets(data ?? [])
    setLoading(false)
  }

  const openTicket = async (ticket) => {
    setSelected(ticket)
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 100)

    // Suscribir a mensajes nuevos
    supabase.channel(`admin:support:${ticket.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'support_messages', filter:`ticket_id=eq.${ticket.id}` },
        payload => { setMessages(prev => [...prev, payload.new]); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 100) })
      .subscribe()
  }

  const sendReply = async () => {
    if (!reply.trim() || sending || !selected) return
    setSending(true)
    await supabase.from('support_messages').insert({
      ticket_id: selected.id, sender: 'admin', body: reply.trim(),
    })
    await supabase.from('support_tickets').update({
      status: 'in_review', updated_at: new Date().toISOString(),
    }).eq('id', selected.id)
    setReply('')
    setSending(false)
  }

  const setStatus = async (status) => {
    await supabase.from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', selected.id)
    setSelected(prev => ({ ...prev, status }))
    load()
  }

  const STATUS_LABEL = { open: 'Abierto', in_review: 'En revisión', resolved: 'Resuelto' }
  const STATUS_COLOR = {
    open:      { bg:'var(--amber-light)', color:'#92530a' },
    in_review: { bg:'#dbeafe', color:'#1d4ed8' },
    resolved:  { bg:'var(--green-light)', color:'var(--green-dark)' },
  }

  const openCount = tickets.filter(t => t.status !== 'resolved').length

  if (selected) return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <button onClick={() => { setSelected(null); load() }} style={{ background:'none', border:'none', color:'var(--green)', fontWeight:700, cursor:'pointer', fontSize:13 }}>
          ← Tickets
        </button>
        <div style={{ display:'flex', gap:6 }}>
          {['open','in_review','resolved'].map(s => (
            <button key={s} onClick={() => setStatus(s)} style={{
              padding:'4px 8px', fontSize:11, fontWeight:700, borderRadius:'var(--radius-full)',
              border: selected.status === s ? 'none' : '1px solid var(--border)',
              background: selected.status === s ? (STATUS_COLOR[s]?.bg ?? '#fff') : '#fff',
              color: selected.status === s ? (STATUS_COLOR[s]?.color ?? 'inherit') : 'var(--text-muted)',
              cursor:'pointer',
            }}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:'8px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg)' }}>
        <p style={{ fontSize:13, fontWeight:700 }}>{selected.subject}</p>
        <p style={{ fontSize:11, color:'var(--text-muted)' }}>{selected.users?.name} · {selected.users?.phone} · {selected.from_type === 'printshop' ? 'Papelería' : 'Usuario'}</p>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:10, paddingBottom:80 }}>
        {messages.map(m => {
          const isAdmin = m.sender === 'admin'
          return (
            <div key={m.id} style={{ display:'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth:'80%', padding:'10px 14px', borderRadius:16,
                borderBottomRightRadius: isAdmin ? 4 : 16,
                borderBottomLeftRadius: isAdmin ? 16 : 4,
                background: isAdmin ? 'var(--green)' : '#F3F4F6',
                color: isAdmin ? '#fff' : 'var(--text-primary)',
              }}>
                {!isAdmin && <p style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', marginBottom:4 }}>Cliente</p>}
                <p style={{ fontSize:14, lineHeight:1.5 }}>{m.body}</p>
                <p style={{ fontSize:10, marginTop:4, opacity:0.7, textAlign:'right' }}>
                  {new Date(m.created_at).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ position:'sticky', bottom:0, background:'#fff', borderTop:'1px solid var(--border)', padding:'12px 16px', display:'flex', gap:8, alignItems:'flex-end' }}>
        <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Responder..." rows={1}
          style={{ flex:1, resize:'none', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:20, fontFamily:'inherit', maxHeight:100 }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
        />
        <button onClick={sendReply} disabled={!reply.trim() || sending} style={{
          width:40, height:40, borderRadius:'50%', border:'none', flexShrink:0,
          background: reply.trim() ? 'var(--green)' : 'var(--border)', cursor: reply.trim() ? 'pointer' : 'default',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <i className="ti ti-send" style={{ fontSize:18, color:'#fff' }} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="scroll-content">
      <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>
        {openCount} ticket{openCount !== 1 ? 's' : ''} abierto{openCount !== 1 ? 's' : ''}
      </p>
      {loading ? <p style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>Cargando...</p> :
        tickets.length === 0 ? (
          <div className="card" style={{ textAlign:'center', padding:32 }}>
            <i className="ti ti-headset" style={{ fontSize:40, color:'var(--text-muted)', display:'block', marginBottom:12 }} />
            <p style={{ color:'var(--text-muted)', fontSize:14 }}>No hay tickets de soporte</p>
          </div>
        ) : tickets.map(t => {
          const sc = STATUS_COLOR[t.status] ?? STATUS_COLOR.open
          return (
            <div key={t.id} className="card" style={{ cursor:'pointer', border: t.status === 'open' ? '1.5px solid var(--amber)' : undefined }}
              onClick={() => openTicket(t)}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                <div>
                  <p style={{ fontSize:13, fontWeight:700 }}>{t.subject}</p>
                  <p style={{ fontSize:11, color:'var(--text-secondary)' }}>
                    {t.users?.name} · {t.from_type === 'printshop' ? 'Papelería' : 'Usuario'}
                  </p>
                  <p style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {new Date(t.updated_at).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                    {' · '}{t.support_messages?.length ?? 0} msj
                  </p>
                </div>
                <span style={{ fontSize:11, padding:'3px 8px', borderRadius:'var(--radius-full)', fontWeight:700, background:sc.bg, color:sc.color, whiteSpace:'nowrap' }}>
                  {STATUS_LABEL[t.status]}
                </span>
              </div>
            </div>
          )
        })
      }
    </div>
  )
}
