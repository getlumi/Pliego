import React, { useEffect, useState } from 'react'
import { confirmSubscriptionWithRetry, setPendingCheckout, clearPendingCheckout } from '../lib/confirmSubscription'

// Aviso al volver de la página de pago de Stripe (Checkout).
// La URL trae ?pago=ok&k=subscription|credits&cs=<sesión> o ?pago=cancelado.
//  - mensualidad: se confirma directo con Stripe y la app se refresca sola
//  - créditos: los acredita el webhook; solo se avisa y se refresca el saldo
export default function CheckoutReturnToast() {
  const [msg, setMsg] = useState(null) // { text, tone: 'info' | 'ok' | 'warn' }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const pago = q.get('pago')
    if (!pago) return
    const kind = q.get('k')
    const cs = q.get('cs')
    // Limpia la URL para que un refresco no repita el aviso
    window.history.replaceState({}, '', window.location.pathname)

    if (pago === 'cancelado') {
      if (kind === 'subscription') clearPendingCheckout()
      setMsg({ text: 'Pago cancelado. No se te cobró nada; puedes intentarlo cuando quieras.', tone: 'warn' })
      setTimeout(() => setMsg(null), 6000)
      return
    }

    let alive = true
    const finish = (text, tone, reload) => {
      if (!alive) return
      setMsg({ text, tone })
      if (reload) setTimeout(() => window.location.reload(), 1600)
      else setTimeout(() => alive && setMsg(null), 7000)
    }

    if (kind === 'credits') {
      setMsg({ text: 'Pago recibido. Acreditando tus créditos...', tone: 'info' })
      setTimeout(() => finish('¡Listo! Tus créditos ya están en tu saldo.', 'ok', true), 3500)
    } else {
      if (cs) setPendingCheckout(cs)
      setMsg({ text: 'Confirmando tu pago...', tone: 'info' })
      confirmSubscriptionWithRetry(8, 1500).then(ok => {
        if (ok) finish('¡Pago confirmado! Tu cuenta ya está activa.', 'ok', true)
        else finish('Recibimos tu pago y lo estamos confirmando. Se actualizará solo; no necesitas pagar de nuevo.', 'info', false)
      })
    }
    return () => { alive = false }
  }, [])

  if (!msg) return null
  const bg = msg.tone === 'ok' ? '#16803C' : msg.tone === 'warn' ? '#B45309' : '#1A1A1A'
  return (
    <div role="status" style={{
      position:'fixed', top:'max(12px, env(safe-area-inset-top))', left:12, right:12, zIndex:9999,
      maxWidth:420, margin:'0 auto', background:bg, color:'#fff', borderRadius:14,
      padding:'12px 16px', fontSize:14, fontWeight:700, boxShadow:'0 6px 24px rgba(0,0,0,.25)', textAlign:'center',
    }}>
      {msg.text}
    </div>
  )
}
