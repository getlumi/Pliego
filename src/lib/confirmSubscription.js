import { supabase } from './supabase'

// Pide al servidor que revise con Stripe si la mensualidad ya se cobró y,
// si es así, la active (ver supabase/functions/confirm-subscription).
// No depende de que el aviso (webhook) de Stripe haya llegado.
// Devuelve true si la cuenta quedó activa.
export async function confirmSubscription() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return false
    const { data, error } = await supabase.functions.invoke('confirm-subscription', {
      body: {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (error) return false
    return !!data?.active
  } catch { return false }
}

// Justo después de un pago exitoso: Stripe puede tardar un instante en
// marcar la factura como pagada, así que se reintenta unos segundos.
export async function confirmSubscriptionWithRetry(tries = 6, delayMs = 1500) {
  for (let i = 0; i < tries; i++) {
    if (await confirmSubscription()) return true
    await new Promise(r => setTimeout(r, delayMs))
  }
  return false
}
