const CACHE_NAME = 'goatify-cache-v8-stable';
// No precacheamos '/' ni '/index.html' para evitar que usuarios vean builds antiguos después de cada deploy.
const urlsToCache = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
           if (cacheName !== CACHE_NAME) {
             return caches.delete(cacheName);
           }
        })
      );
    })
    .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (
    event.request.url.includes('firestore.googleapis.com') || 
    event.request.url.includes('identitytoolkit.googleapis.com') ||
    event.request.url.includes('csp.canva.com') ||
    event.request.url.includes('/api/')
  ) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => {
        return new Response('Goatify está sin conexión. Vuelve a intentar cuando tengas internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchRes) => {
        if (!fetchRes || fetchRes.status !== 200 || fetchRes.type !== 'basic') {
          return fetchRes;
        }
        const responseToCache = fetchRes.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return fetchRes;
      }).catch(() => {
        return new Response('', { status: 408, statusText: 'Request Timeout' });
      });
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Goatify', body: event.data.text() };
    }
  } else {
    data = { title: 'Goatify', body: 'Nueva actualización' };
  }

  let cleanTitle = data.title || 'Goatify';
  if (cleanTitle.includes('Goatify IA')) cleanTitle = 'Goatify';
  
  let cleanBody = data.body || data.text || 'Tienes una nueva actualización';
  const appNames = ['Goatify IA:', 'Goatify:', 'Goatify IA from Goatify'];
  appNames.forEach(name => {
    if (cleanBody.startsWith(name)) {
      cleanBody = cleanBody.replace(name, '').trim();
    }
  });

  const isCall = data.type === 'incoming_call' || (data.tag && data.tag.includes('call')) || (data.title && data.title.toLowerCase().includes('llamada'));

  const options = {
    body: cleanBody,
    icon: data.icon || 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747',
    badge: 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747',
    vibrate: isCall ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
    tag: data.tag || (isCall ? 'call-notification' : 'general-notification'),
    renotify: true,
    data: {
      url: data.url || data.link || '/',
      ...data.data
    },
    requireInteraction: true,
    priority: 'high',
    importance: 'high',
    visibility: 'public'
  };

  event.waitUntil(
    self.registration.showNotification(cleanTitle, options)
  );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    let targetUrl = event.notification.data.url || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus().then((focusedClient) => {
                        if (focusedClient && 'navigate' in focusedClient) return focusedClient.navigate(targetUrl);
                    });
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        })
    );
});