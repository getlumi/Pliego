// Pliego · Edge Function: stripe-webhook v5
// Verifica la firma de Stripe antes de procesar el evento.
// Maneja tres familias de eventos:
// 1) payment_intent.succeeded — puede ser: (a) pago de reactivación de
//    cuenta suspendida ($50, metadata.purpose='reactivacion_suspension'),
//    (b) compra de paquete de créditos (metadata.package_id), o (c) el
//    payment_intent interno de una suscripción — se ignora aquí, se
//    procesa en el bloque 2 vía invoice.paid.
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

      // ── 1a) Pago de reactivación de cuenta suspendida ($50) ──────────────
      if (intent.metadata?.purpose === 'reactivacion_suspension') {
        const targetUserId = intent.metadata.user_id
        if (!targetUserId) {
          console.error('reactivacion_suspension sin user_id en metadata')
          return json({ error: 'Falta user_id en metadata' }, 400)
        }

        const { error: reactivateError } = await supabase.rpc('resolve_suspension_payment', {
          p_user_id: targetUserId,
        })
        if (reactivateError) {
          console.error('Error al reactivar cuenta:', JSON.stringify(reactivateError))
          return json({ error: 'No se pudo reactivar la cuenta' }, 500)
        }

        // Reanudar el cobro normal de la suscripción en Stripe (se había
        // pausado con pause_collection al suspender — ver guarantee-cron)
        const { data: userRow } = await supabase
          .from('users').select('subscription_id').eq('id', targetUserId).maybeSingle()
        if (userRow?.subscription_id) {
          const resumeRes = await fetch(`https://api.stripe.com/v1/subscriptions/${userRow.subscription_id}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${STRIPE_SK}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ 'pause_collection': '' }).toString(),
          })
          if (!resumeRes.ok) console.error('No se pudo reanudar el cobro de Stripe:', await resumeRes.text())
        }

        console.log(`✅ Cuenta reactivada para ${targetUserId}`)
        return json({ ok: true, reactivated: true })
      }

      // ── 1b) Compra de paquete de créditos ─────────────────────────────────
      // Antes filtrábamos por `intent.invoice`, pero Stripe eliminó ese campo
      // del objeto PaymentIntent (API 2025-03-31.basil en adelante). Ahora
      // identificamos los pagos de paquete por su metadata — solo
      // create-stripe-payment le pone `package_id`; los payment_intent que
      // vienen de una suscripción no lo tienen y se procesan más abajo con
      // invoice.paid (evita cobrar doble).
      if (!intent.metadata?.package_id) {
        return json({ ok: true, ignored: 'no_package_metadata' })
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
    // Puede ser de un CLIENTE (users.stripe_customer_id) o de una
    // PAPELERÍA (printshops.stripe_customer_id) — mismo Price ID de
    // Stripe para ambos, se distinguen por en cuál tabla aparece el
    // customer_id.
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object
      const subscriptionId = invoice.subscription
      const customerId     = invoice.customer
      if (!subscriptionId || !customerId) return json({ ok: true, ignored: 'no_subscription' })

      const amountMXN = (invoice.amount_paid ?? 0) / 100
      const periodEnd = invoice.lines?.data?.[0]?.period?.end
        ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
        : null

      const { data: userRow } = await supabase
        .from('users').select('id, subscription_started_at').eq('stripe_customer_id', customerId).maybeSingle()

      if (userRow) {
        await supabase.from('users').update({
          subscription_status: 'active',
          subscription_id: subscriptionId,
          subscription_period_end: periodEnd,
          // Solo se pone la primera vez — una renovación no debe
          // "resetear" cuándo empezó realmente la suscripción.
          ...(userRow.subscription_started_at ? {} : { subscription_started_at: new Date().toISOString() }),
        }).eq('id', userRow.id)

        await supabase.rpc('credit_wallet', {
          p_user_id:     userRow.id,
          p_amount:      amountMXN,
          p_payment_id:  invoice.id,
          p_description: 'Mensualidad ilimitada · Stripe',
          p_method:      'tarjeta',
          p_credits:     0,
        })

        console.log(`✅ Suscripción activa (cliente) para ${userRow.id}, hasta ${periodEnd}`)
        return json({ ok: true, subscription: 'active', kind: 'cliente' })
      }

      const { data: shopRow } = await supabase
        .from('printshops').select('id').eq('stripe_customer_id', customerId).maybeSingle()

      if (shopRow) {
        await supabase.from('printshops').update({ subscription_id: subscriptionId }).eq('id', shopRow.id)
        await supabase.rpc('record_printshop_subscription_payment', {
          p_printshop_id: shopRow.id,
          p_amount:       amountMXN,
          p_payment_id:   invoice.id,
          p_period_end:   periodEnd,
        })
        console.log(`✅ Suscripción activa (papelería) para ${shopRow.id}, hasta ${periodEnd}`)
        return json({ ok: true, subscription: 'active', kind: 'papeleria' })
      }

      console.error('No se encontró usuario ni papelería para customer', customerId)
      return json({ ok: true, ignored: 'not_found' })
    }

    // ── 3) SUSCRIPCIÓN — pago de renovación falló ──────────────────────────
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object
      const customerId = invoice.customer

      const { data: userRow } = await supabase
        .from('users').select('id').eq('stripe_customer_id', customerId).maybeSingle()
      if (userRow) {
        await supabase.from('users').update({ subscription_status: 'past_due' }).eq('id', userRow.id)
        console.log(`⚠️ Pago de suscripción falló (cliente) para ${userRow.id}`)
        return json({ ok: true, subscription: 'past_due', kind: 'cliente' })
      }

      const { data: shopRow } = await supabase
        .from('printshops').select('id').eq('stripe_customer_id', customerId).maybeSingle()
      if (shopRow) {
        await supabase.from('printshops').update({ subscription_status: 'past_due' }).eq('id', shopRow.id)
        console.log(`⚠️ Pago de suscripción falló (papelería) para ${shopRow.id}`)
        return json({ ok: true, subscription: 'past_due', kind: 'papeleria' })
      }

      return json({ ok: true, ignored: 'not_found' })
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
          subscription_canceled_at: new Date().toISOString(),
        }).eq('id', userRow.id)
        console.log(`Suscripción cancelada (cliente) para ${userRow.id}`)
        return json({ ok: true, subscription: 'canceled', kind: 'cliente' })
      }

      const { data: shopRow } = await supabase
        .from('printshops').select('id').eq('stripe_customer_id', customerId).maybeSingle()
      if (shopRow) {
        await supabase.from('printshops').update({
          subscription_status: 'canceled',
          subscription_id: null,
          subscription_canceled_at: new Date().toISOString(),
        }).eq('id', shopRow.id)
        console.log(`Suscripción cancelada (papelería) para ${shopRow.id}`)
        return json({ ok: true, subscription: 'canceled', kind: 'papeleria' })
      }

      return json({ ok: true, ignored: 'not_found' })
    }

    return json({ ok: true, ignored: event.type })

  } catch (e) {
    console.error('Error:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
