// Pliego · Edge Function: send-whatsapp
// Envía mensajes vía Twilio: SMS ahora, WhatsApp cuando se apruebe el número
// Secrets requeridos: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM
//
// TWILIO_SMS_FROM = número Twilio en formato +1XXXXXXXXXX (se compra en consola Twilio)
// Cuando Meta apruebe WhatsApp: agregar TWILIO_WHATSAPP_FROM y cambiar canal a 'whatsapp'

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

// ─── Tipos de mensaje soportados ────────────────────────────────────────────
// tipo: 'nuevo_pedido'   → notifica al PAPELERO que llegó un pedido
// tipo: 'pedido_listo'   → notifica al USUARIO que puede recoger
// tipo: 'otp'            → envía código de verificación al USUARIO
// ────────────────────────────────────────────────────────────────────────────

function buildMessage(tipo: string, data: Record<string, string>): string {
  switch (tipo) {

    case 'nuevo_pedido':
      return (
        `🖨️ *Nuevo pedido en Pliego*\n\n` +
        `👤 Cliente: *${data.cliente ?? 'Cliente'}*\n` +
        `📄 Archivo: *${data.archivo ?? 'documento.pdf'}* (${data.paginas ?? '?'} páginas)\n` +
        `🖨️ Tipo: *${data.tipo_impresion ?? 'B/N Bond'}*\n` +
        `📋 Copias: *${data.copias ?? '1'}*\n` +
        (data.instrucciones ? `📝 Instrucciones: _${data.instrucciones}_\n` : '') +
        `\nEntra a pliego.live para descargarlo y marcarlo como listo.`
      )

    case 'pedido_listo':
      return (
        `✅ *Tu impresión está lista*\n\n` +
        `Tu pedido en *${data.papeleria ?? 'la papelería'}* ya está listo para recoger.\n\n` +
        `📍 ${data.direccion ?? 'Dirección en la app'}\n` +
        `⏰ Tienes 24 horas para recogerlo.\n\n` +
        `_Pliego — Imprime cerca de ti_`
      )

    case 'otp':
      return (
        `🔐 *Tu código de Pliego es: ${data.codigo}*\n\n` +
        `Válido por 10 minutos. No lo compartas con nadie.`
      )

    default:
      return data.mensaje ?? 'Mensaje de Pliego'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    // SMS_FROM: número Twilio comprado, ej: '+12015551234'
    // WHATSAPP_FROM: cuando Meta lo apruebe, ej: 'whatsapp:+521XXXXXXXXXX'
    const TWILIO_SMS_FROM      = Deno.env.get('TWILIO_SMS_FROM')
    const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') // vacío por ahora
    const TWILIO_FROM = TWILIO_WHATSAPP_FROM || TWILIO_SMS_FROM

    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      console.error('Faltan secrets de Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_SMS_FROM son requeridos')
      return json({ error: 'Twilio no configurado' }, 500)
    }

    const usandoWhatsApp = TWILIO_FROM.startsWith('whatsapp:')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Parámetros esperados ──────────────────────────────────────────────
    // user_id  : UUID del usuario en Supabase (para buscar su WhatsApp en DB)
    //   ó
    // whatsapp : número directo (para OTP en registro, antes de tener user_id)
    //
    // tipo     : 'nuevo_pedido' | 'pedido_listo' | 'otp'
    // data     : objeto con variables del mensaje
    // ─────────────────────────────────────────────────────────────────────
    const { user_id, whatsapp: directWhatsapp, tipo, data = {} } = await req.json()

    if (!tipo) return json({ error: 'tipo es requerido' }, 400)

    let toNumber = directWhatsapp

    // Si nos pasan user_id, buscamos el WhatsApp en la DB
    if (!toNumber && user_id) {
      // Buscar en users primero
      const { data: userRow } = await supabase
        .from('users')
        .select('phone')
        .eq('id', user_id)
        .maybeSingle()

      if (userRow?.phone) {
        toNumber = userRow.phone
      } else {
        // Si no está en users, buscar en printshops (papelero)
        const { data: shopRow } = await supabase
          .from('printshops')
          .select('whatsapp')
          .eq('owner_id', user_id)
          .maybeSingle()
        toNumber = shopRow?.whatsapp
      }
    }

    if (!toNumber) return json({ error: 'No se encontró número de WhatsApp' }, 400)

    // Normalizar número: asegurarse que tenga código de país México (+52)
    // Acepta: '9981234567', '529981234567', '+529981234567'
    let normalized = toNumber.replace(/\D/g, '') // solo dígitos
    if (normalized.length === 10) normalized = '52' + normalized
    if (!normalized.startsWith('52')) normalized = '52' + normalized
    // Si usamos WhatsApp API: prefijo whatsapp:, si es SMS: solo +número
    const to = usandoWhatsApp ? `whatsapp:+${normalized}` : `+${normalized}`

    // Construir mensaje
    const mensaje = buildMessage(tipo, data)

    // Enviar vía Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`
    const body = new URLSearchParams({
      From: TWILIO_FROM,
      To:   to,
      Body: mensaje,
    })

    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body,
    })

    const result = await res.json()

    if (!res.ok) {
      console.error('Twilio error:', result)
      return json({ error: result.message ?? 'Error de Twilio', code: result.code }, 500)
    }

    const canal = usandoWhatsApp ? 'WhatsApp' : 'SMS'
    console.log(`${canal} enviado a ${to} (tipo: ${tipo}) — SID: ${result.sid}`)
    return json({ ok: true, sid: result.sid, to, canal })

  } catch (e) {
    console.error('Error interno send-whatsapp:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
