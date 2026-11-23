import { supabase } from './supabase'
import { setPendingCheckout } from './confirmSubscription'

// Lleva al usuario a la página de pago de Stripe (Checkout), como hacen
// Spotify y otras apps. Devuelve { ok:false, error } si no se pudo iniciar
// (p. ej. la función aún no está desplegada) para que la pantalla use su
// formulario de tarjeta de respaldo; si todo sale bien redirige y no vuelve.
//   kind: 'subscription' | 'credits'   (credits requiere packageId)
export async function startCheckout(kind, packageId) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { ok: false, error: 'Inicia sesión de nuevo' }
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { kind, package_id: packageId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (error || data?.error || !data?.url) return { ok: false, error: data?.error ?? 'No se pudo abrir la página de pago' }
    if (kind === 'subscription') setPendingCheckout(data.session_id)
    window.location.assign(data.url)
    return { ok: true }
  } catch {
    return { ok: false, error: 'No se pudo abrir la página de pago' }
  }
}
