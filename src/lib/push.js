// Pliego · lib/push.js
// Registra el Service Worker y guarda la suscripción push en Supabase

import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Convertir base64url a Uint8Array para PushManager
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function registerPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'not_supported' }
  }

  try {
    // Registrar Service Worker
    const reg = await navigator.serviceWorker.register('/sw.js')

    // Timeout de 5s para que serviceWorker.ready no se cuelgue
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 5000))
    ])

    // Solicitar permiso
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: 'denied' }

    // Suscribirse al servidor push
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    const subJson = sub.toJSON()

    // Guardar en Supabase
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id:  userId,
      endpoint: subJson.endpoint,
      p256dh:   subJson.keys.p256dh,
      auth:     subJson.keys.auth,
    }, { onConflict: 'user_id,endpoint' })

    if (error) {
      console.error('Error guardando suscripción:', error)
      return { ok: false, reason: 'db_error' }
    }

    return { ok: true }
  } catch (e) {
    console.error('Error registrando push:', e)
    return { ok: false, reason: 'error', error: e }
  }
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

export function isStandalone() {
  return window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
}
