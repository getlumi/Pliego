// Pliego · Edge Function: whatsapp-webhook
// Recibe eventos de Meta WhatsApp Cloud API
// Secrets requeridos: META_WEBHOOK_VERIFY_TOKEN, META_WHATSAPP_TOKEN, META_PHONE_NUMBER_ID

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

Deno.serve(async (req) => {
  // ── Verificación del webhook (GET) ──────────────────────────────────────
  // Meta llama a GET para verificar que el endpoint existe
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    const VERIFY_TOKEN = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') ?? 'pliego_webhook_2026'

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verificado por Meta')
      return new Response(challenge, { status: 200 })
    }

    console.error('❌ Token de verificación incorrecto')
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ── Recepción de eventos (POST) ─────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      console.log('📨 Webhook recibido:', JSON.stringify(body))

      const entry   = body?.entry?.[0]
      const changes = entry?.changes?.[0]
      const value   = changes?.value

      // Mensaje entrante
      if (value?.messages?.[0]) {
        const msg    = value.messages[0]
        const from   = msg.from   // número del remitente
        const text   = msg.text?.body ?? ''
        const msgId  = msg.id

        console.log(`📩 Mensaje de ${from}: ${text}`)

        // Por ahora solo logueamos — aquí se puede agregar:
        // - Respuesta automática
        // - Guardar en support_tickets
        // - Notificar al admin
      }

      // Actualización de estado (sent, delivered, read)
      if (value?.statuses?.[0]) {
        const status = value.statuses[0]
        console.log(`📊 Estado mensaje ${status.id}: ${status.status}`)
      }

      return json({ ok: true })
    } catch (e) {
      console.error('Error procesando webhook:', e)
      return json({ error: 'Error interno' }, 500)
    }
  }

  return new Response('Method not allowed', { status: 405 })
})
