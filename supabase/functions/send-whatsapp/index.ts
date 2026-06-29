// Pliego · Edge Function: send-whatsapp
// Envía mensajes de WhatsApp vía Meta Cloud API
// Usa plantillas aprobadas cuando están disponibles, texto libre como fallback
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

// Construye el payload para plantilla aprobada por Meta
function buildTemplatePayload(tipo: string, to: string, data: Record<string, string>) {
  switch (tipo) {
    case 'nuevo_pedido':
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'pliego_nuevo_pedido',
          language: { code: 'es_MX' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: data.cliente ?? 'Cliente' },
              { type: 'text', text: data.archivo ?? 'documento.pdf' },
              { type: 'text', text: data.paginas ?? '1' },
              { type: 'text', text: data.tipo_impresion ?? 'B/N Bond' },
              { type: 'text', text: data.copias ?? '1' },
            ]
          }]
        }
      }
    case 'pedido_listo':
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'pliego_pedido_listo',
          language: { code: 'es_MX' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: data.papeleria ?? 'la papelería' },
              { type: 'text', text: data.direccion ?? 'Ver ubicación en la app' },
            ]
          }]
        }
      }
    default:
      return null
  }
}

// Fallback: texto libre (funciona solo dentro de ventana de 24h o con verificación activa)
function buildTextPayload(tipo: string, to: string, data: Record<string, string>) {
  let body = ''
  switch (tipo) {
    case 'nuevo_pedido':
      body = `🖨️ Nuevo pedido en Pliego\n\n👤 Cliente: ${data.cliente ?? 'Cliente'}\n📄 Archivo: ${data.archivo ?? 'documento.pdf'} (${data.paginas ?? '?'} páginas)\n🖨️ Tipo: ${data.tipo_impresion ?? 'B/N Bond'}\n📋 Copias: ${data.copias ?? '1'}${data.instrucciones ? '\n📝 ' + data.instrucciones : ''}\n\nEntra a pliego.live para descargarlo y marcarlo como listo.`
      break
    case 'pedido_listo':
      body = `✅ Tu impresión está lista\n\nTu pedido en ${data.papeleria ?? 'la papelería'} ya está listo para recoger.\n\n📍 ${data.direccion ?? 'Ver en la app'}\n⏰ Tienes 24 horas para recogerlo.\n\nPliego — Imprime cerca de ti`
      break
    case 'otp':
      body = `🔐 Tu código de verificación de Pliego es: ${data.codigo}\n\nVálido por 10 minutos. No lo compartas con nadie.`
      break
    default:
      body = data.mensaje ?? 'Mensaje de Pliego'
  }
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body } }
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

    const { user_id, whatsapp: directWhatsapp, tipo, data = {}, use_template = true } = await req.json()

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

    let normalized = toNumber.replace(/\D/g, '')
    if (normalized.length === 10) normalized = '52' + normalized
    if (!normalized.startsWith('52')) normalized = '52' + normalized

    const url = `https://graph.facebook.com/v19.0/${PHONE_NUM_ID}/messages`
    const headers = { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' }

    // Intentar con plantilla primero si use_template=true
    if (use_template && tipo !== 'otp') {
      const templatePayload = buildTemplatePayload(tipo, normalized, data)
      if (templatePayload) {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(templatePayload) })
        const result = await res.json()
        if (res.ok) {
          console.log(`✅ [template] WhatsApp enviado a ${normalized} (${tipo}) — ${result.messages?.[0]?.id}`)
          return json({ ok: true, method: 'template', id: result.messages?.[0]?.id, to: normalized })
        }
        // Si falla la plantilla (aún no aprobada), caer en texto libre
        console.warn(`⚠️ Plantilla falló (${result.error?.code}), usando texto libre`)
      }
    }

    // Fallback: texto libre
    const textPayload = buildTextPayload(tipo, normalized, data)
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(textPayload) })
    const result = await res.json()

    if (!res.ok) {
      console.error('Meta API error:', result)
      return json({ error: result.error?.message ?? 'Error de Meta' }, 500)
    }

    console.log(`✅ [text] WhatsApp enviado a ${normalized} (${tipo}) — ${result.messages?.[0]?.id}`)
    return json({ ok: true, method: 'text', id: result.messages?.[0]?.id, to: normalized })

  } catch (e) {
    console.error('Error interno send-whatsapp:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
