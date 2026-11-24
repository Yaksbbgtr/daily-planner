// Network first so a push shows up on the next open; the cache covers being offline.
const CACHE = 'planner-2026.11.24-1'; // match app-version in index.html
const FILES = ['./', 'style.css', 'manifest.webmanifest', 'vendor/hebcal.js', 'vendor/supabase.js', 'js/config.js', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png',
  'js/app.js', 'js/dates.js', 'js/recur.js', 'js/quickadd.js', 'js/merge.js', 'js/store.js', 'js/jewish.js', 'js/sync.js', 'js/ui.js', 'js/agenda.js', 'js/editors.js',
  'js/views/today.js', 'js/emoji.js', 'js/glyphs.js', 'mail/script.js', 'widget/script.js', 'js/focus.js', 'js/checklist.js', 'js/rituals.js', 'js/views/calendar.js', 'js/views/tasks.js', 'js/views/lists.js', 'js/views/notes.js', 'js/views/settings.js', 'js/files.js', 'js/reminders.js', 'js/notify.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
// Only this app's caches: other apps share the same github.io origin.
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('planner-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(e.request.url, { cache: 'no-cache' }).then((r) => { if (r.ok) cache.put(u.origin + u.pathname, r.clone()); return r; });
    net.catch(() => {});
    const saved = () => cache.match(e.request, { ignoreSearch: true });
    // Wait for the network while online, even on a slow connection, so a fresh version is never hidden behind the cache.
    try { return await Promise.race([net, new Promise((_, no) => setTimeout(no, navigator.onLine ? 12000 : 0))]); }
    catch { return (await saved()) || net; }
  })());
});

// Reminders sent by the cloud (supabase/functions/remind).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data?.json() || {}; } catch { d = { body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Daily Planner', { body: d.body || '', tag: d.tag || undefined, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (c.url.startsWith(self.registration.scope)) { try { await c.navigate(url); } catch { /* same page */ } return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
