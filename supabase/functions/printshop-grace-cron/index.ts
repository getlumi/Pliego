// Pliego · Edge Function: printshop-grace-cron
// Revisa el periodo de gracia de las papelerías (3 meses fundadoras /
// 1 mes nuevas — ver supabase_migration_printshop_subscription.sql):
// - Avisa por SMS 7 días y 1 día antes de que se acabe la gracia.
// - Si se acaba sin que se hayan suscrito: bloquea la papelería
//   (subscription_status='bloqueada', is_available=false) — deja de
//   aparecer/recibir pedidos hasta que se suscriban, sin borrar nada
//   de su información.
// Pensada para correr una vez al día (pg_cron), no cada hora como
// guarantee-cron — el periodo de gracia se mide en días, no en horas.
// IMPORTANTE: desplegar con "Verify JWT" DESACTIVADO — la llama
// pg_cron/pg_net sin token de usuario.
// Secrets: SMSMASIVOS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const SMS_MASIVOS_BASE = 'https://api.smsmasivos.com.mx'

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
      name: 'pliego_gracia_papeleria',
    }),
  })
  const d = await r.json()
  return { ok: r.ok && d.success !== false, raw: d }
}

Deno.serve(async (_req) => {
  try {
    const SMS_API_KEY = Deno.env.get('SMSMASIVOS_API_KEY')
    if (!SMS_API_KEY) return json({ error: 'SMS Masivos no configurado' }, 500)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const results = { warned_7d: 0, warned_1d: 0, blocked: 0, errors: [] as string[] }

    // ── 1) Avisos 7 días antes ──────────────────────────────────────────
    const { data: due7d, error: err7d } = await supabase
      .from('printshop_grace_due_warning_7d').select('*')
    if (err7d) results.errors.push(`7d query: ${err7d.message}`)

    for (const shop of due7d ?? []) {
      const days = Math.max(1, Math.ceil(
        (new Date(shop.grace_period_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ))
      const message = `Pliego: en ${days} dias termina tu periodo de gracia. ` +
        `Suscribete por $75/mes en la app para seguir recibiendo pedidos sin interrupcion.`
      const result = await sendSms(SMS_API_KEY, shop.phone, shop.country_code, message)
      if (result.ok) {
        await supabase.rpc('mark_printshop_warned', { p_printshop_id: shop.id, p_which: '7d' })
        results.warned_7d++
      } else {
        results.errors.push(`warn7d ${shop.id}: ${JSON.stringify(result.raw ?? result.error)}`)
      }
    }

    // ── 2) Avisos 1 día antes ───────────────────────────────────────────
    const { data: due1d, error: err1d } = await supabase
      .from('printshop_grace_due_warning_1d').select('*')
    if (err1d) results.errors.push(`1d query: ${err1d.message}`)

    for (const shop of due1d ?? []) {
      const message = `Pliego: MAÑANA termina tu periodo de gracia. ` +
        `Suscribete por $75/mes en la app para seguir recibiendo pedidos sin interrupcion.`
      const result = await sendSms(SMS_API_KEY, shop.phone, shop.country_code, message)
      if (result.ok) {
        await supabase.rpc('mark_printshop_warned', { p_printshop_id: shop.id, p_which: '1d' })
        results.warned_1d++
      } else {
        results.errors.push(`warn1d ${shop.id}: ${JSON.stringify(result.raw ?? result.error)}`)
      }
    }

    // ── 3) Gracia vencida sin suscripción → bloquear ────────────────────
    const { data: expired, error: errExp } = await supabase
      .from('printshop_grace_expired').select('*')
    if (errExp) results.errors.push(`expired query: ${errExp.message}`)

    for (const shop of expired ?? []) {
      const { error: blockErr } = await supabase.rpc('block_printshop_for_unpaid_grace', {
        p_printshop_id: shop.id,
      })
      if (blockErr) {
        results.errors.push(`block ${shop.id}: ${blockErr.message}`)
        continue
      }
      results.blocked++

      const { data: ownerRow } = await supabase
        .from('users').select('phone, country_code').eq('id', shop.owner_id).maybeSingle()
      if (ownerRow?.phone) {
        const message = `Pliego: tu periodo de gracia termino y tu papeleria dejo de recibir ` +
          `pedidos. Suscribete por $75/mes en la app para reactivarla.`
        await sendSms(SMS_API_KEY, ownerRow.phone, ownerRow.country_code, message)
      }
    }

    console.log('✅ printshop-grace-cron:', JSON.stringify(results))
    return json({ ok: true, ...results })

  } catch (e) {
    console.error('Error interno printshop-grace-cron:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
