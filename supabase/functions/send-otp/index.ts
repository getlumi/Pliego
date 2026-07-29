// Pliego · Edge Function: send-otp
// Genera OTP y lo envía por SMS usando SMS Masivos (canal temporal mientras
// se aprueba la verificación de negocio de Meta para WhatsApp).
// SMS Masivos genera, guarda, expira y valida el código server-side —
// ya no usamos la tabla otp_codes propia.
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
function isValidPhoneFormat(digits) {
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

    const ladaCode = (country_code ?? '52').replace(/\D/g, '') || '52'

    // ── ENVIAR OTP ─────────────────────────────────────────────────────────
    if (action === 'send') {
      const r = await fetch(`${SMS_MASIVOS_BASE}/otp/send`, {
        method: 'POST',
        headers: { 'apikey': SMS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number:  digits,
          country_code:  Number(ladaCode),
          company:       'Pliego',
          template:      'f',        // "{{company}} Tu codigo es: {{code}}"
          code_length:   6,
          code_type:     'numeric',
        }),
      })
      const d = await r.json()

      if (!r.ok || d.success === false) {
        console.error('Error SMS Masivos /otp/send:', d)
        return json({ error: d.message ?? 'No se pudo enviar el código' }, 500)
      }

      console.log(`✅ [SMS OTP] enviado a ${digits} — ${d.request_id}`)
      return json({ ok: true, message: 'Código enviado por SMS', method: 'sms' })
    }

    // ── VERIFICAR OTP ──────────────────────────────────────────────────────
    if (action === 'verify') {
      if (!inputCode) return json({ error: 'code es requerido' }, 400)

      const r = await fetch(`${SMS_MASIVOS_BASE}/otp/verify`, {
        method: 'POST',
        headers: { 'apikey': SMS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number:       digits,
          verification_code:  inputCode.trim(),
        }),
      })
      const d = await r.json()

      if (!r.ok || d.success === false) {
        console.warn(`OTP inválido para ${digits}:`, d.message)
        return json({ ok: false, error: 'Código incorrecto o expirado' }, 400)
      }

      console.log(`✅ OTP verificado para ${digits}`)
      return json({ ok: true, message: 'Número verificado correctamente' })
    }

    return json({ error: 'action debe ser "send" o "verify"' }, 400)

  } catch (e) {
    console.error('Error interno send-otp:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
