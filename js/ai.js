// Claude, through the planner's own cloud function (supabase/functions/ai). The Anthropic key stays there.
import * as sync from './sync.js';
import * as D from './dates.js';

export const ready = () => !!sync.client();

// What you typed, as tasks and events: [{ kind, title, date, time, end, star, tags, notes }].
export async function plan(text) {
  const sb = sync.client();
  if (!sb) throw new Error('Sign in first (Settings > Sync) to use Claude.');
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const when = `${now.toLocaleDateString('en-US', { weekday: 'long' })} ${D.iso(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const { data, error } = await sb.functions.invoke('ai', { body: { text, now: when, tz } });
  if (error) {
    // The function says why in its reply, when it answered at all.
    const why = await error.context?.json?.().then((b) => b?.error, () => null);
    throw new Error(why || 'Claude is not set up yet.');
  }
  return clean(data?.items);
}

// Asks the function whether Claude is set up for this account.
export async function check() {
  const sb = sync.client();
  if (!sb) throw new Error('Sign in first.');
  const { error } = await sb.functions.invoke('ai', { body: { ping: true } });
  if (error) throw new Error((await error.context?.json?.().then((b) => b?.error, () => null)) || 'Claude is not set up yet.');
}

const hm = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
const day = (v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) && D.isRealDate(v) ? v : null);
// Never trust the shape of what comes back.
export function clean(items) {
  return (Array.isArray(items) ? items : []).slice(0, 30).map((x) => ({
    kind: x?.kind === 'event' ? 'event' : 'task',
    title: String(x?.title || '').trim().slice(0, 200),
    date: day(x?.date),
    time: hm(x?.time),
    end: hm(x?.end),
    star: x?.star === true,
    tags: (Array.isArray(x?.tags) ? x.tags : []).map((t) => String(t).toLowerCase().replace(/^#/, '').replace(/[^\p{L}\p{N}_-]/gu, '')).filter(Boolean).slice(0, 5),
    notes: String(x?.notes || '').slice(0, 2000),
  })).filter((x) => x.title);
}
