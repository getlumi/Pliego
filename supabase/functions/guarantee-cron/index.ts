// Pliego · Edge Function: guarantee-cron
// La llama pg_cron cada hora (ver supabase_migration_guarantee.sql, sección 10).
// - Si son las 6am hora Cancún: manda avisos de "te quedan X horas" a
//   garantías activas que aún no se han avisado.
// - Siempre revisa garantías vencidas (deadline cumplido):
//   · hold_type='credito'      → descuenta el crédito automáticamente.
//   · hold_type='suscripcion'  → suspende la cuenta (ver
//     supabase_migration_suspension.sql) y pausa el cobro de Stripe
//     (pause_collection) — no se le sigue cobrando el $75/mes mientras
//     está suspendido.
// IMPORTANTE: esta función debe desplegarse con "Verify JWT" DESACTIVADO
// en su configuración de Supabase — pg_cron/pg_net la llama sin token de
// usuario, solo con la Service Role a nivel de base de datos.
// Secrets: SMSMASIVOS_API_KEY, STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const SMS_MASIVOS_BASE = 'https://api.smsmasivos.com.mx'

async function pauseStripeSubscription(stripeSk: string, subscriptionId: string) {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeSk}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ 'pause_collection[behavior]': 'void' }).toString(),
  })
  return res.ok
}

async function sendSms(apiKey: string, phone: string, countryCode: string, message: string) {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('1'))  digits = digits.slice(1)
  if (!/^\d{10}$/.test(digits)) return { ok: false, error: 'Teléfono inválido' }

  const r = await fetch(`${SMS_MASIVOS_BASE}/sms/send`, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      numbers: digits,
      country_code: Number((countryCode ?? '52').replace(/\D/g, '') || '52'),
      name: 'pliego_garantia',
    }),
  })
  const d = await r.json()
  return { ok: r.ok && d.success !== false, raw: d }
}

Deno.serve(async (_req) => {
  try {
    const SMS_API_KEY = Deno.env.get('SMSMASIVOS_API_KEY')
    if (!SMS_API_KEY) return json({ error: 'SMS Masivos no configurado' }, 500)
    const STRIPE_SK = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Hora actual en Cancún (America/Cancun, sin horario de verano)
    const cancunHour = Number(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Cancun' })
        .format(new Date())
    )

    const results = { warnings_sent: 0, expirations_executed: 0, errors: [] as string[] }

    // ── 1) Avisos de 6am ──────────────────────────────────────────────────
    if (cancunHour === 6) {
      const { data: dueWarnings, error: warnErr } = await supabase
        .from('guarantee_holds_due_warning')
        .select('*')

      if (warnErr) results.errors.push(`warning query: ${warnErr.message}`)

      for (const hold of dueWarnings ?? []) {
        const hoursLeft = Math.max(1, Math.round(
          (new Date(hold.deadline).getTime() - Date.now()) / (1000 * 60 * 60)
        ))
        const message = hold.hold_type === 'suscripcion'
          ? `Pliego: te quedan ${hoursLeft}h para pasar por tu documento. Si no pasas, tu cuenta se suspendera hasta que pagues $50 de reactivacion.`
          : `Pliego: te quedan ${hoursLeft}h para pasar por tu impresion. ` +
            `Si no pasas, se descontaran ${hold.credits_held} credito(s) de tu cuenta.`

        const result = await sendSms(SMS_API_KEY, hold.phone, hold.country_code, message)
        if (result.ok) {
          await supabase.rpc('mark_guarantee_warned', { p_order_id: hold.order_id })
          results.warnings_sent++
        } else {
          results.errors.push(`warning ${hold.order_id}: ${JSON.stringify(result.raw ?? result.error)}`)
        }
      }
    }

    // ── 2) Vencimientos ──────────────────────────────────────────────────
    const { data: dueExpiry, error: expErr } = await supabase
      .from('guarantee_holds_due_expiry')
      .select('*')

    if (expErr) results.errors.push(`expiry query: ${expErr.message}`)

    for (const hold of dueExpiry ?? []) {
      const { data: executed, error: execErr } = await supabase.rpc('execute_guarantee_expiry', {
        p_order_id: hold.order_id,
      })
      if (execErr) {
        results.errors.push(`expiry ${hold.order_id}: ${execErr.message}`)
        continue
      }
      if (!executed) continue

      results.expirations_executed++

      if (hold.hold_type === 'suscripcion') {
        // Suspender el cobro de Stripe mientras la cuenta está suspendida
        const { data: userRow } = await supabase
          .from('users').select('phone, country_code, subscription_id').eq('id', hold.user_id).maybeSingle()

        if (userRow?.subscription_id && STRIPE_SK) {
          const paused = await pauseStripeSubscription(STRIPE_SK, userRow.subscription_id)
          if (!paused) results.errors.push(`pause_collection ${hold.order_id}: fallo al pausar Stripe`)
        }

        if (userRow?.phone) {
          const message = `Pliego: tu cuenta fue suspendida por no recoger tu documento a tiempo. ` +
            `Paga $50 en la app para reactivarla.`
          await sendSms(SMS_API_KEY, userRow.phone, userRow.country_code, message)
        }
        continue
      }

      // hold_type = 'credito' (comportamiento original)
      const { data: userRow } = await supabase
        .from('users').select('phone, country_code').eq('id', hold.user_id).maybeSingle()
      if (userRow?.phone) {
        const message = `Pliego: se descontaron ${hold.credits_held} credito(s) por no pasar ` +
          `por tu impresion a tiempo. Si aun no la recoges, hazlo antes de que expire.`
        await sendSms(SMS_API_KEY, userRow.phone, userRow.country_code, message)
      }
    }

    console.log('✅ guarantee-cron:', JSON.stringify(results))
    return json({ ok: true, cancun_hour: cancunHour, ...results })

  } catch (e) {
    console.error('Error interno guarantee-cron:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
