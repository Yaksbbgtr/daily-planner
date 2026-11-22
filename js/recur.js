// Repeat rules: { f: daily|weekly|monthly|yearly|hebrew|yahrzeit, n, days, until, ex }
import { addDays, daysInMonth, diffDays, dow, startOfWeek } from './dates.js';

let hebrewMatch = () => false;
// jewish.js supplies this, so the rest of the rules stay free of the calendar library.
export function setHebrewMatcher(fn) { hebrewMatch = fn; }

export function startsOn(start, rule, day) {
  if (day === start) return !rule?.ex?.includes(day) && (!rule?.days?.length || rule.f !== 'weekly' || rule.days.includes(dow(day)));
  if (!rule || day < start) return false;
  if (rule.until && day > rule.until) return false;
  if (rule.ex?.includes(day)) return false;
  const n = rule.n || 1;
  const [sy, sm, sd] = start.split('-').map(Number);
  const [y, m, d] = day.split('-').map(Number);
  switch (rule.f) {
    case 'daily': return diffDays(start, day) % n === 0;
    case 'weekly': {
      const days = rule.days?.length ? rule.days : [dow(start)];
      return days.includes(dow(day)) && (diffDays(startOfWeek(start), startOfWeek(day)) / 7) % n === 0;
    }
    // The 31st falls on the last day of shorter months; Feb 29 on Feb 28.
    case 'monthly': return ((y - sy) * 12 + m - sm) % n === 0 && d === Math.min(sd, daysInMonth(y, m));
    case 'yearly': return (y - sy) % n === 0 && m === sm && d === Math.min(sd, daysInMonth(y, m));
    case 'hebrew':
    case 'yahrzeit': return hebrewMatch(start, day, rule.f);
    default: return false;
  }
}

// The start date of the occurrence covering `day`, or null.
export function occurrence(ev, day) {
  const span = ev.endDate && ev.endDate > ev.date ? diffDays(ev.date, ev.endDate) : 0;
  for (let back = 0; back <= span; back++) {
    const s = addDays(day, -back);
    if (startsOn(ev.date, ev.rule, s)) return s;
  }
  return null;
}

export function nextAfter(start, rule, after) {
  let d = addDays(after, 1);
  if (d < start) d = start;
  for (let i = 0; i < 366 * 9; i++, d = addDays(d, 1)) {
    if (rule.until && d > rule.until) return null;
    if (startsOn(start, rule, d)) return d;
  }
  return null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function describe(rule) {
  if (!rule) return '';
  const n = rule.n || 1;
  const every = (u) => (n === 1 ? `Every ${u}` : `Every ${n} ${u}s`);
  switch (rule.f) {
    case 'daily': return every('day');
    case 'weekly': {
      const d = [...(rule.days || [])].sort();
      if (n === 1 && d.join('') === '12345') return 'Every weekday';
      return every('week') + (d.length ? ' on ' + d.map((x) => DAYS[x]).join(', ') : '');
    }
    case 'monthly': return every('month');
    case 'yearly': return every('year');
    case 'hebrew': return 'Every Hebrew year';
    case 'yahrzeit': return 'Yahrzeit every year';
  }
  return '';
}
