/* تمريني — يشتغل بدون نت */
const CACHE = 'tamreeni-v2';
const SHELL = ['./', 'index.html', 'app.js', 'data.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];
const CDN = ['unpkg.com', 'www.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const cdn = CDN.includes(url.hostname);
  if (!same && !cdn) return; // Firebase و Open Food Facts و يوتيوب: من النت مباشرة
  // الشبكة أولاً لملفات التطبيق (عشان التحديثات توصل)، والكاش احتياط بدون نت
  e.respondWith(
    fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: same }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
