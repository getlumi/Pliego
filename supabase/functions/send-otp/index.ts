// Pliego · Edge Function: send-otp
// Genera OTP y lo envía por SMS usando SMS Masivos — API v2 (/v2/otp).
//
// Migrado de la v1 (/otp/send, /otp/verify) el 02/09/2026: la v1 está
// deprecada por SMS Masivos y tiene un comportamiento problemático real
// que ya nos afectó — si un número queda marcado "verificado" en un
// intento anterior (ej. una prueba que se quedó a medias cuando se
// acabó el saldo), un nuevo envío falla con "Usuario ya verificado" en
// vez de simplemente generar un código nuevo. La v2 no tiene ese
// problema: la misma llamada decide sola si es un envío nuevo, un
// reenvío o un reinicio, sin importar el estado anterior del número.
//
// El contrato hacia el frontend (AuthPage.jsx) NO cambió — sigue siendo
// { action: 'send'|'verify', phone, country_code, code } →
// { ok, error, message } — solo cambió qué pasa puertas adentro contra
// SMS Masivos, para no tener que tocar el cliente de nuevo.
//
// Secrets: SMSMASIVOS_API_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const SMS_MASIVOS_BASE = 'https://api.smsmasivos.com.mx'

// Misma validación que en el frontend, mantenida aquí como defensa
// adicional: si alguien llama esta función directamente (sin pasar por la
// app), no queremos gastar un envío real en un número claramente inválido.
function isValidPhoneFormat(digits: string) {
  if (!/^\d{10}$/.test(digits)) return false
  if (/^(\d)\1{9}$/.test(digits)) return false
  if (digits === '1234567890' || digits === '0123456789') return false
  if (digits === '9876543210' || digits === '0987654321') return false
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SMS_API_KEY = Deno.env.get('SMSMASIVOS_API_KEY')

    if (!SMS_API_KEY) {
      console.error('Falta secret SMSMASIVOS_API_KEY')
      return json({ error: 'SMS Masivos no configurado' }, 500)
    }

    const { action, phone, code: inputCode, country_code } = await req.json()

    if (!phone) return json({ error: 'phone es requerido' }, 400)

    // El número siempre debe llegar como 10 dígitos exactos — el frontend ya
    // lo separa de la lada. Si por algún motivo llega con prefijo, lo
    // limpiamos como respaldo, pero la validación real exige 10 dígitos.
    let digits = phone.replace(/\D/g, '')
    if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2)
    if (digits.length === 11 && digits.startsWith('1'))  digits = digits.slice(1)

    if (!isValidPhoneFormat(digits)) {
      return json({ error: 'Número inválido — debe tener 10 dígitos' }, 400)
    }

    // v2 pide country_code como STRING (ej. "52"), no numérico — así lo
    // documenta SMS Masivos, y así lo mandamos.
    const ladaCode = (country_code ?? '52').toString().replace(/\D/g, '') || '52'

    // ── ENVIAR (o reenviar/reiniciar) OTP ───────────────────────────────────
    // POST /v2/otp decide solo, según el estado guardado del número, si esto
    // es un envío nuevo (created), un reenvío (resent) o un reinicio
    // (restarted) — nunca se queda atorado como pasaba en v1.
    if (action === 'send') {
      const r = await fetch(`${SMS_MASIVOS_BASE}/v2/otp`, {
        method: 'POST',
        headers: { 'apikey': SMS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number:  digits,
          country_code:  ladaCode,
          company:       'Pliego',
          message:       '{{company}}: tu codigo es {{code}}. No lo compartas.',
          code_length:   6,
          code_format:   'numeric',
        }),
      })
      const d = await r.json()

      if (!r.ok || d.success === false) {
        console.error(`Error SMS Masivos POST /v2/otp (HTTP ${r.status}):`, d)
        // otp_throttled trae resend_available_in — se lo pasamos al
        // frontend en el mensaje para que el usuario sepa cuánto esperar,
        // en vez de un "no se pudo enviar" sin contexto.
        if (d.error === 'otp_throttled' && d.resend_available_in) {
          return json({ error: `Espera ${d.resend_available_in} segundos antes de pedir otro código.` }, r.status)
        }
        return json({ error: d.hint || d.message || 'No se pudo enviar el código' }, r.status || 500)
      }

      console.log(`✅ [SMS OTP v2] ${d.action} para ${digits} — ${d.request_id}`)
      return json({ ok: true, message: d.message ?? 'Código enviado por SMS', method: 'sms', expires_at: d.expires_at })
    }

    // ── VERIFICAR OTP ──────────────────────────────────────────────────────
    // El status HTTP de v2 distingue cada caso (200/401/404/409/410/429) —
    // se traduce directo a un mensaje claro para el usuario.
    if (action === 'verify') {
      if (!inputCode) return json({ error: 'code es requerido' }, 400)

      const r = await fetch(`${SMS_MASIVOS_BASE}/v2/otp/verify`, {
        method: 'POST',
        headers: { 'apikey': SMS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: digits,
          country_code: ladaCode,
          code:         inputCode.trim(),
        }),
      })

      if (r.status === 200) {
        console.log(`✅ OTP verificado para ${digits}`)
        return json({ ok: true, message: 'Número verificado correctamente' })
      }

      const d = await r.json().catch(() => ({}))
      let msg = d.hint || 'Código incorrecto o expirado'
      if (r.status === 401) msg = d.hint || `Código incorrecto${d.attempts_remaining != null ? ` — te quedan ${d.attempts_remaining} intentos` : ''}`
      if (r.status === 404) msg = 'No hay una verificación activa para este número. Solicita un código nuevo.'
      if (r.status === 409) msg = 'Este número ya fue verificado. Intenta iniciar sesión.'
      if (r.status === 410) msg = 'El código expiró. Solicita uno nuevo.'
      if (r.status === 429) msg = 'Se agotaron los intentos. Solicita un código nuevo.'

      console.warn(`OTP inválido para ${digits} (HTTP ${r.status}):`, d)
      return json({ ok: false, error: msg }, 400)
    }

    return json({ error: 'action debe ser "send" o "verify"' }, 400)

  } catch (e) {
    console.error('Error interno send-otp:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
