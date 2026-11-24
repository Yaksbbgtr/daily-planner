// Pictures and documents added to a project. The file itself stays on this device (IndexedDB) and, when signed in,
// goes to your own private folder in the cloud, so your other devices can open it too. The planner only keeps a
// small record of it (name, type, size, where it is), which syncs like everything else.
import * as store from './store.js';
import * as sync from './sync.js';

export const MAX = 25 * 1024 * 1024;
const BUCKET = 'files';
let dbp = null;
function db() {
  dbp ||= new Promise((ok, no) => {
    const r = indexedDB.open('planner-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
  return dbp;
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((ok, no) => {
    const tx = d.transaction('blobs', mode), req = fn(tx.objectStore('blobs'));
    tx.oncomplete = () => ok(req?.result);
    tx.onerror = tx.onabort = () => no(tx.error);
  });
}
const keep = (id, blob) => idb('readwrite', (s) => s.put(blob, id));
const local = (id) => idb('readonly', (s) => s.get(id)).catch(() => null);
const drop = (id) => idb('readwrite', (s) => s.delete(id)).catch(() => {});

export const filesOf = (pid) => store.all('file').filter((f) => f.proj === pid).sort((a, b) => a.made - b.made);
export const isImage = (f) => /^image\/(png|jpe?g|gif|webp|heic|heif|avif)$/i.test(f.type || '');
export const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const where = (f) => `${sync.state.user.id}/${f.id}`;

// Adds files to a project. Returns how many were too big.
export async function add(pid, list) {
  let big = 0;
  for (const file of list) {
    if (file.size > MAX) { big++; continue; }
    const id = store.uid();
    await keep(id, file);
    store.put({ id, k: 'file', proj: pid, made: Date.now(), name: (file.name || 'File').slice(0, 200), type: (file.type || '').slice(0, 100), size: file.size, path: null });
  }
  upload();
  return big;
}

// Sends files made on this device that are not in the cloud yet. Safe to call any time.
let busy = false;
export async function upload() {
  const sb = sync.client();
  if (!sb || busy) return;
  busy = true;
  try {
    for (const f of store.all('file').filter((x) => !x.path)) {
      const blob = await local(f.id);
      if (!blob) continue;
      const { error } = await sb.storage.from(BUCKET).upload(where(f), blob, { contentType: f.type || 'application/octet-stream', upsert: true });
      if (error) break;
      const now = store.get(f.id);
      if (now) store.change(() => store.put({ ...now, path: where(f) }), { quiet: true });
    }
  } catch { /* offline: tried again on the next sync */ }
  busy = false;
}

// The file's contents: from this device, or fetched from the cloud once and kept here.
export async function blob(f) {
  const have = await local(f.id);
  if (have) return have;
  const sb = sync.client();
  if (!sb || !f.path) return null;
  const { data, error } = await sb.storage.from(BUCKET).download(f.path);
  if (error || !data) return null;
  keep(f.id, data).catch(() => {});
  return data;
}
const urls = new Map();
export async function url(f) {
  if (urls.has(f.id)) return urls.get(f.id);
  const b = await blob(f);
  if (!b) return null;
  const u = URL.createObjectURL(b.type ? b : new Blob([b], { type: f.type }));
  urls.set(f.id, u);
  return u;
}

// The bytes go a little after the record, so Undo still has them.
export function purgeLater(list) {
  setTimeout(() => {
    const gone = list.filter((f) => !store.get(f.id));
    gone.forEach((f) => { drop(f.id); const u = urls.get(f.id); if (u) { URL.revokeObjectURL(u); urls.delete(f.id); } });
    const paths = gone.map((f) => f.path).filter(Boolean);
    if (paths.length) sync.client()?.storage.from(BUCKET).remove(paths).then(() => {}, () => {});
  }, 10000);
}
export function remove(f) {
  const undo = store.change(() => store.remove(f.id));
  purgeLater([f]);
  return undo;
}

// Fills in the thumbnails of a page that was just drawn.
export function hydrate(root) {
  root.querySelectorAll('img[data-file]').forEach(async (img) => {
    const f = store.get(img.dataset.file);
    const u = f && (await url(f));
    if (u && img.isConnected) { img.src = u; img.classList.add('ok'); }
    else if (img.isConnected) img.closest('.thumb')?.classList.add('missing');
  });
}
