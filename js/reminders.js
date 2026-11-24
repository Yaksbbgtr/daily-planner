// Which reminders are due, and when. The cloud job that sends notifications runs this same file, so what the app
// says will ring is what rings. It works in any time zone: dates and times in the planner are the owner's own.
import { addDays, time as clock } from './dates.js';
import { occurrence } from './recur.js';

// Minutes before. remDay is the time of the morning summary of the day's all-day things ('' for none).
export const DEFAULTS = { remEv: 10, remTask: 0, remDay: '08:00' };
export const LEADS = [[0, 'At the time'], [5, '5 min before'], [10, '10 min before'], [15, '15 min before'], [30, '30 min before'], [60, '1 hour before'], [120, '2 hours before'], [1440, '1 day before']];
export const leadName = (m) => (LEADS.find(([v]) => v === m)?.[1] || `${m} min before`);

const fmts = new Map();
function parts(ms, tz) {
  let f = fmts.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); fmts.set(tz, f); }
  const o = {};
  for (const p of f.formatToParts(ms)) o[p.type] = p.value;
  return o;
}
export const localDay = (ms, tz) => { const o = parts(ms, tz); return `${o.year}-${o.month}-${o.day}`; };
// A day and time on the owner's clock, as a moment.
export function epoch(day, hm, tz) {
  const [y, m, d] = day.split('-').map(Number), [h, mi] = hm.split(':').map(Number);
  const want = Date.UTC(y, m - 1, d, h, mi);
  const off = (ms) => { const o = parts(ms, tz); return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute) - Math.floor(ms / 60000) * 60000; };
  const first = want - off(want);
  return want - off(first);
}
// -1 means no reminder, on one item or as the default.
const lead = (rec, dflt) => { const m = Number.isFinite(rec.rem) ? rec.rem : +dflt; return Number.isFinite(m) && m >= 0 ? m : null; };
const before = (m) => (m === 0 ? 'Now' : m === 1440 ? 'Tomorrow' : m >= 60 && m % 60 === 0 ? `In ${m / 60} hour${m === 60 ? '' : 's'}` : `In ${m} min`);

// Everything that rings after `from` and up to `to` (ms). recs: the owner's records; apple: their Apple Calendar feed.
export function due({ recs, apple = null, tz, from, to }) {
  const settings = recs.find((r) => r.id === 'settings') || {};
  const s = { ...DEFAULTS, ...Object.fromEntries(Object.entries(settings).filter(([k, v]) => k in DEFAULTS && v !== undefined && v !== null)) };
  const hide = settings.hideCals || [];
  const out = [];
  const push = (key, at, title, body, tag) => { if (at > from && at <= to) out.push({ key, at, title, body, tag: tag || key, url: './#/today' }); };
  const first = localDay(from - 2 * 864e5, tz), last = localDay(to + 2 * 864e5, tz);
  const days = [];
  for (let d = first; d <= last && days.length < 10; d = addDays(d, 1)) days.push(d);
  const live = recs.filter((r) => !r.del);
  for (const t of live) {
    if (t.k !== 'task' || t.done || !t.date || !t.time) continue;
    const m = lead(t, s.remTask);
    if (m === null) continue;
    push(`t:${t.id}:${t.date}T${t.time}:${m}`, epoch(t.date, t.time, tz) - m * 60000, t.title || 'Task', `${before(m)} · ${clock(t.time)}`);
  }
  for (const e of live) {
    if (e.k !== 'event' || !e.time || !e.date) continue;
    const m = lead(e, s.remEv);
    if (m === null) continue;
    for (const d of days) {
      if (occurrence(e, d) !== d) continue;
      push(`e:${e.id}:${d}:${m}`, epoch(d, e.time, tz) - m * 60000, e.title || 'Event', [`${before(m)} · ${clock(e.time)}${e.end ? ' – ' + clock(e.end) : ''}`, e.loc].filter(Boolean).join(' · '));
    }
  }
  for (const e of apple?.events || []) {
    const m = lead({}, s.remEv);
    if (!e.s || hide.includes(e.cal) || m === null) continue;
    const at = e.s * 1000;
    const hm = (ms) => { const o = parts(ms, tz); return `${o.hour}:${o.minute}`; };
    push(`a:${e.id}:${m}`, at - m * 60000, e.t || 'Event', [`${before(m)} · ${clock(hm(at))}`, e.loc].filter(Boolean).join(' · '));
  }
  // One note in the morning for the day's things without a time.
  if (/^\d\d:\d\d$/.test(s.remDay || '')) {
    for (const d of days) {
      const at = epoch(d, s.remDay, tz);
      if (!(at > from && at <= to)) continue;
      const tasks = live.filter((t) => t.k === 'task' && !t.done && t.date === d && !t.time).map((t) => t.title);
      const events = live.filter((e) => e.k === 'event' && !e.time && occurrence(e, d) === d).map((e) => e.title);
      const ap = (apple?.events || []).filter((e) => e.day === d && !hide.includes(e.cal)).map((e) => e.t);
      const names = [...events, ...ap, ...tasks].filter(Boolean);
      if (!names.length) continue;
      const n = tasks.length, k = events.length + ap.length;
      const head = [k ? `${k} all-day` : '', n ? `${n} task${n === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
      push(`d:${d}:${s.remDay}`, at, `Today: ${head}`, names.slice(0, 6).join(', ') + (names.length > 6 ? ` and ${names.length - 6} more` : ''), 'day');
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
