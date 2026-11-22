// App-shell service worker: precaches the built app so it opens with no connection.
// API data is cached separately by the app itself (per signed-in user, cleared on sign-out).
const SHELL = ['/', '/index.html', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

async function precache() {
  const manifest = await fetch('/asset-manifest.json', { cache: 'no-store' }).then((r) => r.json());
  const cache = await caches.open(`gym-${manifest.version}`);
  await cache.addAll([...SHELL, ...manifest.files.filter((f) => !f.endsWith('.map') && f !== '/asset-manifest.json')]);
  return cache.name;
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const newest = names.filter((n) => n.startsWith('gym-')).sort().at(-1);
      await Promise.all(names.filter((n) => n !== newest).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    // Network first so updates arrive; fall back to the cached app.
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
