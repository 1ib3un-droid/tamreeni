/* تمريني — يشتغل بدون نت
   مهم: ميزانيتي والشاليه على نفس الموقع ويتشاركون مخزن الملفات،
   فهذا الملف ما يلمس إلا الملفات اللي اسمها يبدأ بـ "tamreeni-". */
const PREFIX = 'tamreeni-';
const CACHE = PREFIX + 'v5';
const SHELL = ['./', 'index.html', 'app.js', 'data.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];
const CDN = ['unpkg.com', 'www.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const cdn = CDN.includes(url.hostname);
  if (!same && !cdn) return; // Firebase و Open Food Facts و يوتيوب: من النت مباشرة
  // ملفات التطبيق: من النت أولاً وبدون انتظار النسخة المؤقتة (عشان التحديث يوصل على طول)، والمحفوظ احتياط بدون نت
  const net = same ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req);
  e.respondWith(
    net.then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.open(CACHE).then(c => c.match(req, { ignoreSearch: same }).then(r => r || (req.mode === 'navigate' ? c.match('index.html') : undefined))))
  );
});
