/* POS offline helper: keeps a copy of the POS app (pages, scripts, styles, fonts, pictures) so it can
   open without internet. Always tries the network first, so updates show right away when online.
   Only the app files (and the shop's GCash QR picture) are kept, never other /api data. */
const CACHE = 'matchea-pos-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const qrPic = url.pathname.startsWith('/api/public/qr/'); // the shop's GCash QR picture, to show it offline
  if (url.origin !== self.location.origin || (url.pathname.startsWith('/api/') && !qrPic) || url.pathname.startsWith('/sockjs') || url.pathname.includes('hot-update')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req.mode === 'navigate' ? '/pos' : req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await cache.match(req.mode === 'navigate' ? '/pos' : req);
      if (hit) return hit;
      throw err;
    }
  })());
});
