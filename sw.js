const CACHE = 'domino-v13';

const STATIC = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-1024.png',
];

const MANIFEST_CACHE = 'domino-manifest-v1';

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
  const url = new URL(e.request.url);
  if (url.pathname === '/manifest.json' || url.pathname.startsWith('/icons/')) {
    e.respondWith(cacheFirst(e.request));
  } else if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(e.request));
  } else {
    e.respondWith(networkFirst(e.request));
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
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

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(CACHE);
    cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response(JSON.stringify({error: 'offline'}), {status: 503});
  }
}
