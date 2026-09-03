// Pliego · Edge Function: register
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const WELCOME_CREDITS = 2

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { name, phone, password, country_code } = await req.json()

    if (!name?.trim())                    return json({ error: 'Falta tu nombre' }, 400)
    if (!phone?.trim())                   return json({ error: 'Falta tu número' }, 400)
    if (!password || password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400)

    const cleanPhone = phone.replace(/\D/g, '')
    if (!/^\d{10}$/.test(cleanPhone)) {
      return json({ error: 'El número debe tener 10 dígitos' }, 400)
    }

    const lada = (country_code ?? '52').replace(/\D/g, '') || '52'
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

    const { error: insertError } = await supabaseAdmin.from('users').insert({
      id: userId,
      name: name.trim(),
      phone: cleanPhone,
      country_code: lada,
      wallet_balance: 0,
      credits_balance: WELCOME_CREDITS,
      privacy_accepted_at: new Date().toISOString(),
      onboarding_seen: false,
    })

    if (insertError && insertError.code !== '23505') {
      return json({ error: 'Tu cuenta se creó, pero hubo un problema con tu perfil. Intenta iniciar sesión.' }, 207)
    }

    await supabaseAdmin.from('wallet_transactions').insert({
      user_id: userId,
      amount: 0,
      credits: WELCOME_CREDITS,
      type: 'recarga',
      description: '🎁 Crédito de bienvenida · 2 créditos',
    })

    return json({ success: true, user_id: userId })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error desconocido' }, 500)
  }
})
