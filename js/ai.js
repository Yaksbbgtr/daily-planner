// Claude, through the planner's own cloud function (supabase/functions/ai). The Anthropic key stays there.
import * as sync from './sync.js';
import * as D from './dates.js';
import * as store from './store.js';
import * as J from './jewish.js';
import { eventsOn } from './agenda.js';

export const ready = () => !!sync.client();

const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const pad = (n) => String(n).padStart(2, '0');
function when() {
  const now = new Date();
  return `${now.toLocaleDateString('en-US', { weekday: 'long' })} ${D.iso(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
async function call(body) {
  const sb = sync.client();
  if (!sb) throw new Error('Sign in first (Settings > Sync) to use Claude.');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const { data, error } = await sb.functions.invoke('ai', { body: { ...body, now: when(), tz } });
  if (error) {
    // The function says why in its reply, when it answered at all.
    const why = await error.context?.json?.().then((b) => b?.error, () => null);
    throw new Error(why || 'Claude is not answering. Check your connection.');
  }
  return data || {};
}

// What you typed, as tasks and events: [{ kind, title, date, time, end, star, tags, notes }].
export async function plan(text) {
  return clean((await call({ text })).items);
}

// A task's steps (and about how long it takes): { steps: [..], minutes }.
export async function steps(t) {
  const proj = t.proj ? store.get(t.proj)?.title : null;
  const out = await call({ mode: 'steps', task: { title: t.title, notes: t.notes || '', project: proj || null, have: (t.checklist || []).map((x) => x.t) } });
  const list = (Array.isArray(out.steps) ? out.steps : []).map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 15);
  const m = Number.isInteger(out.minutes) && out.minutes > 0 && out.minutes <= 24 * 60 ? out.minutes : null;
  return { steps: list, minutes: m };
}

// A conversation with Claude about the whole planner. Returns { reply, actions } (actions are only proposed).
export async function assist(text, { history = [], focus = null } = {}) {
  const out = await call({ mode: 'assist', text, history, context: context(focus) });
  return { reply: String(out.reply || '').slice(0, 6000), actions: cleanActions(out.actions) };
}

// What Claude sees: open tasks, the next two weeks of events, projects, rest days, and what you have open.
export function context(focus = null, today = D.iso()) {
  const short = (t) => ({ id: t.id, title: t.title, date: t.date || null, time: t.time || null, dur: t.dur || null, star: !!t.star || undefined, proj: t.proj || undefined, tags: t.tags?.length ? t.tags : undefined, steps: t.checklist?.length ? t.checklist.map((x) => (x.on ? '✓ ' : '') + x.t) : undefined, repeats: t.rule ? true : undefined, progress: t.prog || undefined });
  const tasks = store.all('task').filter((t) => !t.done).sort((a, b) => (a.date || '9').localeCompare(b.date || '9')).slice(0, 300).map(short);
  const doneToday = store.all('task').filter((t) => t.done && D.iso(new Date(t.done)) === today).map((t) => t.title).slice(0, 50);
  const days = [];
  for (let i = -1; i < 14; i++) {
    const d = D.addDays(today, i);
    const evs = eventsOn(d).map((e) => ({ id: e.k === 'event' ? e.id : undefined, title: e.title, time: e.time || 'all day', end: e.end || undefined, apple: e.k === 'event' ? undefined : true }));
    const jewish = J.day(d).items.map((x) => x.text).filter(Boolean);
    days.push({ date: d, weekday: D.weekday(d), rest: J.isRestDay(d) || undefined, jewish: jewish.length ? jewish : undefined, events: evs });
  }
  const projects = store.all('project').filter((p) => !p.done).map((p) => ({ id: p.id, title: p.title, due: p.due || undefined }));
  let open = null;
  const f = focus && store.get(focus);
  if (f?.k === 'note') open = { kind: 'note', id: f.id, title: f.title, text: (f.body || '').slice(0, 20000) };
  else if (f?.k === 'project') open = { kind: 'project', ...projects.find((p) => p.id === f.id), notes: f.notes || undefined, tasks: store.all('task').filter((t) => t.proj === f.id).map((t) => ({ ...short(t), done: !!t.done })) };
  else if (f?.k === 'task') open = { kind: 'task', ...short(f), notes: f.notes || undefined };
  return { today, tasks, doneToday, days, projects, open };
}

// Only real ids, only sensible values, and nothing Claude may not touch.
export function cleanActions(list) {
  const out = [];
  for (const a of (Array.isArray(list) ? list : []).slice(0, 40)) {
    const op = ['add', 'update', 'done'].includes(a?.op) ? a.op : null;
    if (!op) continue;
    const cur = op === 'add' ? null : store.get(String(a.id || ''));
    if (op !== 'add' && (!cur || cur.del || !['task', 'event'].includes(cur.k))) continue;
    if (op === 'done' && cur.k !== 'task') continue;
    const kind = cur ? cur.k : a.kind === 'event' ? 'event' : 'task';
    const title = typeof a.title === 'string' ? a.title.trim().slice(0, 200) : null;
    if (op === 'add' && !title) continue;
    const proj = typeof a.proj === 'string' && store.get(a.proj)?.k === 'project' ? a.proj : null;
    out.push({
      op, id: cur?.id || null, kind, title,
      date: day(a.date), time: hm(a.time), end: kind === 'event' ? hm(a.end) : null,
      dur: Number.isInteger(a.dur) && a.dur > 0 && a.dur <= 1440 ? a.dur : null,
      star: typeof a.star === 'boolean' ? a.star : null,
      notes: typeof a.notes === 'string' ? a.notes.slice(0, 2000) : null,
      steps: Array.isArray(a.steps) ? a.steps.map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 15) : null,
      proj,
    });
  }
  return out;
}

// The records an action makes or changes.
export function apply(a, fallbackDay = D.iso()) {
  const steps = a.steps?.length ? a.steps.map((t) => ({ id: store.uid(), t, on: false })) : null;
  if (a.op === 'done') { const t = store.get(a.id); return { ...t, done: Date.now() }; }
  if (a.op === 'update') {
    const r = { ...store.get(a.id) };
    for (const k of ['title', 'date', 'time', 'dur', 'notes', 'proj']) if (a[k] !== null && a[k] !== undefined) r[k] = a[k];
    if (a.star !== null) r.star = a.star;
    if (r.k === 'event' && a.end) r.end = a.end;
    // An event moved to a new time keeps its length.
    const was = store.get(a.id);
    if (r.k === 'event' && a.time && !a.end && was.time && was.end) r.end = D.addMinutes(a.time, mins(was.end) - mins(was.time));
    if (steps) r.checklist = [...(r.checklist || []), ...steps];
    return r;
  }
  const id = store.uid(), made = Date.now();
  if (a.kind === 'event') return { id, k: 'event', made, title: a.title, date: a.date || fallbackDay, time: a.time, end: a.time ? a.end || D.addMinutes(a.time, a.dur || 60) : null, rule: null, color: '#ff8a5c', loc: '', notes: a.notes || '' };
  return { id, k: 'task', made, title: a.title, date: a.date || (a.time ? fallbackDay : null), time: a.time, dur: a.dur, rule: null, star: !!a.star, tags: [], notes: a.notes || '', checklist: steps || [], proj: a.proj, done: null };
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
