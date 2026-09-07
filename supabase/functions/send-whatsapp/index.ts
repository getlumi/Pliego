// Pliego · Edge Function: send-whatsapp
// Envía "nuevo_pedido" (a la papelería) y "pedido_listo" (al cliente) por
// WhatsApp transaccional (línea propia de Pliego conectada vía SMS
// Masivos), con SMS como respaldo automático si el envío por WhatsApp
// falla — nunca debe pasar que un pedido se quede sin avisar a nadie.
//
// IMPORTANTE — uso permitido según la documentación oficial de SMS
// Masivos (app.smsmasivos.com.mx/api-docs/whatsapp): este canal es SOLO
// para mensajes transaccionales uno a uno derivados de una acción real
// del usuario (exactamente nuevo_pedido y pedido_listo). La regla
// práctica del proveedor: "si disparas dos mensajes simultáneos, ya es
// masivo" — nunca agregar aquí promociones, recordatorios en lote, ni
// nada que no derive de un evento individual de un pedido real.
//
// ✅ CORREGIDO 07/09/2026: el endpoint real es POST /whatsapp/send (no
// /sms/send con un flag de canal, como se había asumido antes) — requiere
// un instance_id de la línea conectada, dato que nunca se estaba
// mandando y por eso siempre fallaba con "Canal de envío no permitido".
// Límite real de WhatsApp: 1000 caracteres (no 160 — eso era el límite
// de /sms/send, que ya no aplica aquí).
// Docs: https://app.smsmasivos.com.mx/api-docs/whatsapp
//
// Secrets: SMSMASIVOS_API_KEY, SMSMASIVOS_WA_INSTANCE_ID

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

const SMS_MASIVOS_BASE = 'https://api.smsmasivos.com.mx'

// Límite real de SMS clásico (GSM-7) — solo aplica al mensaje de
// respaldo, WhatsApp acepta hasta 1000 caracteres.
function capMessageLength(msg: string, max = 160): string {
  return msg.length <= max ? msg : msg.slice(0, max - 1) + '…'
}

// ── Mensaje para WhatsApp — texto libre real, hasta 1000 caracteres.
// Adaptado de las plantillas que ya se habían redactado para Meta
// (pliego_nuevo_pedido / pliego_pedido_listo), con el formato de
// negritas propio de WhatsApp (asteriscos).
function buildWhatsappMessage(tipo: string, data: Record<string, string>): string {
  switch (tipo) {
    case 'nuevo_pedido': {
      const warning = data.garantia === 'no'
        ? '\n\n⚠️ *NO cubierto por garantía* — no imprimas hasta que el cliente esté en tu local.'
        : ''
      const nota = data.instrucciones ? `\n📝 Nota del cliente: _${data.instrucciones}_` : ''
      return `🖨️ *Nuevo pedido en Pliego*\n\n` +
        `👤 Cliente: *${data.cliente ?? 'Cliente'}*\n` +
        `📄 Archivo: *${data.archivo ?? 'documento.pdf'}* (${data.paginas ?? '?'} páginas)\n` +
        `🖨️ Tipo: *${data.tipo_impresion ?? 'B/N Bond'}*\n` +
        `📋 Copias: *${data.copias ?? '1'}*` +
        `${nota}${warning}\n\n` +
        `Entra a pliego.live para descargarlo y marcarlo como listo.`
    }
    case 'pedido_listo':
      return `✅ *Tu impresión está lista*\n\n` +
        `Tu pedido en *${data.papeleria ?? 'la papelería'}* ya está listo para recoger.\n\n` +
        `📍 ${data.direccion ?? 'Ver ubicación en la app'}\n` +
        `⏰ Tienes 24 horas para recogerlo.\n\n` +
        `_Pliego — Imprime cerca de ti_`
    default:
      return data.mensaje ?? 'Mensaje de Pliego'
  }
}

// ── Mensaje para SMS (respaldo) — SIN acentos ni Ñ, GSM-7 seguro, tope
// real de 160 caracteres.
function buildSmsMessage(tipo: string, data: Record<string, string>): string {
  switch (tipo) {
    case 'nuevo_pedido': {
      const warning = data.garantia === 'no'
        ? ' ADVERTENCIA: NO imprimas hasta que el cliente esté en tu local (no cubierto por garantia).'
        : ''
      return `Pliego: nuevo pedido de ${data.cliente ?? 'Cliente'}. ` +
        `Archivo: ${data.archivo ?? 'documento.pdf'} (${data.paginas ?? '?'} pag). ` +
        `Tipo: ${data.tipo_impresion ?? 'B/N Bond'}. Copias: ${data.copias ?? '1'}.` +
        `${data.instrucciones ? ' Nota: ' + data.instrucciones : ''}${warning} ` +
        `Entra a pliego.live para descargarlo.`
    }
    case 'pedido_listo':
      return `Pliego: tu impresion en ${data.papeleria ?? 'la papeleria'} ya esta lista. ` +
        `${data.direccion ?? 'Ver ubicacion en la app'}. Tienes 24 horas para recogerla.`
    default:
      return data.mensaje ?? 'Mensaje de Pliego'
  }
}

async function sendWhatsapp(apiKey: string, instanceId: string, digits: string, message: string) {
  const r = await fetch(`${SMS_MASIVOS_BASE}/whatsapp/send`, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instance_id: instanceId,
      number: digits,
      message,
      type: 'text',
    }),
  })
  const result = await r.json().catch(() => ({}))
  const ok = r.ok && result.success !== false
  return { ok, status: r.status, result }
}

async function sendSms(apiKey: string, digits: string, ladaCode: string, message: string, tipo: string) {
  const r = await fetch(`${SMS_MASIVOS_BASE}/sms/send`, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      numbers: digits,
      country_code: Number(ladaCode.replace(/\D/g, '') || '52'),
      name: `pliego_${tipo}`,
    }),
  })
  const result = await r.json().catch(() => ({}))
  const ok = r.ok && result.success !== false
  return { ok, status: r.status, result }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SMS_API_KEY = Deno.env.get('SMSMASIVOS_API_KEY')
    const WA_INSTANCE_ID = Deno.env.get('SMSMASIVOS_WA_INSTANCE_ID')

    if (!SMS_API_KEY) {
      console.error('Falta secret SMSMASIVOS_API_KEY')
      return json({ error: 'SMS Masivos no configurado' }, 500)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { user_id, whatsapp: directPhone, tipo, data = {} } = await req.json()

    if (!tipo) return json({ error: 'tipo es requerido' }, 400)

    let toNumber = directPhone
    let ladaCode  = '52'

    if (!toNumber && user_id) {
      const { data: userRow } = await supabase
        .from('users').select('phone, country_code').eq('id', user_id).maybeSingle()
      if (userRow?.phone) {
        toNumber = userRow.phone
        ladaCode = userRow.country_code ?? '52'
      } else {
        const { data: shopRow } = await supabase
          .from('printshops').select('whatsapp').eq('owner_id', user_id).maybeSingle()
        toNumber = shopRow?.whatsapp
      }
    }

    if (!toNumber) return json({ error: 'No se encontró número de teléfono' }, 400)

    let digits = toNumber.replace(/\D/g, '')
    if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2)
    if (digits.length === 11 && digits.startsWith('1'))  digits = digits.slice(1)

    // 1) Intentar WhatsApp — solo si hay instance_id configurado. Sin
    // esto, ni vale la pena intentarlo (fallaría siempre con
    // whatsapp_04/08 por instancia inexistente).
    if (WA_INSTANCE_ID) {
      const waMessage = buildWhatsappMessage(tipo, data)
      const wa = await sendWhatsapp(SMS_API_KEY, WA_INSTANCE_ID, digits, waMessage)

      if (wa.ok) {
        console.log(`✅ [WhatsApp] enviado a ${digits} (${tipo}) — ${wa.result.request_id ?? wa.result.code ?? ''}`)
        return json({ ok: true, method: 'whatsapp', to: digits })
      }
      console.warn(`⚠️ WhatsApp falló (HTTP ${wa.status}) para ${digits} (${tipo}), cayendo a SMS:`, wa.result)
    } else {
      console.warn('SMSMASIVOS_WA_INSTANCE_ID no configurado — enviando directo por SMS')
    }

    // 2) Respaldo automático por SMS.
    const smsMessage = capMessageLength(buildSmsMessage(tipo, data))
    const sms = await sendSms(SMS_API_KEY, digits, ladaCode, smsMessage, tipo)

    if (!sms.ok) {
      console.error(`❌ SMS de respaldo también falló para ${digits} (${tipo}):`, sms.result)
      return json({ error: sms.result.message ?? 'No se pudo enviar ni por WhatsApp ni por SMS' }, 500)
    }

    console.log(`✅ [SMS · respaldo] enviado a ${digits} (${tipo}) — ${sms.result.request_id ?? ''}`)
    return json({ ok: true, method: 'sms (respaldo)', to: digits })

  } catch (e) {
    console.error('Error interno send-whatsapp:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
