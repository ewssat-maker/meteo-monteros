// MetricPoint - Service Worker SOLO para avisos push (no guarda nada en caché ni intercepta pedidos:
// la app siempre se descarga de internet, así nunca muestra datos ni alertas viejas).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { titulo: 'MetricPoint', cuerpo: e.data ? e.data.text() : '' }; }
  const grave = d.nivel === 'rojo' || d.nivel === 'bordo';
  e.waitUntil(self.registration.showNotification(d.titulo || 'MetricPoint', {
    body: d.cuerpo || '',
    icon: 'logo.png',
    badge: 'logo.png',
    tag: d.tag || 'metricpoint',
    renotify: true,                       // vuelve a sonar aunque haya otra notificación con la misma etiqueta
    requireInteraction: grave,            // las graves quedan fijas hasta que se las toque
    vibrate: grave ? [600, 200, 600, 200, 600] : [250, 100, 250],
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus(); }
      return self.clients.openWindow(destino);
    })
  );
});
