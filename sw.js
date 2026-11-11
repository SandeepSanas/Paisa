// TradeBot service worker: makes the app installable, opens fast, shows an "update" prompt for new versions,
// and displays push notifications from the TradeBot server.
const VERSION = 'paisa-v19-3';
const SHELL = ['./', './index.html', './auth.js', './manifest.webmanifest', './logo-head.webp', './robot.webp', './aria.webp', './icon-192.png', './icon-512.png',
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
      e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; })
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

// push notifications (sent by the Paisa server through Firebase Cloud Messaging as data messages)
self.addEventListener('push', e => {
  let j = {}; try { j = e.data ? e.data.json() : {}; } catch (x) { j = { data: { title: 'TradeBot', body: e.data ? e.data.text() : '' } }; }
  const d = j.data || j.notification || j; const n = j.notification || {};
  const title = d.title || n.title || 'TradeBot', body = d.body || n.body || '', url = d.url || './#news', tag = d.tag || 'paisa';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const vis = cs.find(c => c.visibilityState === 'visible');
    if (vis) { vis.postMessage({ type: 'paisa-push', title, body, url, kind: d.kind || '' }); return; }   // app open in front: show a toast instead
    const quiet = d.silent === '1';   // BTC SWING at night: show it, but without sound or vibration
    return self.registration.showNotification(title, { body, tag, renotify: !quiet, silent: quiet, icon: './icon-192.png', badge: './favicon-32.png', data: { url }, vibrate: quiet ? [] : (d.kind === 'swing' ? [200, 80, 200, 80, 400] : [120, 60, 120]), requireInteraction: d.kind === 'swing' && !quiet });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || './#news';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'paisa-open', url }); return c.focus(); }
    return self.clients.openWindow(new URL(url, self.registration.scope).href);
  }));
});
