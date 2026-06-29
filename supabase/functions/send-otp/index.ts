// Pliego · Edge Function: send-otp
// Genera OTP, lo guarda en DB y lo envía por WhatsApp
// Usa plantilla 'pliego_otp' cuando esté aprobada, texto libre como fallback
// Secrets: META_WHATSAPP_TOKEN, META_PHONE_NUMBER_ID

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

async function sendWhatsApp(
  token: string,
  phoneNumId: string,
  to: string,
  code: string
): Promise<{ ok: boolean; method: string; error?: string }> {
  const url = `https://graph.facebook.com/v19.0/${phoneNumId}/messages`
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // 1) Intentar con plantilla de autenticación (pliego_otp)
  // Solo disponible cuando la verificación del negocio esté aprobada
  const templatePayload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: 'pliego_otp',
      language: { code: 'es_MX' },
      components: [{
        type: 'body',
        parameters: [{ type: 'text', text: code }]
      }, {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: code }]
      }]
    }
  }

  const r1 = await fetch(url, { method: 'POST', headers, body: JSON.stringify(templatePayload) })
  const d1 = await r1.json()

  if (r1.ok) {
    console.log(`✅ [template OTP] enviado a ${to} — ${d1.messages?.[0]?.id}`)
    return { ok: true, method: 'template' }
  }

  console.warn(`⚠️ Plantilla OTP no disponible (${d1.error?.code} ${d1.error?.error_subcode}), usando texto libre`)

  // 2) Fallback: texto libre
  // Funciona sin restricciones una vez que la verificación del negocio esté aprobada
  const textPayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      body: `🔐 Tu código de verificación de Pliego es: *${code}*\n\nVálido por 10 minutos. No lo compartas con nadie.\n\n_Pliego — Imprime cerca de ti_`
    }
  }

  const r2 = await fetch(url, { method: 'POST', headers, body: JSON.stringify(textPayload) })
  const d2 = await r2.json()

  if (r2.ok) {
    console.log(`✅ [text OTP] enviado a ${to} — ${d2.messages?.[0]?.id}`)
    return { ok: true, method: 'text' }
  }

  console.error('Meta error en OTP:', d2)
  return { ok: false, method: 'none', error: d2.error?.message ?? 'Error de Meta' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const META_TOKEN   = Deno.env.get('META_WHATSAPP_TOKEN')
    const PHONE_NUM_ID = Deno.env.get('META_PHONE_NUMBER_ID')

    if (!META_TOKEN || !PHONE_NUM_ID) {
      console.error('Faltan secrets META_WHATSAPP_TOKEN / META_PHONE_NUMBER_ID')
      return json({ error: 'Meta WhatsApp no configurado' }, 500)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { action, phone, code: inputCode } = await req.json()

    if (!phone) return json({ error: 'phone es requerido' }, 400)

    // Normalizar número mexicano
    let normalized = phone.replace(/\D/g, '')
    if (normalized.length === 10) normalized = '52' + normalized
    if (!normalized.startsWith('52')) normalized = '52' + normalized

    // ── ENVIAR OTP ─────────────────────────────────────────────────────────
    if (action === 'send') {
      // Invalidar códigos anteriores del mismo número
      await supabase
        .from('otp_codes')
        .update({ used: true })
        .eq('phone', phone.replace(/\D/g, ''))
        .eq('used', false)

      // Generar código de 6 dígitos
      const code = Math.floor(100000 + Math.random() * 900000).toString()

      // Guardar en DB con expiración 10 min
      const { error: insertError } = await supabase
        .from('otp_codes')
        .insert({ phone: phone.replace(/\D/g, ''), code })

      if (insertError) {
        console.error('Error guardando OTP:', insertError)
        return json({ error: 'Error interno al generar código' }, 500)
      }

      // Enviar por WhatsApp
      const result = await sendWhatsApp(META_TOKEN, PHONE_NUM_ID, normalized, code)

      if (!result.ok) {
        // Marcar código como usado si no se pudo enviar
        await supabase.from('otp_codes').update({ used: true })
          .eq('phone', phone.replace(/\D/g, '')).eq('code', code)
        return json({ error: result.error ?? 'No se pudo enviar el código' }, 500)
      }

      return json({ ok: true, message: 'Código enviado por WhatsApp', method: result.method })
    }

    // ── VERIFICAR OTP ──────────────────────────────────────────────────────
    if (action === 'verify') {
      if (!inputCode) return json({ error: 'code es requerido' }, 400)

      const phoneClean = phone.replace(/\D/g, '')

      const { data: otpRow, error } = await supabase
        .from('otp_codes')
        .select('*')
        .eq('phone', phoneClean)
        .eq('code', inputCode.trim())
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error || !otpRow) {
        console.warn(`OTP inválido para ${phoneClean}: ${inputCode}`)
        return json({ ok: false, error: 'Código incorrecto o expirado' }, 400)
      }

      // Marcar como usado
      await supabase
        .from('otp_codes')
        .update({ used: true })
        .eq('id', otpRow.id)

      console.log(`✅ OTP verificado para ${phoneClean}`)
      return json({ ok: true, message: 'Número verificado correctamente' })
    }

    return json({ error: 'action debe ser "send" o "verify"' }, 400)

  } catch (e) {
    console.error('Error interno send-otp:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
