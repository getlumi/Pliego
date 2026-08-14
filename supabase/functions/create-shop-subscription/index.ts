// Pliego · Edge Function: create-shop-subscription
// Arranca la suscripción de $75 MXN/mes para una PAPELERÍA (mismo precio
// y mismo Price ID que ya usan los clientes — STRIPE_MENSUALIDAD_PRICE_ID,
// no hace falta un producto de Stripe separado). El Customer de Stripe se
// guarda en printshops.stripe_customer_id (no en users), porque la
// suscripción pertenece al negocio, no a la cuenta personal del dueño.
// Devuelve el client_secret del primer cobro para confirmarlo con
// Stripe.js — mismo patrón que create-subscription (clientes).
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

    // Verificar que quien llama es dueño de una papelería
    const { data: shop } = await supabase
      .from('printshops')
      .select('id, name, stripe_customer_id, subscription_status')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!shop) return json({ error: 'No tienes una papelería registrada' }, 404)
    if (shop.subscription_status === 'active') {
      return json({ error: 'Tu papelería ya tiene una suscripción activa' }, 400)
    }

    const STRIPE_SK = Deno.env.get('STRIPE_SECRET_KEY')!
    const PRICE_ID  = Deno.env.get('STRIPE_MENSUALIDAD_PRICE_ID')!
    if (!PRICE_ID) return json({ error: 'Falta configurar STRIPE_MENSUALIDAD_PRICE_ID' }, 500)

    // 1) Reutilizar o crear el Customer de Stripe DE LA PAPELERÍA
    let customerId = shop.stripe_customer_id
    if (!customerId) {
      const { ok, data: customer } = await stripeFetch('customers', STRIPE_SK, new URLSearchParams({
        'email': user.email ?? `${user.id}@pliego.com`,
        'name': shop.name || 'Papelería Pliego',
        'metadata[printshop_id]': shop.id,
        'metadata[owner_id]': user.id,
      }))
      if (!ok) return json({ error: customer.error?.message ?? 'No se pudo crear el cliente' }, 500)
      customerId = customer.id
      await supabase.from('printshops').update({ stripe_customer_id: customerId }).eq('id', shop.id)
    }

    // 2) Crear la suscripción, con el primer cobro pendiente de confirmar
    const { ok, data: subscription } = await stripeFetch('subscriptions', STRIPE_SK, new URLSearchParams({
      'customer': customerId,
      'items[0][price]': PRICE_ID,
      'payment_behavior': 'default_incomplete',
      'payment_settings[save_default_payment_method]': 'on_subscription',
      'expand[0]': 'latest_invoice.confirmation_secret',
      'metadata[printshop_id]': shop.id,
    }))

    if (!ok) return json({ error: subscription.error?.message ?? 'No se pudo crear la suscripción' }, 500)

    const confirmationSecret = subscription.latest_invoice?.confirmation_secret
    if (!confirmationSecret?.client_secret) {
      return json({ error: 'No se pudo iniciar el cobro de la suscripción' }, 500)
    }

    await supabase.from('printshops').update({
      subscription_id: subscription.id,
    }).eq('id', shop.id)

    return json({
      client_secret: confirmationSecret.client_secret,
      subscription_id: subscription.id,
    })

  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
