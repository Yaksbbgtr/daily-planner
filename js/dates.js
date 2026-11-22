// Dates are 'YYYY-MM-DD' strings in local time; times are 'HH:MM' (24 h).
const p2 = (n) => String(n).padStart(2, '0');

export const iso = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
// Noon, so adding days never trips over a daylight-saving change.
export function toDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
export function addDays(s, n) { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); }
export const dow = (s) => toDate(s).getDay();
export const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
export const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m is 1-12
export const startOfWeek = (s) => addDays(s, -dow(s));
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1, 12);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}
export function isRealDate(s) {
  return /^\d{4}-\d\d-\d\d$/.test(s || '') && iso(toDate(s)) === s;
}
export function monthGrid(ym) {
  const start = startOfWeek(ym + '-01');
  const next = addMonths(ym, 1) + '-01';
  const out = [];
  for (let d = start; d < next || out.length % 7; d = addDays(d, 1)) out.push(d);
  return out;
}

const fmt = (opts) => { const f = new Intl.DateTimeFormat('en-US', opts); return (s) => f.format(toDate(s)); };
export const weekday = fmt({ weekday: 'long' });
export const monthDay = fmt({ month: 'long', day: 'numeric' });
export const shortDay = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
export const shortDayYear = fmt({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const monthYear = fmt({ month: 'long', year: 'numeric' });

export function friendly(s, today = iso()) {
  const n = diffDays(today, s);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return weekday(s);
  return s.slice(0, 4) === today.slice(0, 4) ? shortDay(s) : shortDayYear(s);
}
export function time(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${p2(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
export function addMinutes(t, n) {
  const [h, m] = t.split(':').map(Number);
  const v = Math.min(h * 60 + m + n, 23 * 60 + 59);
  return `${p2(Math.floor(v / 60))}:${p2(v % 60)}`;
}
