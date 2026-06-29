// Pliego · Edge Function: send-whatsapp
// Envía mensajes de WhatsApp vía Meta Cloud API directamente
// Secrets requeridos: META_WHATSAPP_TOKEN, META_PHONE_NUMBER_ID

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
        `📍 ${data.direccion ?? 'Ver en la app'}\n` +
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
    const META_TOKEN   = Deno.env.get('META_WHATSAPP_TOKEN')
    const PHONE_NUM_ID = Deno.env.get('META_PHONE_NUMBER_ID')

    if (!META_TOKEN || !PHONE_NUM_ID) {
      console.error('Faltan secrets: META_WHATSAPP_TOKEN y META_PHONE_NUMBER_ID son requeridos')
      return json({ error: 'Meta WhatsApp no configurado' }, 500)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { user_id, whatsapp: directWhatsapp, tipo, data = {} } = await req.json()

    if (!tipo) return json({ error: 'tipo es requerido' }, 400)

    let toNumber = directWhatsapp

    if (!toNumber && user_id) {
      const { data: userRow } = await supabase
        .from('users').select('phone').eq('id', user_id).maybeSingle()
      if (userRow?.phone) {
        toNumber = userRow.phone
      } else {
        const { data: shopRow } = await supabase
          .from('printshops').select('whatsapp').eq('owner_id', user_id).maybeSingle()
        toNumber = shopRow?.whatsapp
      }
    }

    if (!toNumber) return json({ error: 'No se encontró número de WhatsApp' }, 400)

    // Normalizar número mexicano
    let normalized = toNumber.replace(/\D/g, '')
    if (normalized.length === 10) normalized = '52' + normalized
    if (!normalized.startsWith('52')) normalized = '52' + normalized

    const mensaje = buildMessage(tipo, data)

    // Enviar vía Meta Cloud API
    const res = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUM_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalized,
        type: 'text',
        text: { body: mensaje }
      })
    })

    const result = await res.json()

    if (!res.ok) {
      console.error('Meta API error:', result)
      return json({ error: result.error?.message ?? 'Error de Meta' }, 500)
    }

    console.log(`✅ WhatsApp enviado a ${normalized} (tipo: ${tipo}) — ID: ${result.messages?.[0]?.id}`)
    return json({ ok: true, id: result.messages?.[0]?.id, to: normalized })

  } catch (e) {
    console.error('Error interno send-whatsapp:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
