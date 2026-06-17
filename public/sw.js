// Pliego · Service Worker
// Maneja notificaciones push aunque la app esté cerrada

self.addEventListener('push', event => {
  if (!event.data) return

  const data = event.data.json()
  const title = data.title || 'Pliego'
  const options = {
    body:    data.body || '',
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    tag:     data.tag || 'pliego',
    data:    data.url || '/',
    vibrate: [200, 100, 200],
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si la app ya está abierta, enfocarla
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      // Si no está abierta, abrirla
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

// Activar inmediatamente sin esperar
self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))
