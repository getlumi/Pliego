// Pliego · Edge Function: send-whatsapp
// NOTA: el nombre de la función se conserva para no tener que tocar el
// frontend (sendOrder.js, PrintshopPage.jsx ya la invocan así). El canal
// real de envío es SMS (SMS Masivos) mientras se aprueba la verificación
// de negocio de Meta para WhatsApp Cloud API.
// Cuando Meta apruebe: revertir este archivo a la versión con Meta Cloud
// API (ver historial de git, commit previo a esta migración) — las
// plantillas pliego_nuevo_pedido / pliego_pedido_listo / pliego_otp ya
// están creadas y listas en Meta, no se tocaron.
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

// Mismos textos que ya usábamos como fallback de texto libre en Meta,
// reutilizados tal cual para el canal SMS.
function buildMessage(tipo: string, data: Record<string, string>): string {
  switch (tipo) {
    case 'nuevo_pedido':
      return `Pliego: nuevo pedido de ${data.cliente ?? 'Cliente'}. ` +
        `Archivo: ${data.archivo ?? 'documento.pdf'} (${data.paginas ?? '?'} pag). ` +
        `Tipo: ${data.tipo_impresion ?? 'B/N Bond'}. Copias: ${data.copias ?? '1'}.` +
        `${data.instrucciones ? ' Nota: ' + data.instrucciones : ''} ` +
        `Entra a pliego.live para descargarlo.`
    case 'pedido_listo':
      return `Pliego: tu impresion en ${data.papeleria ?? 'la papeleria'} ya esta lista. ` +
        `${data.direccion ?? 'Ver ubicacion en la app'}. Tienes 24 horas para recogerla.`
    default:
      return data.mensaje ?? 'Mensaje de Pliego'
  }
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
        // Las papelerías no tienen country_code propio todavía (tabla
        // printshops no lo guarda) — por ahora siempre son de México.
      }
    }

    if (!toNumber) return json({ error: 'No se encontró número de teléfono' }, 400)

    // Número a 10 dígitos para SMS Masivos
    let digits = toNumber.replace(/\D/g, '')
    if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2)
    if (digits.length === 11 && digits.startsWith('1'))  digits = digits.slice(1)

    const message = buildMessage(tipo, data)

    const r = await fetch(`${SMS_MASIVOS_BASE}/sms/send`, {
      method: 'POST',
      headers: { 'apikey': SMS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        numbers: digits,
        country_code: Number(ladaCode.replace(/\D/g, '') || '52'),
        name: `pliego_${tipo}`,
      }),
    })
    const result = await r.json()

    if (!r.ok || result.success === false) {
      console.error('Error SMS Masivos /sms/send:', result)
      return json({ error: result.message ?? 'Error enviando SMS' }, 500)
    }

    console.log(`✅ [SMS] enviado a ${digits} (${tipo}) — ${result.request_id}`)
    return json({ ok: true, method: 'sms', to: digits })

  } catch (e) {
    console.error('Error interno send-whatsapp:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
