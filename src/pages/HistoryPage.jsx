import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function HistoryPage({ session, onNavigate }) {
  const [orders, setOrders] = useState([])

  useEffect(() => {
    if (!session) return
    supabase.from('orders')
      .select('*, printshops(name)')
      .eq('user_id', session.user.id)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders(data ?? []))
  }, [session])

  const statusLabel = { nuevo:'Enviado', en_proceso:'En proceso', listo:'Listo para recoger', entregado:'Entregado' }
  const statusColor = { nuevo:'var(--green-light)', en_proceso:'var(--amber-light)', listo:'var(--green)', entregado:'var(--border-light)' }

  return (
    <div className="page">
      <div style={{ background:'var(--gradient-dark)', padding:'48px 20px 24px' }}>
        <p style={{ fontSize:22, fontWeight:900, color:'#fff' }}>Mis impresiones</p>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>Últimos 3 días</p>
      </div>
      <div className="scroll-content">
        {orders.length === 0 ? (
          <div className="card" style={{ textAlign:'center', padding:32 }}>
            <i className="ti ti-history" style={{ fontSize:40, color:'var(--text-muted)', display:'block', marginBottom:12 }} />
            <p style={{ color:'var(--text-muted)', fontSize:14 }}>No tienes impresiones recientes</p>
          </div>
        ) : orders.map(o => (
          <OrderRow key={o.id} order={o} statusLabel={statusLabel} statusColor={statusColor} />
        ))}
      </div>
    </div>
  )
}

function OrderRow({ order, statusLabel, statusColor }) {
  const [open, setOpen] = useState(false)
  const expiresAt = new Date(order.expires_at)
  const hoursLeft = Math.round((expiresAt - Date.now()) / 36e5)
  const expiringSoon = hoursLeft <= 24

  return (
    <div className="card" onClick={() => setOpen(o => !o)} style={{ cursor:'pointer' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'var(--green-light)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-file-text" style={{ fontSize:18, color:'var(--green)' }} />
          </div>
          <div>
            <p style={{ fontSize:14, fontWeight:700 }}>{order.file_name ?? 'Documento'}</p>
            <p style={{ fontSize:12, color:'var(--text-secondary)' }}>{order.printshops?.name}</p>
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <span style={{ fontSize:11, background: statusColor[order.status] ?? 'var(--bg)', color:'var(--text-primary)', padding:'3px 8px', borderRadius:'var(--radius-full)', fontWeight:600 }}>
            {statusLabel[order.status] ?? order.status}
          </span>
          {expiringSoon && <p style={{ fontSize:11, color:'var(--red)', marginTop:3 }}>Expira hoy</p>}
        </div>
      </div>
      {open && (
        <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border-light)', fontSize:13, color:'var(--text-secondary)', display:'flex', flexDirection:'column', gap:4 }}>
          <p><strong>Hojas:</strong> {order.file_count} · <strong>Copias:</strong> {order.copies}</p>
          <p><strong>Tipo:</strong> {order.color_mode === 'bn' ? 'Blanco y negro' : 'Color'} · {order.paper_size}</p>
          {order.special_instructions && <p><strong>Ajustes:</strong> {order.special_instructions}</p>}
        </div>
      )}
    </div>
  )
}
