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

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

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
      email_confirm: true, // <- evita por completo el correo de confirmacion
      user_metadata: { name: name.trim(), phone: cleanPhone },
    })

    if (error) {
      const already = /already.*registered|email.*exists/i.test(error.message ?? '')
      return json({ error: already ? 'Este número ya está registrado. Intenta iniciar sesión.' : error.message }, 400)
    }

    const { error: insertError } = await supabaseAdmin.from('users').insert({
      id: data.user.id,
      name: name.trim(),
      phone: cleanPhone,
      wallet_balance: 0,
      privacy_accepted_at: new Date().toISOString(),
      onboarding_seen: false,
    })

    if (insertError && insertError.code !== '23505') {
      return json({ error: 'Tu cuenta se creó, pero hubo un problema con tu perfil. Intenta iniciar sesión.' }, 207)
    }

    return json({ success: true, user_id: data.user.id })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error desconocido' }, 500)
  }
})
