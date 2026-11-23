// Keeps this device in step with the cloud: sign in with Google, and every change reaches the other devices within seconds.
import { CLOUD } from './config.js';
import * as store from './store.js';

const { local } = store;
export const ready = !!CLOUD;
export const state = { user: null, busy: false, error: null, last: local.get('last', 0) };
let sb = null, channel = null, timer = null, again = false, onStatus = () => {};
export const watch = (f) => { onStatus = f; };

// Records changed here that the cloud has not confirmed yet. Kept on disk so nothing is lost if the app closes first.
const dirty = new Set(local.get('dirty', []));
const saveDirty = () => local.set('dirty', [...dirty]);
store.onWrite((id) => { dirty.add(id); saveDirty(); });

export function init() {
  if (!CLOUD || !globalThis.supabase?.createClient) return;
  sb = globalThis.supabase.createClient(CLOUD.url, CLOUD.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'planner.auth' },
  });
  sb.auth.onAuthStateChange((event, session) => {
    const u = session?.user || null;
    const changed = u?.id !== state.user?.id;
    state.user = u;
    // Supabase asks that its own calls not be made from inside this callback.
    setTimeout(() => {
      if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
      if (changed) {
        if (u) {
          // First time this account is used here: send everything already on the device.
          if (local.get('owner') !== u.id) {
            Object.keys(store.everything()).forEach((id) => dirty.add(id));
            saveDirty();
            local.set('owner', u.id);
            local.set('sv', 0);
          }
          listen();
          syncNow();
        } else stopListening();
      }
      onStatus(false);
    }, 0);
  });
}

function listen() {
  stopListening();
  const f = { schema: 'public', filter: `user_id=eq.${state.user.id}` };
  channel = sb.channel('planner-' + state.user.id)
    .on('postgres_changes', { event: '*', table: 'records', ...f }, () => soon(300))
    .on('postgres_changes', { event: '*', table: 'apple', ...f }, () => soon(300))
    .subscribe();
}
function stopListening() { if (channel) { sb.removeChannel(channel); channel = null; } }

const check = ({ data, error }) => {
  if (error) throw new Error(/fetch|network/i.test(error.message) ? 'Offline. Changes are saved here and will sync later.' : error.message);
  return data;
};

export async function syncNow() {
  if (!sb || !state.user) return;
  if (state.busy) { again = true; return; }
  state.busy = true; state.error = null; onStatus(false);
  let appleChanged = false;
  try {
    // Send what changed here.
    const recs = store.everything();
    const ids = [...dirty].filter((id) => recs[id]);
    for (let i = 0; i < ids.length; i += 500) {
      const rows = ids.slice(i, i + 500).map((id) => recs[id]);
      check(await sb.rpc('push', { rows }));
      for (const r of rows) if (store.everything()[r.id]?.u === r.u) dirty.delete(r.id);
    }
    [...dirty].filter((id) => !store.everything()[id]).forEach((id) => dirty.delete(id));
    saveDirty();
    // Then fetch what changed elsewhere since last time.
    let sv = local.get('sv', 0);
    for (;;) {
      const rows = check(await sb.from('records').select('body,sv').gt('sv', sv).order('sv').limit(1000));
      if (!rows.length) break;
      store.absorb(Object.fromEntries(rows.map((r) => [r.body.id, r.body])));
      sv = Math.max(sv, ...rows.map((r) => +r.sv));
      local.set('sv', sv);
      if (rows.length < 1000) break;
    }
    const a = check(await sb.from('apple').select('data,updated').maybeSingle());
    if (a && a.updated !== local.get('apple')?.updated && Array.isArray(a.data?.events)) {
      local.set('apple', { ...a.data, updated: a.updated });
      appleChanged = true;
    }
    state.last = Date.now(); local.set('last', state.last);
  } catch (e) { state.error = e.message || 'Sync failed.'; }
  state.busy = false;
  onStatus(appleChanged);
  if (again) { again = false; syncNow(); }
}

export function soon(ms = 1200) {
  if (!sb || !state.user) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

export async function signIn() {
  if (!sb) return;
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } });
  if (error) throw new Error(error.message);
}
export async function signOut() {
  if (!sb) return;
  clearTimeout(timer);
  await sb.auth.signOut();
}

// A key for the Mac helper. Only its hash is stored, so the key is shown once.
async function makeKey(table, many = false) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  check(await (many ? sb.from(table).insert({ user_id: state.user.id, key_hash: hash }) : sb.from(table).upsert({ user_id: state.user.id, key_hash: hash })));
  return key;
}
export const makeMacKey = () => makeKey('feed_keys');
export const makeMailKey = () => makeKey('mail_keys', true);
export const apple = () => local.get('apple');
