const CACHE = 'domino-v41';

const STATIC = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest-logo-domino.json',
  '/icons/logo-domino-32.png',
  '/icons/logo-domino-192.png',
  '/icons/logo-domino-512.png',
  '/icons/logo-domino-1024.png',
  '/icons/logo-domino.png',
];

const MANIFEST_CACHE = 'domino-manifest-v4';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== MANIFEST_CACHE).map(k => caches.delete(k)))),
      self.clients.claim()
    ])
  );
});

self.addEventListener('message', e => {
  if(e.data && e.data.action === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  // Only handle GET requests. POST/PUT/DELETE bypass service worker cache completely
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if (url.pathname.endsWith('.json') || url.pathname.startsWith('/icons/')) {
    e.respondWith(cacheFirst(e.request));
  } else {
    e.respondWith(staleWhileRevalidate(e.request, e));
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req, {ignoreSearch: true});
  if (cached) return cached;
  try {
    const res = await fetch(req);
    const cache = await caches.open(CACHE);
    cache.put(req, res.clone());
    return res;
  } catch {
    return new Response(JSON.stringify({error: 'offline'}), {status: 503});
  }
}

async function staleWhileRevalidate(req, event) {
  const cached = await caches.match(req, {ignoreSearch: true});
  const update = fetch(req, {cache: 'no-cache'}).then(async res => {
    if(res && res.ok){
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  }).catch(() => null);

  event.waitUntil(update);
  if(cached) return cached;
  const network = await update;
  return network || new Response(JSON.stringify({error: 'offline'}), {status: 503});
}
