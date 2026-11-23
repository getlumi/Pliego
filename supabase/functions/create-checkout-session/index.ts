// Pliego · Edge Function: create-checkout-session
// Crea una sesión de Stripe Checkout (página de pago ALOJADA por Stripe) y
// devuelve su URL; la app redirige ahí. Es el mismo modelo de Spotify y
// otras apps: el usuario paga en la web de Stripe, puede salir a copiar su
// tarjeta, reintentar con otra, usar Apple Pay / Google Pay si están
// activos en tu cuenta, y el estado vive en Stripe — no en la app.
//
//  kind = 'subscription' → mensualidad de $75 (papelería o cliente)
//  kind = 'credits'      → paquete de créditos (package_id: basic | popular)
//
// Al volver, la app confirma con `confirm-subscription` (pasando el id de la
// sesión); los créditos los acredita el webhook (payment_intent.succeeded),
// igual que antes.
// Secrets: STRIPE_SECRET_KEY, STRIPE_MENSUALIDAD_PRICE_ID, (opcional) APP_URL

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

const PACKAGES: Record<string, { amount: number; prints: number; label: string }> = {
  basic:   { amount: 26.5, prints: 2, label: '2 créditos' },
  popular: { amount: 55,   prints: 5, label: '5 créditos' },
}

async function stripePost(path: string, sk: string, params: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/x-www-form-urlencoded' },
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
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const { kind, package_id } = await req.json().catch(() => ({}))
    const STRIPE_SK = Deno.env.get('STRIPE_SECRET_KEY')!
    const PRICE_ID  = Deno.env.get('STRIPE_MENSUALIDAD_PRICE_ID')
    const APP_URL   = (Deno.env.get('APP_URL') || 'https://pliego.live').replace(/\/$/, '')
    const email     = user.email ?? `${user.id}@pliego.com`

    const common = (k: string) => ({
      success_url: `${APP_URL}/?pago=ok&k=${k}&cs={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/?pago=cancelado&k=${k}`,
      locale: 'es-419',
      client_reference_id: user.id,
      'metadata[owner_id]': user.id,
      'metadata[kind]': k,
    })

    // ── CRÉDITOS (pago único con tarjeta) ───────────────────────────────
    if (kind === 'credits') {
      const pkg = PACKAGES[package_id]
      if (!pkg) return json({ error: 'Paquete no válido' }, 400)
      const params = new URLSearchParams({
        mode: 'payment',
        ...common('credits'),
        customer_email: email,
        'payment_method_types[]': 'card',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'mxn',
        'line_items[0][price_data][unit_amount]': String(Math.round(pkg.amount * 100)),
        'line_items[0][price_data][product_data][name]': `Pliego · ${pkg.label}`,
        // Mismos metadatos que el flujo anterior: el webhook acredita igual.
        'payment_intent_data[metadata][user_id]':    user.id,
        'payment_intent_data[metadata][package_id]': package_id,
        'payment_intent_data[metadata][prints]':     String(pkg.prints),
        'payment_intent_data[metadata][amount]':     String(pkg.amount),
        'payment_intent_data[metadata][user_email]': user.email ?? '',
        'payment_intent_data[description]':          `Pliego · ${pkg.label}`,
      })
      const { ok, data } = await stripePost('checkout/sessions', STRIPE_SK, params)
      if (!ok) return json({ error: data.error?.message ?? 'No se pudo iniciar el pago' }, 500)
      return json({ url: data.url, session_id: data.id })
    }

    // ── MENSUALIDAD ($75/mes) ───────────────────────────────────────────
    if (kind !== 'subscription') return json({ error: 'Tipo de pago no válido' }, 400)
    if (!PRICE_ID) return json({ error: 'Falta configurar STRIPE_MENSUALIDAD_PRICE_ID' }, 500)

    const { data: shop } = await supabase.from('printshops')
      .select('id, name, stripe_customer_id, subscription_status')
      .eq('owner_id', user.id).maybeSingle()
    const { data: cust } = shop ? { data: null } : await supabase.from('users')
      .select('id, name, stripe_customer_id, subscription_status')
      .eq('id', user.id).maybeSingle()
    const row = shop ?? cust
    if (!row) return json({ error: 'Cuenta no encontrada' }, 404)
    if (row.subscription_status === 'active') return json({ error: 'Ya tienes una suscripción activa' }, 400)
    if (row.subscription_status === 'exento') return json({ error: 'Tu cuenta está exenta de pago' }, 400)

    // Reutilizar o crear el Customer de Stripe (misma tabla que antes: el
    // webhook distingue papelería/cliente por dónde aparece el customer_id)
    let customerId = row.stripe_customer_id
    if (!customerId) {
      const meta = shop
        ? { 'metadata[printshop_id]': shop.id, 'metadata[owner_id]': user.id }
        : { 'metadata[user_id]': user.id }
      const rawName = (row as any).name ?? ''
      const parts = rawName.trim().split(' ').filter((p: string) => p.length >= 2)
      const name = shop ? (shop.name || 'Papelería Pliego')
        : parts.length >= 2 ? rawName.trim() : parts.length === 1 ? `${parts[0]} Cliente` : 'Cliente Pliego'
      const { ok, data } = await stripePost('customers', STRIPE_SK, new URLSearchParams({ email, name, ...meta }))
      if (!ok) return json({ error: data.error?.message ?? 'No se pudo crear el cliente' }, 500)
      customerId = data.id
      await supabase.from(shop ? 'printshops' : 'users').update({ stripe_customer_id: customerId }).eq('id', row.id)
    }

    const params = new URLSearchParams({
      mode: 'subscription',
      ...common('subscription'),
      customer: customerId,
      'line_items[0][price]': PRICE_ID,
      'line_items[0][quantity]': '1',
      'subscription_data[metadata][owner_id]': user.id,
      ...(shop ? { 'subscription_data[metadata][printshop_id]': shop.id }
               : { 'subscription_data[metadata][user_id]': user.id }),
    })
    const { ok, data } = await stripePost('checkout/sessions', STRIPE_SK, params)
    if (!ok) return json({ error: data.error?.message ?? 'No se pudo iniciar el pago' }, 500)
    return json({ url: data.url, session_id: data.id })
  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
