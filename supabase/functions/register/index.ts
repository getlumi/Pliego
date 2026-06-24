// Pliego · Edge Function: register
// Crea un usuario YA CONFIRMADO usando la Admin API (sin enviar correo,
// sin depender de "Confirm email"), y su perfil en public.users.
// Las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY se inyectan
// automáticamente por Supabase, no hay que configurarlas a mano.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const WELCOME_CREDIT = 6 // $6 MXN de bienvenida = 3 servicios gratis

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { name, phone, password } = await req.json()

    if (!name?.trim())            return json({ error: 'Falta tu nombre' }, 400)
    if (!phone?.trim())            return json({ error: 'Falta tu número de WhatsApp' }, 400)
    if (!password || password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400)

    const cleanPhone = phone.replace(/\s/g, '')
    const email = `${cleanPhone}@pliego.com`

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name.trim(), phone: cleanPhone },
    })

    if (error) {
      const already = /already.*registered|email.*exists/i.test(error.message ?? '')
      return json({ error: already ? 'Este número ya está registrado. Intenta iniciar sesión.' : error.message }, 400)
    }

    const userId = data.user.id

    // Crear perfil con crédito de bienvenida
    const { error: insertError } = await supabaseAdmin.from('users').insert({
      id: userId,
      name: name.trim(),
      phone: cleanPhone,
      wallet_balance: WELCOME_CREDIT,
      privacy_accepted_at: new Date().toISOString(),
      onboarding_seen: false,
    })

    if (insertError && insertError.code !== '23505') {
      return json({ error: 'Tu cuenta se creó, pero hubo un problema con tu perfil. Intenta iniciar sesión.' }, 207)
    }

    // Registrar la transacción de bienvenida en el historial del wallet
    await supabaseAdmin.from('wallet_transactions').insert({
      user_id: userId,
      amount: WELCOME_CREDIT,
      type: 'recarga',
      description: '🎁 Crédito de bienvenida',
    })

    return json({ success: true, user_id: userId })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error desconocido' }, 500)
  }
})
