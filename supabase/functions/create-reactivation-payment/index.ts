// Pliego · Edge Function: create-reactivation-payment
// Crea un PaymentIntent de $50 MXN para que un suscriptor con la cuenta
// suspendida (no recogió su documento a tiempo — ver
// supabase_migration_suspension.sql) pague manualmente para reactivarla.
// El frontend confirma el pago con Stripe.js (mismo patrón que
// create-stripe-payment / create-subscription). La reactivación real
// (account_suspended=false + reanudar cobro de Stripe) ocurre en
// stripe-webhook cuando llega payment_intent.succeeded con
// metadata.purpose = 'reactivacion_suspension'.
// Secrets: STRIPE_SECRET_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const REACTIVATION_FEE_MXN = 50

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const { data: userRow } = await supabase
      .from('users').select('name, account_suspended').eq('id', user.id).maybeSingle()

    if (!userRow?.account_suspended) {
      return json({ error: 'Tu cuenta no está suspendida' }, 400)
    }

    const STRIPE_SK = Deno.env.get('STRIPE_SECRET_KEY')!

    const params = new URLSearchParams({
      'amount':                 String(REACTIVATION_FEE_MXN * 100),
      'currency':               'mxn',
      'payment_method_types[]': 'card',
      'metadata[user_id]':      user.id,
      'metadata[purpose]':      'reactivacion_suspension',
      'description':            'Pliego · Reactivación de cuenta',
    })

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SK}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    const intent = await stripeRes.json()

    if (!stripeRes.ok) {
      console.error('Stripe error:', intent)
      return json({ error: intent.error?.message ?? 'Error al crear el pago' }, 500)
    }

    return json({
      client_secret: intent.client_secret,
      amount: REACTIVATION_FEE_MXN,
    })

  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
