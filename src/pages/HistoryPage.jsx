import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_LABEL = {
  nuevo:      'Enviado',
  en_proceso: 'Imprimiendo',
  listo:      'Listo para recoger',
  entregado:  'Entregado',
}
const STATUS_COLOR = {
  nuevo:      { bg:'var(--green-light)',  text:'var(--green-dark)' },
  en_proceso: { bg:'var(--amber-light)',  text:'#92530a' },
  listo:      { bg:'var(--green)',        text:'#fff' },
  entregado:  { bg:'var(--border-light)', text:'var(--text-secondary)' },
}

export default function HistoryPage({ session }) {
  const [orders, setOrders]         = useState([])
  const [ratingOrder, setRatingOrder] = useState(null) // pedido para calificar

  const load = () => {
    if (!session) return
    supabase.from('orders')
      .select('*, printshops(name)')
      .eq('user_id', session.user.id)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders(data ?? []))
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`orders:user:${session?.user?.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: `user_id=eq.${session?.user?.id}`,
      }, payload => {
        setOrders(prev => prev.map(o => {
          if (o.id !== payload.new.id) return o
          // Si acaba de ser marcado como entregado, mostrar encuesta
          if (payload.new.status === 'entregado' && o.status !== 'entregado' && !payload.new.rated) {
            setRatingOrder({ ...o, ...payload.new })
          }
          return { ...o, ...payload.new }
        }))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session])

  return (
    <div className="page">
      {/* Modal de encuesta */}
      {ratingOrder && (
        <RatingModal
          order={ratingOrder}
          onClose={() => setRatingOrder(null)}
          onDone={() => { setRatingOrder(null); load() }}
        />
      )}

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
          <OrderRow key={o.id} order={o} onRate={setRatingOrder} />
        ))}
      </div>
    </div>
  )
}

function OrderRow({ order: o, onRate }) {
  const [open, setOpen] = useState(false)
  const sc = STATUS_COLOR[o.status] ?? { bg:'var(--bg)', text:'var(--text-primary)' }
  const fmtTime = iso => iso
    ? new Date(iso).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : null

  return (
    <div className="card" style={{
      cursor:'pointer',
      border: o.status === 'listo' ? '1.5px solid var(--green)' : undefined,
    }} onClick={() => setOpen(v => !v)}>

      {/* Banner "lista para recoger" */}
      {o.status === 'listo' && (
        <div style={{
          display:'flex', alignItems:'center', gap:8,
          background:'var(--green)', borderRadius:'var(--radius-md)',
          padding:'8px 12px', marginBottom:10,
        }}>
          <i className="ti ti-circle-check-filled" style={{ fontSize:18, color:'#fff' }} />
          <p style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
            ¡Tu impresión está lista! Pasa a recogerla.
          </p>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'var(--green-light)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <i className="ti ti-file-text" style={{ fontSize:18, color:'var(--green)' }} />
          </div>
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:14, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.file_name ?? 'Documento'}</p>
            <p style={{ fontSize:12, color:'var(--text-secondary)' }}>{o.printshops?.name}</p>
          </div>
        </div>
        <span style={{
          fontSize:11, padding:'3px 8px', borderRadius:'var(--radius-full)', fontWeight:700,
          background: sc.bg, color: sc.text, flexShrink:0, whiteSpace:'nowrap',
        }}>
          {STATUS_LABEL[o.status] ?? o.status}
        </span>
      </div>

      {open && (
        <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border-light)', fontSize:12, color:'var(--text-secondary)', display:'flex', flexDirection:'column', gap:4 }}>
          <p><strong>Hojas:</strong> {o.file_count} · <strong>Copias:</strong> {o.copies}</p>
          <p><strong>Tipo:</strong> {o.color_mode === 'bn' ? 'Blanco y negro' : 'Color'} · {o.paper_size}</p>
          {o.estimated_cost != null && <p><strong>Total:</strong> ${o.estimated_cost}</p>}
          <p style={{ color:'var(--text-muted)' }}><i className="ti ti-clock" style={{ fontSize:11 }} /> Enviado: {fmtTime(o.created_at)}</p>
          {o.ready_at && <p style={{ color:'var(--text-muted)' }}><i className="ti ti-check" style={{ fontSize:11 }} /> Listo: {fmtTime(o.ready_at)}</p>}
          {o.delivered_at && <p style={{ color:'var(--text-muted)' }}><i className="ti ti-circle-check" style={{ fontSize:11 }} /> Entregado: {fmtTime(o.delivered_at)}</p>}
          {o.special_instructions && <p><strong>Instrucciones:</strong> {o.special_instructions}</p>}
        </div>
      )}

      {/* Botón de calificar si ya fue entregado y no ha sido calificado */}
      {o.status === 'entregado' && !o.rated && (
        <button onClick={e => { e.stopPropagation(); onRate(o) }} style={{
          marginTop:10, width:'100%', padding:'9px', borderRadius:'var(--radius-md)',
          border:'1.5px solid var(--green)', background:'var(--green-light)',
          color:'var(--green-dark)', fontWeight:700, fontSize:13, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:6,
        }}>
          <i className="ti ti-star" style={{ fontSize:15 }} /> Calificar esta impresión
        </button>
      )}
    </div>
  )
}

// Modal de calificación
function RatingModal({ order, onClose, onDone }) {
  const [stars, setStars]     = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)

  const EMOJIS = ['', '😞', '😐', '🙂', '😊', '🤩']
  const LABELS = ['', 'Muy malo', 'Regular', 'Bueno', 'Muy bueno', '¡Excelente!']

  const submit = async () => {
    if (stars === 0) return
    setSaving(true)
    await supabase.from('ratings').insert({
      order_id:     order.id,
      printshop_id: order.printshop_id,
      user_id:      order.user_id,
      stars,                              // fix: era 'rating' antes, debe ser 'stars'
      comment:      comment.trim() || null,
    })
    await supabase.from('orders').update({ rated: true }).eq('id', order.id)
    setSaving(false)
    setDone(true)
    setTimeout(() => onDone(), 1800)
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:24,
    }}>
      <div style={{ background:'#fff', borderRadius:24, padding:28, width:'100%', maxWidth:340 }}>

        {done ? (
          /* Pantalla de gracias */
          <div style={{ textAlign:'center', padding:'12px 0' }}>
            <p style={{ fontSize:52, marginBottom:12 }}>🎉</p>
            <p style={{ fontSize:18, fontWeight:900, marginBottom:6 }}>¡Gracias por tu reseña!</p>
            <p style={{ fontSize:13, color:'var(--text-secondary)' }}>
              Tu opinión ayuda a mejorar el servicio de {order.printshops?.name}
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize:18, fontWeight:900, textAlign:'center', marginBottom:4 }}>
              ¿Cómo estuvo tu impresión?
            </p>
            <p style={{ fontSize:13, color:'var(--text-secondary)', textAlign:'center', marginBottom:20 }}>
              {order.printshops?.name}
            </p>

            {/* Emoji según estrellas */}
            <div style={{ textAlign:'center', marginBottom:12, minHeight:52 }}>
              {stars > 0 && (
                <>
                  <p style={{ fontSize:40 }}>{EMOJIS[stars]}</p>
                  <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>{LABELS[stars]}</p>
                </>
              )}
            </div>

            {/* Estrellas */}
            <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:20 }}>
              {[1,2,3,4,5].map(s => (
                <button key={s} onClick={() => setStars(s)} style={{
                  background:'none', border:'none', cursor:'pointer', padding:4,
                  fontSize:40, lineHeight:1,
                  color: s <= stars ? '#F59E0B' : '#E5E7EB',
                  transform: s === stars ? 'scale(1.2)' : 'scale(1)',
                  transition:'all 0.1s',
                }}>★</button>
              ))}
            </div>

            {/* Comentario */}
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Cuéntanos tu experiencia (opcional)"
              style={{
                width:'100%', minHeight:72, resize:'none', fontSize:14,
                padding:'10px 12px', border:'1.5px solid var(--border)',
                borderRadius:'var(--radius-md)', fontFamily:'inherit', marginBottom:14,
                boxSizing:'border-box',
              }}
            />

            <button
              onClick={submit}
              disabled={stars === 0 || saving}
              className="btn-primary"
              style={{ marginBottom:10, opacity: stars === 0 ? 0.4 : 1 }}
            >
              {saving ? 'Enviando...' : 'Enviar reseña'}
            </button>

            <button onClick={onClose} style={{
              width:'100%', background:'none', border:'none',
              color:'var(--text-muted)', fontSize:13, cursor:'pointer', padding:6,
            }}>
              Ahora no
            </button>
          </>
        )}
      </div>
    </div>
  )
}
