// Pliego · Edge Function: payment-webhook
// Recibe notificaciones de Mercado Pago (IPN/webhook) y acredita
// el saldo en el wallet del usuario cuando el pago es aprobado.
// No requiere autenticación (es llamado por Mercado Pago directamente).

import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  // Mercado Pago envía GET con query params o POST con body
  const url = new URL(req.url)
  const topic = url.searchParams.get('topic') || url.searchParams.get('type')
  const id    = url.searchParams.get('id')    || url.searchParams.get('data.id')

  // Solo procesamos notificaciones de pagos
  if (topic !== 'payment' && topic !== 'merchant_order') {
    return json({ ok: true })
  }

  if (!id) return json({ ok: true })

  try {
    const ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Consultar el pago en Mercado Pago
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    })

    if (!mpRes.ok) return json({ error: 'No se pudo consultar el pago' }, 400)

    const payment = await mpRes.json()

    // Solo procesar pagos aprobados
    if (payment.status !== 'approved') {
      return json({ ok: true, status: payment.status })
    }

    // Extraer datos del external_reference
    let ref: { user_id: string; package_id: string; prints: number; amount: number }
    try {
      ref = JSON.parse(payment.external_reference)
    } catch {
      return json({ error: 'external_reference inválido' }, 400)
    }

    // Acreditar saldo de forma atómica (evita duplicados por condición de carrera)
    const { data: credited, error: creditError } = await supabase
      .rpc('credit_wallet', {
        p_user_id:     ref.user_id,
        p_amount:      ref.amount,
        p_payment_id:  String(payment.id),
        p_description: `Recarga ${ref.prints} impresiones · MP #${payment.id}`,
        p_method:      payment.payment_type_id === 'ticket' ? 'oxxo' : 'tarjeta',
      })

    if (creditError) {
      console.error('Error acreditando saldo:', creditError)
      return json({ error: 'Error al acreditar saldo' }, 500)
    }

    if (!credited) {
      console.log(`⚠️ Pago ${payment.id} ya fue procesado anteriormente`)
      return json({ ok: true, already_processed: true })
    }

    console.log(`✅ Saldo acreditado: $${ref.amount} a usuario ${ref.user_id}`)
    return json({ ok: true, credited: ref.amount })

  } catch (e) {
    console.error('Webhook error:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
