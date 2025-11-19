const CACHE_NAME = 'blablacargo-v1';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/sender.html',
  '/courier.html',
  '/kurye-kayit.html',
  '/kurye-giris.html',
  '/confirm-delivery.html',
  '/manifest.json',
  '/images/icon-192.svg',
  '/images/icon-512.svg'
];

// 1. Install the service worker and cache the app shell
self.addEventListener('install', (event) => {
  console.log('Service Worker: Kuruluyor...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Uygulama kabuğu önbelleğe alınıyor...');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting(); // Force the new service worker to activate immediately
});

// 2. Activate the service worker and clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Aktif ediliyor...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('Service Worker: Eski önbellek siliniyor...', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// 3. Intercept fetch requests and serve from cache
self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Try to get the response from the cache
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        console.log('Service Worker: Önbellekten getiriliyor:', event.request.url);
        return cachedResponse;
      }

      // If not in cache, fetch from the network
      try {
        const networkResponse = await fetch(event.request);
        console.log('Service Worker: Ağdan getiriliyor:', event.request.url);
        // Don't cache API calls or websocket connections
        if (!event.request.url.includes('/shipments') && !event.request.url.includes('/couriers') && event.request.url.startsWith('http')) {
            console.log('Service Worker: Yanıt önbelleğe alınıyor:', event.request.url);
            cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        console.error('Service Worker: Ağdan getirme başarısız oldu:', error);
        // Optionally, return a fallback offline page here
      }
    })
  );
});
