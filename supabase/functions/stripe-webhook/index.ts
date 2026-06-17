// Pliego · Edge Function: stripe-webhook v2
// Compatible con formato "Resumen" de Stripe Workbench.
// Recibe el evento, consulta el PaymentIntent completo a Stripe,
// y acredita el saldo con la metadata del usuario.

import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const STRIPE_SK = Deno.env.get('STRIPE_SECRET_KEY')!

    const body = await req.text()
    let event: { type: string; data: { object: { id: string; metadata?: Record<string,string> } } }

    try {
      event = JSON.parse(body)
    } catch {
      return json({ error: 'Body inválido' }, 400)
    }

    console.log('Stripe event:', event.type)

    if (event.type !== 'payment_intent.succeeded') {
      return json({ ok: true, ignored: event.type })
    }

    const intentId = event.data.object.id
    console.log('PaymentIntent ID:', intentId)

    // Consultar el PaymentIntent completo a Stripe para obtener la metadata
    const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${intentId}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SK}` },
    })
    const intent = await piRes.json()

    console.log('Metadata:', JSON.stringify(intent.metadata))
    console.log('Status:', intent.status)

    if (intent.status !== 'succeeded') {
      return json({ ok: true, status: intent.status })
    }

    const { user_id, amount, prints } = intent.metadata ?? {}

    if (!user_id || !amount) {
      console.error('Metadata incompleta:', JSON.stringify(intent.metadata))
      return json({ error: 'Metadata incompleta' }, 400)
    }

    const amountMXN = Number(amount)
    const method = (intent.payment_method_types ?? []).includes('oxxo') ? 'oxxo' : 'tarjeta'

    const { data: credited, error: creditError } = await supabase.rpc('credit_wallet', {
      p_user_id:     user_id,
      p_amount:      amountMXN,
      p_payment_id:  intentId,
      p_description: `Recarga ${prints} impresiones · Stripe`,
      p_method:      method,
    })

    if (creditError) {
      console.error('Error:', JSON.stringify(creditError))
      return json({ error: 'Error al acreditar saldo' }, 500)
    }

    if (!credited) {
      console.log('Ya procesado:', intentId)
      return json({ ok: true, already_processed: true })
    }

    console.log(`✅ Acreditado $${amountMXN} a usuario ${user_id}`)
    return json({ ok: true, credited: amountMXN })

  } catch (e) {
    console.error('Error:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
