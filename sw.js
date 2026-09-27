// Network first, so a new deployment is picked up as soon as the phone is online;
// the cached copy keeps the carnet usable offline (metro, plane…).
const CACHE = 'civique-v1';
const CORE = ['./', 'index.html', 'styles.css', 'app.js', 'engine.js', 'data/questions.json', 'favicon.svg', 'manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(fetch(request)
    .then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match(request, { ignoreSearch: true })
      .then(cached => cached || (request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
