// Pliego · Edge Function: stripe-webhook v3
// Verifica la firma de Stripe antes de procesar el evento.
// Secrets requeridos: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// Verificar firma HMAC-SHA256 de Stripe
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

    // Verificar que el timestamp no sea muy antiguo (5 minutos)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - Number(timestamp)) > 300) return false

    // Calcular firma esperada
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

    // Verificar firma — rechazar si no es de Stripe
    if (WEBHOOK_SECRET) {
      const valid = await verifyStripeSignature(body, signature, WEBHOOK_SECRET)
      if (!valid) {
        console.error('Firma inválida — posible solicitud fraudulenta')
        return json({ error: 'Firma inválida' }, 400)
      }
    }

    let event: { type: string; data: { object: { id: string; metadata?: Record<string,string> } } }
    try {
      event = JSON.parse(body)
    } catch {
      return json({ error: 'Body inválido' }, 400)
    }

    console.log('Stripe event verificado:', event.type)

    if (event.type !== 'payment_intent.succeeded') {
      return json({ ok: true, ignored: event.type })
    }

    const intentId = event.data.object.id
    console.log('PaymentIntent ID:', intentId)

    // Consultar el PaymentIntent a Stripe para verificar status real
    const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${intentId}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SK}` },
    })
    const intent = await piRes.json()

    console.log('Status verificado:', intent.status)

    if (intent.status !== 'succeeded') {
      return json({ ok: true, status: intent.status })
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
