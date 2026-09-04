// Pliego · Edge Function: send-whatsapp
// Envía "nuevo_pedido" (a la papelería) y "pedido_listo" (al cliente) por
// WhatsApp transaccional (línea propia de Pliego conectada vía SMS
// Masivos), con SMS como respaldo automático si el envío por WhatsApp
// falla — nunca debe pasar que un pedido se quede sin avisar a nadie.
//
// IMPORTANTE — uso permitido según las políticas de SMS Masivos/WhatsApp:
// SOLO mensajes transaccionales disparados por un evento real del cliente
// (pedido nuevo, pedido listo) — nunca promociones, nunca envíos masivos,
// nunca a alguien que no inició una relación con Pliego. Ver documento de
// restricciones del proveedor antes de agregar cualquier tipo de mensaje
// nuevo a esta función.
//
// ✅ Confirmado con un envío real (03/09/2026): el parámetro channel:
// 'whatsapp' SÍ es correcto — la causa real de que cayera a SMS la
// primera vez fue que el mensaje excedía el límite de 160 caracteres que
// este proveedor aplica a cualquier canal, no un parámetro equivocado.
// Ver capMessageLength() más abajo — ahora es imposible que esto se
// repita, sin importar qué tan largos sean los nombres/direcciones.
//
// Secrets: SMSMASIVOS_API_KEY

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

// SMS Masivos aplica un límite de 160 caracteres a CUALQUIER mensaje que
// pase por /sms/send — confirmado con un envío real que falló con
// "Mensaje es muy largo, máximo 160 caracteres" incluso pidiendo el canal
// WhatsApp (WhatsApp en sí no tiene ese límite, pero el endpoint de este
// proveedor lo aplica igual sin importar el canal). Esta función recorta
// como último respaldo — las plantillas de abajo ya están pensadas para
// caber cómodas incluso con nombres/direcciones largos, esto es solo una
// red de seguridad para que nunca vuelva a fallar un envío por longitud.
function capMessageLength(msg: string, max = 160): string {
  return msg.length <= max ? msg : msg.slice(0, max - 1) + '…'
}

// ── Mensaje para WhatsApp — texto libre real (no requiere aprobación de
// plantilla, a diferencia de Meta), adaptado de las plantillas que ya se
// habían redactado y enviado a revisión de Meta (pliego_nuevo_pedido /
// pliego_pedido_listo) — mismo contenido, mismo tono, más compacto para
// caber en el límite de 160 caracteres del proveedor.
function buildWhatsappMessage(tipo: string, data: Record<string, string>): string {
  switch (tipo) {
    case 'nuevo_pedido': {
      const warning = data.garantia === 'no' ? ' ⚠️NO cubierto por garantía.' : ''
      return `🖨️ Nuevo pedido de *${data.cliente ?? 'Cliente'}*: ` +
        `${data.archivo ?? 'documento.pdf'} (${data.paginas ?? '?'}p, ${data.tipo_impresion ?? 'B/N Bond'}, ${data.copias ?? '1'}x).` +
        `${warning} Entra a pliego.live`
    }
    case 'pedido_listo':
      return `✅ Tu pedido en *${data.papeleria ?? 'la papelería'}* ya está listo. ` +
        `${data.direccion ?? 'Ver mapa en la app'} · Tienes 24h para recogerlo.`
    default:
      return data.mensaje ?? 'Mensaje de Pliego'
  }
}

// ── Mensaje para SMS (respaldo) — SIN acentos ni Ñ, GSM-7 seguro. Mismo
// texto que ya funcionaba antes de agregar WhatsApp, sin tocarlo.
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

async function sendVia(apiKey: string, channel: 'whatsapp' | 'sms', digits: string, ladaCode: string, message: string, tipo: string) {
  const body: Record<string, unknown> = {
    message,
    numbers: digits,
    country_code: Number(ladaCode.replace(/\D/g, '') || '52'),
    name: `pliego_${tipo}`,
  }
  if (channel === 'whatsapp') body.channel = 'whatsapp'

  const r = await fetch(`${SMS_MASIVOS_BASE}/sms/send`, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await r.json().catch(() => ({}))
  const ok = r.ok && result.success !== false
  return { ok, status: r.status, result }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SMS_API_KEY = Deno.env.get('SMSMASIVOS_API_KEY')

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

    const waMessage = capMessageLength(buildWhatsappMessage(tipo, data))
    const wa = await sendVia(SMS_API_KEY, 'whatsapp', digits, ladaCode, waMessage, tipo)

    if (wa.ok) {
      console.log(`✅ [WhatsApp] enviado a ${digits} (${tipo}) — ${wa.result.request_id ?? ''}`)
      return json({ ok: true, method: 'whatsapp', to: digits })
    }

    console.warn(`⚠️ WhatsApp falló (HTTP ${wa.status}) para ${digits} (${tipo}), cayendo a SMS:`, wa.result)

    const smsMessage = capMessageLength(buildSmsMessage(tipo, data))
    const sms = await sendVia(SMS_API_KEY, 'sms', digits, ladaCode, smsMessage, tipo)

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
