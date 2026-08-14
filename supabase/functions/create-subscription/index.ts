// Pliego · Edge Function: create-subscription
// Crea (o reutiliza) el Customer de Stripe del usuario y arranca una
// suscripción mensual de $75 MXN (plan ilimitado). Devuelve el
// client_secret del primer cobro para que el frontend lo confirme con
// Stripe.js — mismo patrón que ya usa create-stripe-payment para tarjeta.
// Requiere que exista un Price recurrente en Stripe (Dashboard → Products
// → crear producto 'Pliego Mensualidad' con precio recurrente $75 MXN al
// mes), y que su ID (empieza con "price_") esté guardado en el secret
// STRIPE_MENSUALIDAD_PRICE_ID.
// Secrets: STRIPE_SECRET_KEY, STRIPE_MENSUALIDAD_PRICE_ID

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

async function stripeFetch(path: string, secretKey: string, params: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  return { ok: res.ok, data: await res.json() }
}

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

    const STRIPE_SK   = Deno.env.get('STRIPE_SECRET_KEY')!
    const PRICE_ID    = Deno.env.get('STRIPE_MENSUALIDAD_PRICE_ID')!
    if (!PRICE_ID) return json({ error: 'Falta configurar STRIPE_MENSUALIDAD_PRICE_ID' }, 500)

    const { data: userRow } = await supabase
      .from('users').select('name, stripe_customer_id, subscription_status')
      .eq('id', user.id).maybeSingle()

    if (userRow?.subscription_status === 'active') {
      return json({ error: 'Ya tienes una suscripción activa' }, 400)
    }

    // 1) Reutilizar o crear el Customer de Stripe
    let customerId = userRow?.stripe_customer_id
    if (!customerId) {
      const rawName = userRow?.name ?? ''
      const nameParts = rawName.trim().split(' ').filter(p => p.length >= 2)
      const userName = nameParts.length >= 2 ? rawName.trim()
        : nameParts.length === 1 ? `${nameParts[0]} Cliente` : 'Cliente Pliego'

      const { ok, data: customer } = await stripeFetch('customers', STRIPE_SK, new URLSearchParams({
        'email': user.email ?? `${user.id}@pliego.com`,
        'name': userName,
        'metadata[user_id]': user.id,
      }))
      if (!ok) return json({ error: customer.error?.message ?? 'No se pudo crear el cliente' }, 500)
      customerId = customer.id
      await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    // 2) Crear la suscripción, con el primer cobro pendiente de confirmar
    // NOTA: desde la API de Stripe 2025-03-31.basil, el campo `payment_intent`
    // del Invoice fue eliminado — ahora se usa `confirmation_secret`, que
    // contiene el mismo client_secret de PaymentIntent que antes.
    const { ok, data: subscription } = await stripeFetch('subscriptions', STRIPE_SK, new URLSearchParams({
      'customer': customerId,
      'items[0][price]': PRICE_ID,
      'payment_behavior': 'default_incomplete',
      'payment_settings[save_default_payment_method]': 'on_subscription',
      'expand[0]': 'latest_invoice.confirmation_secret',
      'metadata[user_id]': user.id,
    }))

    if (!ok) return json({ error: subscription.error?.message ?? 'No se pudo crear la suscripción' }, 500)

    const confirmationSecret = subscription.latest_invoice?.confirmation_secret
    if (!confirmationSecret?.client_secret) {
      return json({ error: 'No se pudo iniciar el cobro de la suscripción' }, 500)
    }

    await supabase.from('users').update({
      subscription_id: subscription.id,
    }).eq('id', user.id)

    return json({
      client_secret: confirmationSecret.client_secret,
      subscription_id: subscription.id,
    })

  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
