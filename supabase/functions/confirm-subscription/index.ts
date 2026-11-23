// Pliego · Edge Function: confirm-subscription
// Reconcilia la mensualidad con STRIPE directamente (no espera al webhook).
// La app la llama (a) justo después de pagar, (b) al abrir la pantalla de
// pago/bloqueo, y (c) antes de crear una suscripción nueva. Así:
//  - un pago que SÍ se cobró activa la cuenta aunque el aviso de Stripe
//    (invoice.paid) llegue tarde, llegue en otro formato o se pierda;
//  - si la app se reinició al salir a copiar la tarjeta, al volver se
//    recupera sola;
//  - nunca se cobra dos veces: si ya está pagada, la app NO crea otra.
// Es idempotente: usa el id del invoice como payment_id (igual que el
// webhook), así que procesarlo dos veces no duplica nada.
// Funciona para PAPELERÍA (printshops) y para CLIENTE (users).
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
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const STRIPE_SK = Deno.env.get('STRIPE_SECRET_KEY')!
    const { session_id } = await req.json().catch(() => ({}))

    // ¿Es dueño de papelería o cliente?
    const { data: shop } = await supabase.from('printshops')
      .select('id, subscription_status, subscription_id')
      .eq('owner_id', user.id).maybeSingle()
    const { data: cust } = shop ? { data: null } : await supabase.from('users')
      .select('id, subscription_status, subscription_id, subscription_started_at')
      .eq('id', user.id).maybeSingle()

    const row = shop ?? cust
    if (!row) return json({ error: 'Cuenta no encontrada' }, 404)
    if (row.subscription_status === 'exento') return json({ status: 'exento', active: true })
    // Ya activa: nada que sincronizar (evita llamar a Stripe en cada apertura).
    if (row.subscription_status === 'active') return json({ status: 'active', active: true })
    const sGet = async (path: string) => {
      const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${STRIPE_SK}` } })
      return { ok: r.ok, data: await r.json() }
    }

    // A) Venimos de Stripe Checkout: la suscripción se crea al pagar, así
    //    que el id se toma de la sesión (y se verifica que sea de este usuario).
    let sub: any = null
    if (session_id) {
      const { ok, data: cs } = await sGet(`checkout/sessions/${session_id}?expand[]=subscription.latest_invoice`)
      if (!ok || cs.metadata?.owner_id !== user.id) return json({ status: row.subscription_status, active: false, expired: true })
      if (cs.mode !== 'subscription') return json({ status: row.subscription_status, active: false, expired: true })
      if (cs.status === 'expired') return json({ status: row.subscription_status, active: false, expired: true })
      if (cs.status === 'complete' && cs.payment_status === 'paid' && cs.subscription && typeof cs.subscription === 'object') {
        sub = cs.subscription
        await supabase.from(shop ? 'printshops' : 'users').update({ subscription_id: sub.id }).eq('id', row.id)
      } else {
        // Aún abierta o procesando: sigue pendiente
        return json({ status: row.subscription_status, active: false, pending: true })
      }
    }

    // B) Flujo con formulario en la app: la suscripción ya está guardada.
    if (!sub) {
      if (!row.subscription_id) return json({ status: row.subscription_status, active: false })
      const { ok, data } = await sGet(`subscriptions/${row.subscription_id}?expand[]=latest_invoice`)
      if (!ok) {
        console.error('Stripe no devolvió la suscripción', row.subscription_id, JSON.stringify(data.error))
        return json({ status: row.subscription_status, active: false, checked: false })
      }
      sub = data
    }

    const invoice = sub.latest_invoice
    const paid = (sub.status === 'active' || sub.status === 'trialing')
      && invoice && typeof invoice === 'object' && invoice.status === 'paid'

    if (!paid) {
      // Sigue sin pagarse: no se toca nada (el bloqueo se mantiene).
      return json({ status: row.subscription_status, active: row.subscription_status === 'active', stripe_status: sub.status })
    }

    const amountMXN = (invoice.amount_paid ?? 0) / 100
    const endUnix = invoice.lines?.data?.[0]?.period?.end
      ?? sub.items?.data?.[0]?.current_period_end
      ?? sub.current_period_end
    const periodEnd = endUnix ? new Date(endUnix * 1000).toISOString() : null

    if (shop) {
      await supabase.rpc('record_printshop_subscription_payment', {
        p_printshop_id: shop.id,
        p_amount:       amountMXN,
        p_payment_id:   invoice.id,
        p_period_end:   periodEnd,
      })
      // La función SQL no toca is_available si ya estaba 'active'/'gracia'; si
      // el webhook ya la activó antes, nada cambia. Aquí solo garantizamos que
      // quede activa por si la RPC devolvió false por ya estar procesada pero
      // la fila no llegó a actualizarse.
      const { data: after } = await supabase.from('printshops')
        .select('subscription_status').eq('id', shop.id).maybeSingle()
      if (after?.subscription_status !== 'active') {
        await supabase.from('printshops').update({
          subscription_status: 'active',
          subscription_period_end: periodEnd,
          is_available: true,
        }).eq('id', shop.id)
      }
      return json({ status: 'active', active: true, synced: true })
    }

    // Cliente
    await supabase.from('users').update({
      subscription_status: 'active',
      subscription_period_end: periodEnd,
      ...(cust!.subscription_started_at ? {} : { subscription_started_at: new Date().toISOString() }),
    }).eq('id', cust!.id)
    await supabase.rpc('credit_wallet', {
      p_user_id:     cust!.id,
      p_amount:      amountMXN,
      p_payment_id:  invoice.id,
      p_description: 'Mensualidad ilimitada · Stripe',
      p_method:      'tarjeta',
      p_credits:     0,
    })
    return json({ status: 'active', active: true, synced: true })
  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
