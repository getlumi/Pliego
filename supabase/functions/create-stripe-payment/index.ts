// Pliego · Edge Function: create-stripe-payment
// Crea un PaymentIntent de Stripe para tarjeta o OXXO.
// Para OXXO genera el voucher directamente sin redirigir.
// Secrets requeridos: STRIPE_SECRET_KEY, APP_URL

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

// Paquetes disponibles
const PACKAGES: Record<string, { amount: number; prints: number; label: string }> = {
  basic:   { amount: 20, prints: 10, label: '10 impresiones' },
  popular: { amount: 50, prints: 30, label: '30 impresiones' },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verificar autenticación
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const { package_id, method } = await req.json()

    const pkg = PACKAGES[package_id]
    if (!pkg) return json({ error: 'Paquete no válido' }, 400)

    const STRIPE_SK = Deno.env.get('STRIPE_SECRET_KEY')!

    // Metadata para identificar el pago en el webhook
    const metadata = {
      user_id:    user.id,
      package_id,
      prints:     String(pkg.prints),
      amount:     String(pkg.amount),
      user_email: user.email ?? '',
    }

    let body: string

    if (method === 'oxxo') {
      // OXXO requiere crear un customer con email primero
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SK}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'email': user.email ?? `${user.id}@pliego.com`,
          'metadata[user_id]': user.id,
        }).toString(),
      })
      const customer = await customerRes.json()

      // Obtener nombre del usuario para billing_details
      const { data: userRow } = await supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .maybeSingle()
      const rawName = userRow?.name ?? ''
      // Stripe requiere nombre y apellido, min 2 chars cada uno
      const nameParts = rawName.trim().split(' ').filter(p => p.length >= 2)
      const userName = nameParts.length >= 2
        ? rawName.trim()
        : nameParts.length === 1
          ? `${nameParts[0]} Cliente`
          : 'Cliente Pliego'

      const params = new URLSearchParams({
        'amount':                                          String(pkg.amount * 100),
        'currency':                                        'mxn',
        'payment_method_types[]':                          'oxxo',
        'payment_method_data[type]':                       'oxxo',
        'payment_method_data[billing_details][name]':      userName,
        'payment_method_data[billing_details][email]':     user.email ?? '',
        'confirm':                                         'true',
        'customer':                                        customer.id,
        'payment_method_options[oxxo][expires_after_days]': '3',
        'metadata[user_id]':                               metadata.user_id,
        'metadata[package_id]':                            metadata.package_id,
        'metadata[prints]':                                metadata.prints,
        'metadata[amount]':                                metadata.amount,
        'metadata[user_email]':                            metadata.user_email,
        'description':                                     `Pliego · ${pkg.label}`,
        'receipt_email':                                   user.email ?? '',
      })
      body = params.toString()
    } else {
      // Tarjeta: PaymentIntent sin confirmar (el frontend lo confirma con Stripe.js)
      const params = new URLSearchParams({
        'amount':                 String(pkg.amount * 100),
        'currency':               'mxn',
        'payment_method_types[]': 'card',
        'metadata[user_id]':      metadata.user_id,
        'metadata[package_id]':   metadata.package_id,
        'metadata[prints]':       metadata.prints,
        'metadata[amount]':       metadata.amount,
        'metadata[user_email]':   metadata.user_email,
        'description':            `Pliego · ${pkg.label}`,
      })
      body = params.toString()
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SK}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body,
    })

    const intent = await stripeRes.json()

    if (!stripeRes.ok) {
      console.error('Stripe error:', intent)
      return json({ error: intent.error?.message ?? 'Error al crear el pago' }, 500)
    }

    if (method === 'oxxo') {
      // Devolver los datos del voucher OXXO directamente
      const oxxo = intent.next_action?.oxxo_display_details
      return json({
        method:         'oxxo',
        payment_intent: intent.id,
        expires_at:     oxxo?.expires_after,
        hosted_voucher: oxxo?.hosted_voucher_url, // URL del voucher para mostrar/imprimir
        number:         oxxo?.number,             // Número de referencia OXXO
        amount:         pkg.amount,
        prints:         pkg.prints,
      })
    } else {
      // Devolver el client_secret para que el frontend confirme con Stripe.js
      return json({
        method:        'card',
        client_secret: intent.client_secret,
        amount:        pkg.amount,
        prints:        pkg.prints,
      })
    }

  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
