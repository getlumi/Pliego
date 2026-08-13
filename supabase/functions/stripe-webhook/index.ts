// Pliego · Edge Function: stripe-webhook v4
// Verifica la firma de Stripe antes de procesar el evento.
// Maneja dos familias de eventos:
// 1) payment_intent.succeeded — compras de paquetes de créditos (una sola
//    vez). Se ignoran los payment_intent que vienen de una suscripción
//    (traen campo `invoice`) — esos se procesan en el bloque 2.
// 2) invoice.paid / customer.subscription.deleted / invoice.payment_failed
//    — ciclo de vida de la suscripción mensual de $75.
// Secrets requeridos: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

async function verifyStripeSignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(',').reduce((acc, part) => {
      const [key, val] = part.split('=')
      acc[key] = val
      return acc
    }, {} as Record<string, string>)

    const timestamp = parts['t']
    const sig       = parts['v1']
    if (!timestamp || !sig) return false

    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - Number(timestamp)) > 300) return false

    const signedPayload = `${timestamp}.${body}`
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
    const expectedSig = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    return expectedSig === sig
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const STRIPE_SK      = Deno.env.get('STRIPE_SECRET_KEY')!
    const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

    const body      = await req.text()
    const signature = req.headers.get('stripe-signature') ?? ''

    if (WEBHOOK_SECRET) {
      const valid = await verifyStripeSignature(body, signature, WEBHOOK_SECRET)
      if (!valid) {
        console.error('Firma inválida — posible solicitud fraudulenta')
        return json({ error: 'Firma inválida' }, 400)
      }
    }

    let event: any
    try {
      event = JSON.parse(body)
    } catch {
      return json({ error: 'Body inválido' }, 400)
    }

    console.log('Stripe event verificado:', event.type)

    // ── 1) COMPRA DE PAQUETE (una sola vez) ────────────────────────────────
    if (event.type === 'payment_intent.succeeded') {
      const intentId = event.data.object.id

      const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${intentId}`, {
        headers: { 'Authorization': `Bearer ${STRIPE_SK}` },
      })
      const intent = await piRes.json()

      if (intent.status !== 'succeeded') return json({ ok: true, status: intent.status })

      // Los payment_intent de una suscripción traen `invoice` — esos se
      // procesan más abajo con invoice.paid, no aquí (evita cobrar doble).
      if (intent.invoice) {
        return json({ ok: true, ignored: 'subscription_payment_intent' })
      }

      const { user_id, amount, prints } = intent.metadata ?? {}
      if (!user_id || !amount) {
        console.error('Metadata incompleta:', JSON.stringify(intent.metadata))
        return json({ error: 'Metadata incompleta' }, 400)
      }

      const amountMXN = Number(amount)
      const method    = (intent.payment_method_types ?? []).includes('oxxo') ? 'oxxo' : 'tarjeta'

      const { data: credited, error: creditError } = await supabase.rpc('credit_wallet', {
        p_user_id:     user_id,
        p_amount:      amountMXN,
        p_payment_id:  intentId,
        p_description: `Recarga ${prints} créditos · Stripe`,
        p_method:      method,
        p_credits:     Number(prints),
      })

      if (creditError) {
        console.error('Error:', JSON.stringify(creditError))
        return json({ error: 'Error al acreditar saldo' }, 500)
      }
      if (!credited) return json({ ok: true, already_processed: true })

      console.log(`✅ Acreditado $${amountMXN} MXN (${prints} créditos) a usuario ${user_id}`)
      return json({ ok: true, credited: amountMXN, credits: Number(prints) })
    }

    // ── 2) SUSCRIPCIÓN — cobro inicial o renovación exitosa ────────────────
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object
      const subscriptionId = invoice.subscription
      const customerId     = invoice.customer
      if (!subscriptionId || !customerId) return json({ ok: true, ignored: 'no_subscription' })

      const { data: userRow } = await supabase
        .from('users').select('id').eq('stripe_customer_id', customerId).maybeSingle()
      if (!userRow) {
        console.error('No se encontró usuario para customer', customerId)
        return json({ ok: true, ignored: 'user_not_found' })
      }

      const amountMXN = (invoice.amount_paid ?? 0) / 100
      const periodEnd = invoice.lines?.data?.[0]?.period?.end
        ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
        : null

      await supabase.from('users').update({
        subscription_status: 'active',
        subscription_id: subscriptionId,
        subscription_period_end: periodEnd,
      }).eq('id', userRow.id)

      // Registrar el ingreso en el historial (idempotente por payment_id único)
      await supabase.rpc('credit_wallet', {
        p_user_id:     userRow.id,
        p_amount:      amountMXN,
        p_payment_id:  invoice.id,
        p_description: 'Mensualidad ilimitada · Stripe',
        p_method:      'tarjeta',
        p_credits:     0,
      })

      console.log(`✅ Suscripción activa para ${userRow.id}, hasta ${periodEnd}`)
      return json({ ok: true, subscription: 'active' })
    }

    // ── 3) SUSCRIPCIÓN — pago de renovación falló ──────────────────────────
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object
      const customerId = invoice.customer
      const { data: userRow } = await supabase
        .from('users').select('id').eq('stripe_customer_id', customerId).maybeSingle()
      if (userRow) {
        await supabase.from('users').update({ subscription_status: 'past_due' }).eq('id', userRow.id)
        console.log(`⚠️ Pago de suscripción falló para ${userRow.id}`)
      }
      return json({ ok: true, subscription: 'past_due' })
    }

    // ── 4) SUSCRIPCIÓN — cancelada (al terminar el periodo pagado) ─────────
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      const customerId = sub.customer
      const { data: userRow } = await supabase
        .from('users').select('id').eq('stripe_customer_id', customerId).maybeSingle()
      if (userRow) {
        await supabase.from('users').update({
          subscription_status: 'canceled',
          subscription_id: null,
        }).eq('id', userRow.id)
        console.log(`Suscripción cancelada para ${userRow.id}`)
      }
      return json({ ok: true, subscription: 'canceled' })
    }

    return json({ ok: true, ignored: event.type })

  } catch (e) {
    console.error('Error:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
