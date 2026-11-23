// Network first so a push shows up on the next open; the cache covers being offline.
const CACHE = 'planner-v1';
const FILES = ['./', 'style.css', 'manifest.webmanifest', 'vendor/hebcal.js', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png',
  'js/app.js', 'js/dates.js', 'js/recur.js', 'js/quickadd.js', 'js/merge.js', 'js/store.js', 'js/jewish.js', 'js/sync.js', 'js/ui.js', 'js/agenda.js', 'js/editors.js',
  'js/views/today.js', 'js/views/calendar.js', 'js/views/tasks.js', 'js/views/lists.js', 'js/views/notes.js', 'js/views/settings.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
// Only this app's caches: other apps share the same github.io origin.
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('planner-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(e.request.url, { cache: 'no-cache' }).then((r) => { if (r.ok) cache.put(e.request.url.split('#')[0], r.clone()); return r; });
    net.catch(() => {});
    const saved = () => cache.match(e.request, { ignoreSearch: true });
    try { return await Promise.race([net, new Promise((_, no) => setTimeout(no, 3000))]); }
    catch { return (await saved()) || net; }
  })());
});
