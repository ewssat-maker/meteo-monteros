const CACHE_NAME = 'meteo-monteros-v3';

// Instala el Service Worker y fuerza a que tome el control inmediatamente
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Borra cualquier caché vieja que haya quedado de versiones anteriores
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia "Network First" (Primero Internet, luego Caché)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Si hay internet, descarga la última versión de GitHub y actualiza la caché silenciosamente
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, resClone);
        });
        return response;
      })
      .catch(() => {
        // Si estás desconectado o falla la red, muestra la última versión guardada en el celular
        return caches.match(e.request);
      })
  );
});
