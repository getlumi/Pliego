// Pliego · Edge Function: cancel-shop-subscription
// Cancela la suscripción de la papelería en Stripe al final del periodo
// ya pagado (no de inmediato) — mismo comportamiento que
// cancel-subscription (clientes), pero lee/escribe en printshops.
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

    const { data: shop } = await supabase
      .from('printshops').select('id, subscription_id').eq('owner_id', user.id).maybeSingle()

    if (!shop) return json({ error: 'No tienes una papelería registrada' }, 404)
    if (!shop.subscription_id) {
      return json({ error: 'No tienes una suscripción activa' }, 400)
    }

    const STRIPE_SK = Deno.env.get('STRIPE_SECRET_KEY')!

    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${shop.subscription_id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SK}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ 'cancel_at_period_end': 'true' }).toString(),
    })
    const result = await res.json()

    if (!res.ok) return json({ error: result.error?.message ?? 'No se pudo cancelar' }, 500)

    return json({ ok: true, cancel_at_period_end: true, period_end: result.current_period_end })

  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
