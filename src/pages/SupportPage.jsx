import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Temas predefinidos para categorizar el ticket
const SUBJECTS = [
  'Problema con un pedido',
  'Mi saldo no se acreditó',
  'Problema con el pago',
  'Una papelería no entregó',
  'Problema con mi cuenta',
  'Sugerencia o mejora',
  'Otro',
]

export default function SupportPage({ session, fromType = 'user', printshopId = null, onBack }) {
  const [tickets, setTickets]   = useState([])
  const [view, setView]         = useState('list') // 'list' | 'new' | 'chat'
  const [activeTicket, setActiveTicket] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    loadTickets()
  }, [session])

  const loadTickets = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('support_tickets')
      .select('*, support_messages(id)')
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false })
    setTickets(data ?? [])
    setLoading(false)
  }

  const STATUS_LABEL = { open: 'Abierto', in_review: 'En revisión', resolved: 'Resuelto' }
  const STATUS_COLOR = {
    open:      { bg:'var(--amber-light)', color:'#92530a' },
    in_review: { bg:'#dbeafe', color:'#1d4ed8' },
    resolved:  { bg:'var(--green-light)', color:'var(--green-dark)' },
  }

  if (view === 'new') return (
    <NewTicket
      session={session}
      fromType={fromType}
      printshopId={printshopId}
      onCreated={(ticket) => { setActiveTicket(ticket); setView('chat'); loadTickets() }}
      onBack={() => setView('list')}
    />
  )

  if (view === 'chat' && activeTicket) return (
    <TicketChat
      session={session}
      ticket={activeTicket}
      onBack={() => { setView('list'); loadTickets() }}
    />
  )

  return (
    <div className="page">
      <div style={{ background:'var(--gradient-dark)', padding:'48px 20px 24px' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:13, marginBottom:8, padding:0 }}>
          ← Volver
        </button>
        <p style={{ fontSize:22, fontWeight:900, color:'#fff' }}>Soporte</p>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>Estamos aquí para ayudarte</p>
      </div>

      <div className="scroll-content">
        <button onClick={() => setView('new')} className="btn-primary">
          <i className="ti ti-message-plus" style={{ fontSize:16 }} />
          Enviar nuevo mensaje
        </button>

        {loading ? (
          <p style={{ textAlign:'center', color:'var(--text-muted)', padding:24 }}>Cargando...</p>
        ) : tickets.length === 0 ? (
          <div className="card" style={{ textAlign:'center', padding:32 }}>
            <i className="ti ti-message-circle" style={{ fontSize:40, color:'var(--text-muted)', display:'block', marginBottom:12 }} />
            <p style={{ color:'var(--text-muted)', fontSize:14 }}>No tienes mensajes de soporte aún</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>Tus mensajes</p>
            {tickets.map(t => {
              const sc = STATUS_COLOR[t.status] ?? STATUS_COLOR.open
              return (
                <div key={t.id} className="card" style={{ cursor:'pointer' }}
                  onClick={() => { setActiveTicket(t); setView('chat') }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <p style={{ fontSize:14, fontWeight:700 }}>{t.subject}</p>
                      <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                        {new Date(t.updated_at).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                        {' · '}{t.support_messages?.length ?? 0} mensaje{t.support_messages?.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span style={{ fontSize:11, padding:'3px 8px', borderRadius:'var(--radius-full)', fontWeight:700, background:sc.bg, color:sc.color, whiteSpace:'nowrap' }}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

function NewTicket({ session, fromType, printshopId, onCreated, onBack }) {
  const [subject, setSubject] = useState('')
  const [body, setBody]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const submit = async () => {
    setError('')
    if (!subject) return setError('Elige un tema')
    if (!body.trim()) return setError('Escribe tu mensaje')
    setSaving(true)

    const { data: ticket, error: tErr } = await supabase
      .from('support_tickets')
      .insert({
        user_id:      session.user.id,
        from_type:    fromType,
        printshop_id: printshopId,
        subject,
        status:       'open',
      })
      .select()
      .single()

    if (tErr) { setError('Error al crear el ticket'); setSaving(false); return }

    await supabase.from('support_messages').insert({
      ticket_id: ticket.id,
      sender:    'user',
      body:      body.trim(),
    })

    setSaving(false)
    onCreated(ticket)
  }

  return (
    <div className="page">
      <div style={{ background:'var(--gradient-dark)', padding:'48px 20px 24px' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:13, marginBottom:8, padding:0 }}>
          ← Volver
        </button>
        <p style={{ fontSize:20, fontWeight:900, color:'#fff' }}>Nuevo mensaje</p>
      </div>

      <div className="scroll-content">
        <div className="card">
          <p style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>¿Sobre qué necesitas ayuda?</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
            {SUBJECTS.map(s => (
              <button key={s} onClick={() => setSubject(s)} style={{
                padding:'10px 14px', textAlign:'left', fontSize:13, fontWeight:600,
                borderRadius:'var(--radius-md)', cursor:'pointer',
                border: subject === s ? '2px solid var(--green)' : '1px solid var(--border)',
                background: subject === s ? 'var(--green-light)' : '#fff',
                color: subject === s ? 'var(--green-dark)' : 'var(--text-primary)',
              }}>
                {subject === s && <i className="ti ti-check" style={{ fontSize:13, marginRight:6 }} />}
                {s}
              </button>
            ))}
          </div>

          <p style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>Cuéntanos más</p>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Describe tu situación con el mayor detalle posible..."
            style={{
              width:'100%', minHeight:100, resize:'none', fontSize:14,
              padding:'10px 12px', border:'1.5px solid var(--border)',
              borderRadius:'var(--radius-md)', fontFamily:'inherit',
              marginBottom:14, boxSizing:'border-box',
            }}
          />

          {error && (
            <p style={{ fontSize:13, color:'var(--red)', marginBottom:10 }}>
              <i className="ti ti-alert-circle" style={{ fontSize:13, marginRight:4 }} />{error}
            </p>
          )}

          <button onClick={submit} disabled={saving} className="btn-primary">
            {saving ? 'Enviando...' : 'Enviar mensaje'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TicketChat({ session, ticket, onBack }) {
  const [messages, setMessages] = useState([])
  const [reply, setReply]       = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef               = useRef(null)

  const STATUS_LABEL = { open: 'Abierto', in_review: 'En revisión', resolved: 'Resuelto' }

  useEffect(() => {
    loadMessages()
    // Realtime: mensajes nuevos
    const channel = supabase
      .channel(`support:${ticket.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `ticket_id=eq.${ticket.id}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 100)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [ticket.id])

  const loadMessages = async () => {
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 100)
  }

  const send = async () => {
    if (!reply.trim() || sending) return
    setSending(true)
    await supabase.from('support_messages').insert({
      ticket_id: ticket.id,
      sender:    'user',
      body:      reply.trim(),
    })
    // Reabrir ticket si estaba resuelto
    if (ticket.status === 'resolved') {
      await supabase.from('support_tickets').update({ status: 'open', updated_at: new Date().toISOString() }).eq('id', ticket.id)
    }
    setReply('')
    setSending(false)
  }

  return (
    <div className="page" style={{ paddingBottom:0 }}>
      <div style={{ background:'var(--gradient-dark)', padding:'48px 20px 16px' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:13, marginBottom:8, padding:0 }}>
          ← Mis mensajes
        </button>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <p style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{ticket.subject}</p>
          <span style={{ fontSize:11, padding:'3px 8px', borderRadius:'var(--radius-full)', fontWeight:700, background:'rgba(255,255,255,0.15)', color:'#fff' }}>
            {STATUS_LABEL[ticket.status]}
          </span>
        </div>
      </div>

      {/* Mensajes */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:10, paddingBottom:80 }}>
        {messages.map(m => {
          const isUser = m.sender === 'user'
          return (
            <div key={m.id} style={{ display:'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth:'80%', padding:'10px 14px', borderRadius:16,
                borderBottomRightRadius: isUser ? 4 : 16,
                borderBottomLeftRadius: isUser ? 16 : 4,
                background: isUser ? 'var(--green)' : '#F3F4F6',
                color: isUser ? '#fff' : 'var(--text-primary)',
              }}>
                {!isUser && (
                  <p style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', marginBottom:4 }}>Soporte Pliego</p>
                )}
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

      {/* Input de respuesta */}
      {ticket.status !== 'resolved' ? (
        <div style={{
          position:'sticky', bottom:0, background:'#fff',
          borderTop:'1px solid var(--border)', padding:'12px 16px',
          display:'flex', gap:8, alignItems:'flex-end',
        }}>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="Escribe tu mensaje..."
            rows={1}
            style={{
              flex:1, resize:'none', fontSize:14, padding:'10px 12px',
              border:'1.5px solid var(--border)', borderRadius:20,
              fontFamily:'inherit', maxHeight:100, overflow:'auto',
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button onClick={send} disabled={!reply.trim() || sending} style={{
            width:40, height:40, borderRadius:'50%', border:'none', flexShrink:0,
            background: reply.trim() ? 'var(--green)' : 'var(--border)',
            cursor: reply.trim() ? 'pointer' : 'default',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <i className="ti ti-send" style={{ fontSize:18, color:'#fff' }} />
          </button>
        </div>
      ) : (
        <div style={{ padding:'12px 16px', background:'var(--green-light)', textAlign:'center' }}>
          <p style={{ fontSize:13, color:'var(--green-dark)', fontWeight:600 }}>
            <i className="ti ti-circle-check" style={{ fontSize:14, marginRight:6 }} />
            Ticket resuelto — si necesitas más ayuda envía un nuevo mensaje
          </p>
        </div>
      )}
    </div>
  )
}
