// Keeps this device and a secret GitHub gist in step.
import { merge, same, valid } from './merge.js';
import * as store from './store.js';

const FILE = 'luach-sync.json';
const APPLE = 'luach-apple.json';
const { local } = store;

export const state = { token: local.get('token'), gist: local.get('gist'), last: local.get('last', 0), busy: false, error: null };
let again = false, timer = null, onStatus = () => {};
export const watch = (f) => { onStatus = f; };

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch('https://api.github.com' + path, {
      ...opts, cache: 'no-store',
      headers: { Authorization: `Bearer ${state.token}`, Accept: 'application/vnd.github+json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch { throw new Error('Offline. Changes are saved here and will sync later.'); }
  if (res.ok) return res.json();
  const err = new Error(
    res.status === 401 ? 'GitHub did not accept the token. It may have expired.'
      : res.status === 403 || res.status === 429 ? 'GitHub refused the request. Check that the token has the “gist” box ticked, or try again in a few minutes.'
        : res.status === 404 ? 'The synced data could not be found with this token.' : `GitHub error ${res.status}.`);
  err.status = res.status;
  throw err;
}

async function findOrCreate() {
  for (let page = 1; page <= 10; page++) {
    const list = await api(`/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => g.files?.[FILE] || g.files?.[APPLE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  const g = await api('/gists', { method: 'POST', body: JSON.stringify({ description: 'Luach sync data', public: false, files: { [FILE]: { content: JSON.stringify({ v: 1, recs: store.everything() }) } } }) });
  return g.id;
}

async function readFile(f) {
  if (!f) return null;
  let text = f.content;
  if (f.truncated) {
    const res = await fetch(f.raw_url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not download the synced data.');
    text = await res.text();
  }
  // Never treat unreadable data as empty: the next upload would erase it.
  try { return JSON.parse(text); } catch { throw new Error('The synced data is unreadable, so nothing was uploaded.'); }
}

function takeApple(a) {
  if (!a || a.v !== 1 || !Array.isArray(a.events)) return false;
  if (a.updated === local.get('apple')?.updated) return false;
  local.set('apple', a);
  return true;
}

export async function syncNow() {
  if (!state.token) return;
  if (state.busy) { again = true; return; }
  state.busy = true; state.error = null; onStatus();
  let appleChanged = false;
  try {
    if (!state.gist) { state.gist = await findOrCreate(); local.set('gist', state.gist); }
    let g;
    try { g = await api(`/gists/${state.gist}`); }
    catch (e) {
      if (e.status !== 404) throw e;
      state.gist = await findOrCreate(); local.set('gist', state.gist);
      g = await api(`/gists/${state.gist}`);
    }
    const remote = await readFile(g.files[FILE]);
    if (remote && (remote.v !== 1 || !remote.recs || !Object.values(remote.recs).every(valid))) throw new Error('The synced data is from a different version of Luach. Reload the app and try again.');
    if (remote) store.absorb(remote.recs);
    // A problem with the Apple file must not stop the rest from syncing.
    try { appleChanged = takeApple(await readFile(g.files[APPLE])); } catch { /* keep the last good copy */ }
    const mine = merge(store.everything(), {});
    if (!remote || !same(mine, remote.recs)) {
      await api(`/gists/${state.gist}`, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify({ v: 1, recs: mine }) } } }) });
    }
    state.last = Date.now(); local.set('last', state.last);
  } catch (e) { state.error = e.message || 'Sync failed.'; }
  state.busy = false;
  onStatus(appleChanged);
  if (again) { again = false; syncNow(); }
}

export function soon(ms = 2500) {
  if (!state.token) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}
export async function connect(token) {
  state.token = token; state.gist = null;
  try { state.gist = await findOrCreate(); }
  catch (e) { state.token = null; throw e; }
  local.set('token', token); local.set('gist', state.gist);
  await syncNow();
}
export function disconnect() {
  clearTimeout(timer);
  Object.assign(state, { token: null, gist: null, last: 0, error: null });
  for (const k of ['token', 'gist', 'last']) local.set(k, null);
  onStatus();
}
export const apple = () => local.get('apple');
