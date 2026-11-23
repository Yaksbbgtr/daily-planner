import { merge, valid } from './merge.js';

const KEY = 'planner.data';
export const local = {
  get(k, d = null) { try { const v = localStorage.getItem('planner.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { if (v === null) localStorage.removeItem('planner.' + k); else localStorage.setItem('planner.' + k, JSON.stringify(v)); return true; } catch { return false; } },
};

// Data saved before the rename to Daily Planner.
try {
  if (!localStorage.getItem(KEY) && localStorage.getItem('luach.data')) {
    for (const k of Object.keys(localStorage)) if (k.startsWith('luach.')) localStorage.setItem('planner.' + k.slice(6), localStorage.getItem(k));
  }
} catch { /* storage blocked */ }
let recs = load();
let txn = null;
const subs = new Set();
export const status = { saveFailed: false };

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return {}; }
  if (!raw) return {};
  try { const d = JSON.parse(raw); if (d.v === 1 && d.recs) return d.recs; throw 0; }
  catch { try { localStorage.setItem(KEY + '.damaged', raw); } catch { /* full */ } return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, recs })); status.saveFailed = false; }
  catch { status.saveFailed = true; }
}
const emit = (why) => subs.forEach((f) => f(why));
export const onChange = (f) => subs.add(f);

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 16);
export const get = (id) => (recs[id] && !recs[id].del ? recs[id] : null);
export const all = (k) => Object.values(recs).filter((r) => r.k === k && !r.del);
export const everything = () => recs;

function write(rec) {
  const prev = recs[rec.id];
  if (txn && !txn.has(rec.id)) txn.set(rec.id, prev && !prev.del ? prev : null);
  recs[rec.id] = { ...rec, u: Math.max(Date.now(), (prev?.u || 0) + 1) };
}
export function put(rec) { write(rec); if (!txn) { save(); emit('local'); } }
export function remove(id) {
  const r = recs[id];
  if (!r) return;
  write({ id, k: r.k, del: 1 });
  if (!txn) { save(); emit('local'); }
}
// Runs fn as one change and returns a function that undoes it.
export function change(fn, { quiet = false } = {}) {
  txn = new Map();
  let before;
  try { fn(); } finally { before = txn; txn = null; }
  save();
  emit(quiet ? 'quiet' : 'local');
  return () => change(() => { for (const [id, prev] of before) prev ? put(prev) : remove(id); });
}
export function absorb(remote) {
  const next = merge(recs, remote);
  const changed = JSON.stringify(Object.values(next).map((r) => [r.id, r.u]).sort()) !== JSON.stringify(Object.values(recs).map((r) => [r.id, r.u]).sort());
  recs = next;
  if (changed) { save(); emit('remote'); }
}
export function importBackup(data) {
  if (data?.app !== 'daily-planner' || !data.recs || !Object.values(data.recs).every(valid)) throw new Error('That file is not a Daily Planner backup.');
  absorb(data.recs);
}
// Another tab saved: fold its changes in.
if (typeof addEventListener === 'function') addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { absorb(JSON.parse(e.newValue).recs); } catch { /* ignore */ }
});

const DEFAULTS = { loc: null, candles: 18, ends: 'deg8.5', spelling: 'ashkenazi', hideCals: [] };
export const settings = () => ({ ...DEFAULTS, ...(get('settings') || {}) });
export const setSettings = (patch) => put({ ...settings(), ...patch, id: 'settings', k: 'settings' });
