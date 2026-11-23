import { supabase } from './supabase'

// Pago en Stripe Checkout en curso: el id de la sesión se guarda al salir a
// pagar y se confirma al volver (incluso si el usuario cierra la app y la
// abre después). Se borra cuando ya quedó activa o la sesión expiró.
export const PENDING_CHECKOUT_KEY = 'pliego:pending_checkout'
export const getPendingCheckout = () => { try { return localStorage.getItem(PENDING_CHECKOUT_KEY) } catch { return null } }
export const setPendingCheckout = (id) => { try { localStorage.setItem(PENDING_CHECKOUT_KEY, id) } catch {} }
export const clearPendingCheckout = () => { try { localStorage.removeItem(PENDING_CHECKOUT_KEY) } catch {} }

// Pide al servidor que revise con Stripe si la mensualidad ya se cobró y,
// si es así, la active (ver supabase/functions/confirm-subscription).
// No depende de que el aviso (webhook) de Stripe haya llegado.
// Devuelve true si la cuenta quedó activa.
export async function confirmSubscription() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return false
    const sessionId = getPendingCheckout()
    const { data, error } = await supabase.functions.invoke('confirm-subscription', {
      body: sessionId ? { session_id: sessionId } : {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (error) return false
    if (data?.active || data?.expired) clearPendingCheckout()
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
