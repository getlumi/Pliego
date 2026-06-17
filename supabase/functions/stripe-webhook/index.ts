// Pliego · Edge Function: stripe-webhook
// Recibe eventos de Stripe y acredita el saldo cuando un pago se confirma.
// Secrets requeridos: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

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

    const body = await req.text()

    // Parsear el evento de Stripe
    let event: { type: string; data: { object: Record<string, unknown> } }
    try {
      event = JSON.parse(body)
    } catch {
      return json({ error: 'Body inválido' }, 400)
    }

    // Solo procesamos pagos confirmados
    if (event.type !== 'payment_intent.succeeded') {
      return json({ ok: true, ignored: event.type })
    }

    const intent = event.data.object as {
      id: string
      metadata: { user_id: string; amount: string; prints: string; package_id: string; user_email: string }
      payment_method_types: string[]
      amount: number
    }

    const { user_id, amount, prints, package_id } = intent.metadata
    if (!user_id || !amount) {
      console.error('Metadata incompleta:', intent.metadata)
      return json({ error: 'Metadata incompleta' }, 400)
    }

    const amountMXN = Number(amount)
    const method = intent.payment_method_types?.includes('oxxo') ? 'oxxo' : 'tarjeta'

    // Acreditar saldo de forma atómica (evita duplicados)
    const { data: credited, error: creditError } = await supabase.rpc('credit_wallet', {
      p_user_id:     user_id,
      p_amount:      amountMXN,
      p_payment_id:  intent.id,
      p_description: `Recarga ${prints} impresiones · Stripe #${intent.id.slice(-6)}`,
      p_method:      method,
    })

    if (creditError) {
      console.error('Error acreditando saldo:', creditError)
      return json({ error: 'Error al acreditar saldo' }, 500)
    }

    if (!credited) {
      console.log(`⚠️ Pago ${intent.id} ya procesado`)
      return json({ ok: true, already_processed: true })
    }

    console.log(`✅ Saldo acreditado: $${amountMXN} MXN a usuario ${user_id}`)
    return json({ ok: true, credited: amountMXN })

  } catch (e) {
    console.error('Webhook error:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
