// Pliego · Edge Function: create-payment v2
// Crea una preferencia de Checkout Pro en Mercado Pago y devuelve
// la URL de pago. El frontend redirige al usuario a esa URL.
// Variables de entorno requeridas (Supabase Secrets):
//   MP_ACCESS_TOKEN, MP_PUBLIC_KEY, APP_URL

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body, status = 200) =>
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

    // Verificar que el usuario esté autenticado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const { package_id, method } = await req.json()

    // Paquetes disponibles
    const packages: Record<string, { amount: number; prints: number; label: string }> = {
      basic:   { amount: 20, prints: 10, label: '10 impresiones' },
      popular: { amount: 50, prints: 30, label: '30 impresiones' },
    }

    const pkg = packages[package_id]
    if (!pkg) return json({ error: 'Paquete no válido' }, 400)

    const APP_URL = Deno.env.get('APP_URL') ?? 'https://pliego.live'
    const ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!

    // Métodos de pago según elección del usuario
    const payment_methods = method === 'oxxo'
      ? { excluded_payment_types: [
            { id: 'credit_card' }, { id: 'debit_card' },
            { id: 'prepaid_card' }, { id: 'bank_transfer' },
          ]
        }
      : { excluded_payment_types: [{ id: 'ticket' }], installments: 1 }

    // Crear preferencia en Mercado Pago
    const preference = {
      items: [{
        id: package_id,
        title: `Pliego · ${pkg.label}`,
        description: `Recarga de ${pkg.prints} impresiones para tu cuenta Pliego`,
        quantity: 1,
        currency_id: 'MXN',
        unit_price: pkg.amount,
      }],
      payer: {
        email: user.email,
      },
      payment_methods,
      back_urls: {
        success: `${APP_URL}/payment/success`,
        failure: `${APP_URL}/payment/failure`,
        pending: `${APP_URL}/payment/pending`,
      },
      auto_return: 'approved',
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-webhook`,
      external_reference: JSON.stringify({
        user_id: user.id,
        package_id,
        prints: pkg.prints,
        amount: pkg.amount,
      }),
      statement_descriptor: 'PLIEGO',
    }

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preference),
    })

    if (!mpRes.ok) {
      const err = await mpRes.text()
      console.error('MP error:', err)
      return json({ error: 'Error al crear el pago. Intenta de nuevo.' }, 500)
    }

    const data = await mpRes.json()

    return json({
      init_point: data.init_point,       // URL de pago (producción)
      sandbox_init_point: data.sandbox_init_point, // URL de pago (sandbox)
      preference_id: data.id,
    })

  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
