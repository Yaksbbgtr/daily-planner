// What happens on a given day, from Luach's own events and Apple Calendar.
import { all, settings } from './store.js';
import { occurrence } from './recur.js';
import { addDays, iso } from './dates.js';
import { apple } from './sync.js';

const hm = (s) => { const d = new Date(s * 1000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
let cache = { key: null, byDay: {} };

function appleByDay() {
  const a = apple();
  if (!a) return {};
  const hide = settings().hideCals;
  const key = a.updated + '|' + hide.join('|') + '|' + new Date().getTimezoneOffset();
  if (cache.key === key) return cache.byDay;
  const byDay = {};
  const add = (d, e) => (byDay[d] ||= []).push(e);
  for (const e of a.events) {
    if (hide.includes(e.cal)) continue;
    const base = { id: e.id, title: e.t || 'Untitled', cal: e.cal, color: e.color, loc: e.loc, apple: true };
    const from = e.day || iso(new Date(e.s * 1000));
    // An event ending exactly at midnight does not reach into the next day.
    const to = e.day ? (e.endDay || e.day) : iso(new Date(Math.max(e.s, e.e - 1) * 1000));
    for (let d = from, i = 0; d <= to && i < 370; d = addDays(d, 1), i++) {
      add(d, e.day || (d !== from && d !== to) ? { ...base } : { ...base, time: d === from ? hm(e.s) : null, end: d === to ? hm(e.e) : null, cont: d !== from });
    }
  }
  cache = { key, byDay };
  return byDay;
}

export function eventsOn(day) {
  const own = [];
  for (const ev of all('event')) {
    const s = occurrence(ev, day);
    if (!s) continue;
    const last = ev.endDate && ev.endDate > ev.date;
    own.push({ ...ev, occ: s, time: s === day ? ev.time : null, end: last && s === day ? null : ev.end, cont: s !== day });
  }
  return [...own, ...(appleByDay()[day] || [])].sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title));
}
export const tasksDue = (day) => all('task').filter((t) => !t.done && t.date === day);
export const taskSort = (a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || (a.date || '9').localeCompare(b.date || '9') || (a.time || '99').localeCompare(b.time || '99') || (a.made || 0) - (b.made || 0);
