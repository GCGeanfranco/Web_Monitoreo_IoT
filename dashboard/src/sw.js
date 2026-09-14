// Service worker custom (estrategia injectManifest de vite-plugin-pwa).
// Se necesita este modo en vez del automático porque el automático no
// permite agregar listeners propios como 'push' y 'notificationclick'.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

self.skipWaiting()
cleanupOutdatedCaches()

// __WB_MANIFEST lo inyecta vite-plugin-pwa en build time con la lista de
// assets estáticos a precachear (JS, CSS, íconos, index.html).
precacheAndRoute(self.__WB_MANIFEST)

// Todas las llamadas a /api/ (lecturas, control, stream SSE) SIEMPRE van a
// la red, nunca a cache. Este es un dashboard de monitoreo en tiempo real:
// mostrar un dato viejo cacheado sería peor que mostrar un error de red.
registerRoute(
  ({ url }) => url.href.startsWith('https://web-monitoreo-iot.onrender.com/api/'),
  new NetworkOnly()
)

// ============================================================
//  PUSH NOTIFICATIONS — alarma de voltaje
// ============================================================

self.addEventListener('push', (event) => {
  let data
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Monitoreo IoT — Fundo Lopez', body: 'Nueva alerta del sistema' }
  }

  const titulo = data.title || 'Monitoreo IoT — Fundo Lopez'
  const opciones = {
    body: data.body || 'Nueva alerta del sistema',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    // "tag" agrupa notificaciones repetidas de la misma alarma en una sola,
    // en vez de apilar una notificación nueva cada vez que llega otra lectura.
    tag: data.tag || 'alerta-monitoreo-iot',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
  }

  event.waitUntil(self.registration.showNotification(titulo, opciones))
})

// Al tocar la notificación: si ya hay una pestaña/PWA abierta, la enfoca;
// si no, abre una nueva. Evita duplicar ventanas del dashboard.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})