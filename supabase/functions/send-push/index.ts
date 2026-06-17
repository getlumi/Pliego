// Pliego · Edge Function: send-push
// Envía una notificación push a un usuario específico
// Secrets requeridos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Convertir base64url a Uint8Array
const base64urlToUint8 = (str: string): Uint8Array => {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad  = b64.length % 4 === 0 ? '' : '='.repeat(4 - b64.length % 4)
  return Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0))
}

const uint8ToBase64url = (arr: Uint8Array): string =>
  btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

// Generar JWT VAPID
async function generateVapidJWT(audience: string, privateKeyB64: string, email: string): Promise<string> {
  const header  = { typ: 'JWT', alg: 'ES256' }
  const payload = {
    aud: new URL(audience).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: `mailto:${email}`,
  }
  const enc     = (obj: object) => uint8ToBase64url(new TextEncoder().encode(JSON.stringify(obj)))
  const signing = `${enc(header)}.${enc(payload)}`

  const keyData = base64urlToUint8(privateKeyB64)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    // Reconstruir formato PKCS8 desde raw P-256 private key
    (() => {
      const prefix = new Uint8Array([0x30,0x41,0x02,0x01,0x00,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x04,0x27,0x30,0x25,0x02,0x01,0x01,0x04,0x20])
      const full = new Uint8Array(prefix.length + keyData.length)
      full.set(prefix); full.set(keyData, prefix.length)
      return full.buffer
    })(),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )

  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signing)
  ))
  return `${signing}.${uint8ToBase64url(sig)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
    const VAPID_EMAIL   = Deno.env.get('VAPID_EMAIL') ?? 'soporte@pliego.live'

    const { user_id, title, body, tag, url } = await req.json()
    if (!user_id || !title) return json({ error: 'user_id y title son requeridos' }, 400)

    // Obtener todas las suscripciones del usuario
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id)

    if (!subs?.length) return json({ ok: true, sent: 0, reason: 'no subscriptions' })

    const payload = JSON.stringify({ title, body, tag, url })

    let sent = 0
    for (const sub of subs) {
      try {
        const jwt = await generateVapidJWT(sub.endpoint, VAPID_PRIVATE, VAPID_EMAIL)

        const res = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Authorization':  `vapid t=${jwt},k=${VAPID_PUBLIC}`,
            'Content-Type':   'application/octet-stream',
            'TTL':            '86400',
          },
          body: new TextEncoder().encode(payload),
        })

        if (res.status === 410 || res.status === 404) {
          // Suscripción expirada, eliminarla
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        } else if (res.ok || res.status === 201) {
          sent++
        }
      } catch (e) {
        console.error('Error enviando push a', sub.endpoint, e)
      }
    }

    return json({ ok: true, sent })

  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
