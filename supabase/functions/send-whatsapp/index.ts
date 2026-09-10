// Pliego · Edge Function: send-whatsapp
// Envía "nuevo_pedido" (a la papelería) y "pedido_listo" (al cliente) por
// WhatsApp transaccional (línea propia de Pliego conectada vía SMS
// Masivos), con SMS como respaldo automático si el envío por WhatsApp
// falla — nunca debe pasar que un pedido se quede sin avisar a nadie.
//
// 🔒 SEGURIDAD (corregido 07/09/2026): antes esta función confiaba en un
// `user_id`/`whatsapp` que mandaba el cliente directo en el body de la
// petición, sin verificar nada — cualquiera con una cuenta en Pliego
// (o incluso sin pasar por la app, golpeando la URL directo) podía
// invocar esta función con cualquier número de teléfono y hacer que
// Pliego mandara mensajes pagados a quien fuera, usando su propia marca.
// Ahora la función NUNCA confía en el destinatario que manda el cliente:
// recibe un `order_id`, verifica con el JWT de quien llama que de verdad
// es el cliente dueño de ese pedido (para nuevo_pedido) o el dueño de la
// papelería de ese pedido (para pedido_listo), y el número de teléfono
// se busca siempre del lado del servidor, nunca del cuerpo de la
// petición.
//
// IMPORTANTE — uso permitido según la documentación oficial de SMS
// Masivos (app.smsmasivos.com.mx/api-docs/whatsapp): este canal es SOLO
// para mensajes transaccionales uno a uno derivados de una acción real
// del usuario. Nunca agregar aquí promociones ni envíos en lote.
//
// Endpoint real: POST /whatsapp/send con instance_id (no /sms/send con
// un flag de canal). Límite real de WhatsApp: 1000 caracteres.
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

function capMessageLength(msg: string, max = 160): string {
  return msg.length <= max ? msg : msg.slice(0, max - 1) + '…'
}

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

async function sendWhatsapp(apiKey: string, instanceId: string, digits: string, ladaCode: string, message: string) {
  const r = await fetch(`${SMS_MASIVOS_BASE}/whatsapp/send`, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instance_id: instanceId,
      number: digits,
      country_code: Number(ladaCode.replace(/\D/g, '') || '52'), // faltaba - causa real de "Codigo de pais no definido"
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
      message, numbers: digits,
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

    // ── Verificar QUIÉN llama, con su propio JWT — nunca confiar en un
    // user_id/teléfono que venga en el cuerpo de la petición.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autenticado' }, 401)

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser()
    if (authError || !caller) return json({ error: 'No autenticado' }, 401)

    const { order_id, tipo, data = {} } = await req.json()
    if (!order_id) return json({ error: 'order_id es requerido' }, 400)
    if (!tipo)     return json({ error: 'tipo es requerido' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: order } = await admin
      .from('orders').select('id, user_id, printshop_id').eq('id', order_id).maybeSingle()
    if (!order) return json({ error: 'Pedido no encontrado' }, 404)

    let toNumber: string | null = null
    let ladaCode = '52'

    if (tipo === 'nuevo_pedido') {
      // Solo el cliente DUEÑO de este pedido puede disparar su propio
      // aviso de "nuevo pedido" hacia la papelería.
      if (caller.id !== order.user_id) {
        console.error(`🚫 ${caller.id} intentó notificar nuevo_pedido de la orden ${order_id} (dueño real: ${order.user_id})`)
        return json({ error: 'No autorizado' }, 403)
      }
      const { data: shop } = await admin
        .from('printshops').select('whatsapp').eq('id', order.printshop_id).maybeSingle()
      toNumber = shop?.whatsapp ?? null

    } else if (tipo === 'pedido_listo') {
      // Solo el DUEÑO de la papelería de este pedido puede disparar el
      // aviso de "listo" hacia el cliente.
      const { data: shop } = await admin
        .from('printshops').select('owner_id').eq('id', order.printshop_id).maybeSingle()
      if (!shop || caller.id !== shop.owner_id) {
        console.error(`🚫 ${caller.id} intentó notificar pedido_listo de la orden ${order_id} (dueño real: ${shop?.owner_id})`)
        return json({ error: 'No autorizado' }, 403)
      }
      const { data: userRow } = await admin
        .from('users').select('phone, country_code').eq('id', order.user_id).maybeSingle()
      toNumber = userRow?.phone ?? null
      ladaCode = userRow?.country_code ?? '52'

    } else {
      return json({ error: 'tipo debe ser "nuevo_pedido" o "pedido_listo"' }, 400)
    }

    if (!toNumber) return json({ error: 'No se encontró número de teléfono para este pedido' }, 400)

    let digits = toNumber.replace(/\D/g, '')
    if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2)
    if (digits.length === 11 && digits.startsWith('1'))  digits = digits.slice(1)

    if (WA_INSTANCE_ID) {
      const waMessage = buildWhatsappMessage(tipo, data)
      const wa = await sendWhatsapp(SMS_API_KEY, WA_INSTANCE_ID, digits, ladaCode, waMessage)
      if (wa.ok) {
        console.log(`✅ [WhatsApp] enviado a ${digits} (${tipo}, orden ${order_id})`)
        return json({ ok: true, method: 'whatsapp', to: digits })
      }
      console.warn(`⚠️ WhatsApp falló (HTTP ${wa.status}) para ${digits} (${tipo}), cayendo a SMS:`, wa.result)
    } else {
      console.warn('SMSMASIVOS_WA_INSTANCE_ID no configurado — enviando directo por SMS')
    }

    const smsMessage = capMessageLength(buildSmsMessage(tipo, data))
    const sms = await sendSms(SMS_API_KEY, digits, ladaCode, smsMessage, tipo)

    if (!sms.ok) {
      console.error(`❌ SMS de respaldo también falló para ${digits} (${tipo}):`, sms.result)
      return json({ error: sms.result.message ?? 'No se pudo enviar ni por WhatsApp ni por SMS' }, 500)
    }

    console.log(`✅ [SMS · respaldo] enviado a ${digits} (${tipo}, orden ${order_id})`)
    return json({ ok: true, method: 'sms (respaldo)', to: digits })

  } catch (e) {
    console.error('Error interno send-whatsapp:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
