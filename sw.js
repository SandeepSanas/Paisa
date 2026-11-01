// Paisa service worker: makes the app installable, opens fast, and shows an "update" prompt for new versions.
const VERSION = 'paisa-v1';
const SHELL = ['./', './index.html', './auth.js', './manifest.webmanifest', './coin.svg', './icon-192.png', './icon-512.png',
  './maskable-192.png', './maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];
const LIBS = ['www.gstatic.com', 'unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL))); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // the app itself: network first so updates arrive, cache as fallback when offline
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('auth.js')) {
      e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    } else {
      e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { const c = n.clone(); caches.open(VERSION).then(x => x.put(req, c)); return n; })));
    }
    return;
  }
  // libraries and fonts: serve cached copy, refresh in the background
  if (LIBS.includes(url.hostname)) {
    e.respondWith(caches.open(VERSION).then(async c => { const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net; }));
  }
  // market data, Firebase and everything else: always live, never cached
});
