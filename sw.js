/* Offline cache. Bump VERSION when files change. */
const VERSION = 'psc-v4';
const FILES = ['./', 'index.html', 'forex.html', 'css/styles.css?v=4', 'js/common.js?v=4', 'js/crypto.js?v=4',
  'js/forex.js?v=4', 'js/instruments.js?v=4', 'js/rates.js?v=4', 'manifest.json', 'icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network-first for same-origin files (fresh updates), cache fallback offline. Rate API is not cached here.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request)));
});
