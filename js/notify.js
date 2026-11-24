// Reminders as phone and computer notifications. Each device that turns them on gets its own push address, saved
// with your account; a job in the cloud checks every minute what is due and sends it (supabase/functions/remind).
// On iPhone this only works once Daily Planner is on the Home Screen and opened from there (iOS 16.4 or later).
import * as cfg from './config.js';
import * as sync from './sync.js';
import * as store from './store.js';

const KEY = cfg.PUSH || null;
export const supported = () => 'serviceWorker' in navigator && 'PushManager' in globalThis && 'Notification' in globalThis;
export const iphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
export const ready = () => !!KEY && sync.ready;
// What to show in Settings: 'on', 'off', 'blocked', 'install' (iPhone, not on the Home Screen yet) or 'unsupported'.
export function status() {
  if (!supported()) return iphone() && !standalone() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && store.local.get('push.on') ? 'on' : 'off';
}
const bytes = (b64) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const check = ({ error }) => { if (error) throw new Error(error.message); };

async function save(sub) {
  const sb = sync.client();
  if (!sb) throw new Error('Sign in first (Settings > Sync).');
  const j = sub.toJSON();
  check(await sb.from('push_subs').upsert({ endpoint: j.endpoint, user_id: sync.state.user.id, sub: j, tz: tz(), made: new Date().toISOString() }));
}
export async function turnOn() {
  if (!KEY) throw new Error('Reminders are not set up yet.');
  if (!sync.client()) throw new Error('Sign in first (Settings > Sync).');
  // Must be asked straight from the tap, or iPhone ignores it.
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked. Allow them in Settings for this app, then try again.' : 'Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(KEY) }));
  await save(sub);
  store.local.set('push.on', 1);
}
export async function turnOff() {
  store.local.set('push.on', null);
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const sb = sync.client();
  if (sb) await sb.from('push_subs').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
// Sends a notification to this account's devices right away.
export async function test() {
  const sb = sync.client();
  if (!sb) throw new Error('Sign in first.');
  const { data, error } = await sb.functions.invoke('remind', { body: { test: true } });
  if (error) throw new Error('The reminder service is not answering yet.');
  return data?.sent || 0;
}
// When the app opens: keep this device's address and time zone up to date (they can change).
export async function refresh() {
  if (status() !== 'on' || !sync.client()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await save(sub); else store.local.set('push.on', null);
  } catch { /* try again next time */ }
}
