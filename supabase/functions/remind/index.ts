// Sends reminder notifications. The scheduler calls this every minute (see supabase/setup-reminders.sh); it works
// out what is due for each person with reminders on, using the app's own js/reminders.js, and sends each thing once.
// A signed-in person can also call it with { test: true } to get a test notification on their devices.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
// A copy of the app's js/reminders.js (with dates.js and recur.js), put here by setup-reminders.sh.
import { due, localDay } from './lib/reminders.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

let config: Record<string, string> | null = null;
async function settings() {
  if (!config) {
    const { data, error } = await db.from('push_config').select('name,value');
    if (error) throw error;
    config = Object.fromEntries((data || []).map((r) => [r.name, r.value]));
    webpush.setVapidDetails('https://yaksbbgtr.github.io/daily-planner/', config.vapid_public, config.vapid_private);
  }
  return config;
}

type Sub = { endpoint: string; user_id: string; sub: webpush.PushSubscription; tz: string; made: string };
async function send(subs: Sub[], msg: Record<string, unknown>) {
  let sent = 0;
  for (const s of subs) {
    try { await webpush.sendNotification(s.sub, JSON.stringify(msg), { TTL: 900, urgency: 'high' }); sent++; }
    catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // The device turned notifications off or the address expired.
      if (code === 404 || code === 410) await db.from('push_subs').delete().eq('endpoint', s.endpoint);
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let cfg;
  try { cfg = await settings(); } catch { return reply({ error: 'not set up' }, 500); }
  const body = await req.json().catch(() => ({}));

  // A test from the app, by a signed-in person: only to their own devices.
  if (req.headers.get('x-cron-key') !== cfg.cron_key) {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    const { data } = await db.auth.getUser(jwt);
    if (!data?.user || !body.test) return reply({ error: 'not allowed' }, 401);
    const { data: subs } = await db.from('push_subs').select('*').eq('user_id', data.user.id);
    const sent = await send(subs || [], { title: 'Daily Planner', body: 'Reminders are working on this device.', tag: 'test', url: './#/settings' });
    return reply({ sent });
  }

  // Every minute: whatever came due in the last 10 minutes and was not sent yet (so a late or missed run catches up).
  const now = Date.now(), from = now - 10 * 60000;
  const { data: all } = await db.from('push_subs').select('*');
  const people = new Map<string, Sub[]>();
  for (const s of (all || []) as Sub[]) people.set(s.user_id, [...(people.get(s.user_id) || []), s]);
  let sent = 0;
  for (const [who, subs] of people) {
    try {
      const tz = [...subs].sort((a, b) => (a.made < b.made ? 1 : -1))[0].tz || 'UTC';
      const lo = localDay(now - 3 * 864e5, tz), hi = localDay(now + 3 * 864e5, tz);
      const [{ data: recs }, { data: apple }] = await Promise.all([
        db.rpc('remind_items', { who, lo, hi }),
        db.from('apple').select('data').eq('user_id', who).maybeSingle(),
      ]);
      for (const r of due({ recs: recs || [], apple: apple?.data || null, tz, from, to: now })) {
        const { data: fresh } = await db.from('push_sent').upsert({ user_id: who, key: r.key }, { onConflict: 'user_id,key', ignoreDuplicates: true }).select('key');
        if (!fresh?.length) continue;
        sent += await send(subs, { title: r.title, body: r.body, tag: r.tag, url: r.url });
      }
    } catch (e) { console.error(who, e); }
  }
  if (new Date(now).getUTCMinutes() === 0) await db.from('push_sent').delete().lt('made', new Date(now - 4 * 864e5).toISOString());
  return reply({ people: people.size, sent });
});
