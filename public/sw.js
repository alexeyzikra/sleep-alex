/**
 * Service Worker: офлайн-доступ после первого захода.
 *
 * Стратегия — stale-while-revalidate: сразу отдаём из кэша (приложение
 * открывается мгновенно и без сети), параллельно тянем свежую версию
 * в кэш на следующий запуск. Предкэш не делаем: имена файлов после
 * сборки хэшированные, и список пришлось бы генерировать.
 */

const CACHE = 'sleep-control-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putInCache(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  caches.open(CACHE).then((cache) => cache.put(request, response)).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Переходы по страницам: сеть, но с откатом на кэш при её отсутствии
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          putInCache(request, response.clone());
          return response;
        })
        .catch(() => caches.match(request)
          .then((cached) => cached || caches.match(new URL('./index.html', self.registration.scope).href)))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fromNetwork = fetch(request)
        .then((response) => {
          putInCache(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || fromNetwork;
    })
  );
});
