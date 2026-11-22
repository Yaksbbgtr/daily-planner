// Hebrew dates, holidays and zmanim, on top of vendor/hebcal.js (global `hebcal`).
import { addDays, iso, toDate } from './dates.js';
import { setHebrewMatcher } from './recur.js';
import { settings } from './store.js';

const H = () => globalThis.hebcal;

export const CITIES = ['Ashdod', 'Atlanta', 'Austin', 'Baltimore', 'Beer Sheva', 'Berlin', 'Boston', 'Buenos Aires', 'Chicago', 'Cleveland', 'Dallas', 'Denver', 'Detroit', 'Haifa', 'Houston', 'Jerusalem', 'Johannesburg', 'Las Vegas', 'London', 'Los Angeles', 'Melbourne', 'Mexico City', 'Miami', 'Montreal', 'New York', 'Paris', 'Petach Tikvah', 'Philadelphia', 'Phoenix', 'Pittsburgh', 'Providence', 'Saint Louis', 'San Diego', 'San Francisco', 'Seattle', 'Sydney', 'Tel Aviv', 'Toronto', 'Vancouver', 'Washington DC', 'Worcester'];

export function cityLoc(name) {
  const l = H().Location.lookup(name);
  return l && { name, lat: l.getLatitude(), lon: l.getLongitude(), tz: l.getTzid() };
}
function location() {
  const l = settings().loc;
  if (!l) return null;
  const il = l.tz === 'Asia/Jerusalem';
  return new (H().Location)(l.lat, l.lon, il, l.tz, l.name, il ? 'IL' : 'US');
}

const monthCache = new Map();
let sig = '';
function checkCache() {
  const s = settings();
  const now = JSON.stringify([s.loc, s.candles, s.ends, s.spelling]);
  if (now !== sig) { sig = now; monthCache.clear(); }
}

export function formatTime(d, withZone = true) {
  if (!d || isNaN(d)) return '';
  const tz = withZone ? settings().loc?.tz : undefined;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(d);
}

function monthEvents(ym) {
  checkCache();
  if (monthCache.has(ym)) return monthCache.get(ym);
  const s = settings(), loc = location(), f = H().flags;
  const [y, m] = ym.split('-').map(Number);
  const opts = {
    start: new Date(y, m - 1, 1), end: new Date(y, m, 0),
    sedrot: true, omer: true, noModern: true, il: s.loc?.tz === 'Asia/Jerusalem',
    ...(loc ? { location: loc, candlelighting: true, candleLightingMins: s.candles, ...(s.ends.startsWith('min') ? { havdalahMins: +s.ends.slice(3) } : { havdalahDeg: +s.ends.slice(3) }) } : {}),
  };
  const out = {};
  for (const e of H().HebrewCalendar.calendar(opts)) {
    const day = iso(e.getDate().greg());
    const fl = e.getFlags();
    const desc = e.getDesc();
    if (desc === 'Chag HaBanot') continue;
    let kind = 'minor', text = e.render(s.spelling), at = null;
    if (desc === 'Candle lighting' && e.eventTime) { kind = 'candles'; text = 'Candle lighting'; at = e.eventTime; }
    else if (desc === 'Havdalah' && e.eventTime) { kind = 'ends'; text = toDate(day).getDay() === 6 ? 'Shabbos ends' : 'Yom tov ends'; at = e.eventTime; if (s.spelling !== 'ashkenazi') text = text.replace('Shabbos', 'Shabbat'); }
    else if (/^Fast (begins|ends)$/.test(desc)) { kind = 'fast'; text = desc; at = e.eventTime; }
    else if (fl & f.PARSHA_HASHAVUA) kind = 'parsha';
    else if (fl & f.CHAG) kind = 'yomtov';
    else if (fl & (f.MAJOR_FAST | f.MINOR_FAST)) kind = 'fast';
    else if (fl & f.OMER_COUNT) { kind = 'omer'; text = `Omer ${e.omer}`; }
    if (/^Chanukah/.test(desc)) text = text.replace(/:\s*\d{1,2}:\d\d\s*[ap]m$/i, '');
    (out[day] ||= []).push({ text, kind, at, chanukah: /^Chanukah/.test(desc) });
  }
  monthCache.set(ym, out);
  return out;
}

// Without vowel points, which are hard to read at calendar-cell size.
export function day(d) {
  const hd = new (H().HDate)(toDate(d));
  const full = hd.renderGematriya(true);
  const parts = full.split(' ');
  return {
    full, dayNum: parts[0], short: parts.slice(0, -1).join(' '), first: hd.getDate() === 1,
    monthName: parts.slice(1, -1).join(' '),
    items: monthEvents(d.slice(0, 7))[d] || [],
  };
}
export const isRestDay = (d) => toDate(d).getDay() === 6 || (monthEvents(d.slice(0, 7))[d] || []).some((x) => x.kind === 'yomtov');
export const parshaFor = (d) => {
  const sat = addDays(d, 6 - toDate(d).getDay());
  return (monthEvents(sat.slice(0, 7))[sat] || []).find((x) => x.kind === 'parsha')?.text || null;
};

export function zmanim(d) {
  const loc = location();
  if (!loc) return null;
  const z = new (H().Zmanim)(loc, toDate(d), false);
  const list = [
    ['alos', 'Alos', z.alotHaShachar()],
    ['misheyakir', 'Misheyakir', z.misheyakir()],
    ['sunrise', 'Sunrise', z.sunrise()],
    ['shmaMga', 'Latest Shema (MGA)', z.sofZmanShmaMGA()],
    ['shma', 'Latest Shema (Gra)', z.sofZmanShma()],
    ['tfila', 'Latest Shacharis (Gra)', z.sofZmanTfilla()],
    ['chatzos', 'Chatzos', z.chatzot()],
    ['mincha', 'Mincha gedola', z.minchaGedola()],
    ['ketana', 'Mincha ketana', z.minchaKetana()],
    ['plag', 'Plag hamincha', z.plagHaMincha()],
    ['sunset', 'Sunset', z.sunset()],
    ['tzeis', 'Tzeis (8.5°)', z.tzeit(8.5)],
  ];
  return list.filter(([, , t]) => t && !isNaN(t)).map(([id, name, at]) => ({ id, name, at }));
}

// After sunset the Hebrew date is already tomorrow's.
export function hebrewNow(now = new Date()) {
  const today = iso(now);
  const set = zmanim(today)?.find((z) => z.id === 'sunset')?.at;
  const night = !!set && now > set;
  return { ...day(night ? addDays(today, 1) : today), night };
}

const annivCache = new Map();
setHebrewMatcher((start, d, kind) => {
  const year = new (H().HDate)(toDate(d)).getFullYear();
  const key = `${kind}|${start}|${year}`;
  if (!annivCache.has(key)) {
    const fn = kind === 'yahrzeit' ? 'getYahrzeit' : 'getBirthdayOrAnniversary';
    const hd = H().HebrewCalendar[fn](year, toDate(start));
    annivCache.set(key, hd ? iso(hd.greg()) : null);
  }
  return annivCache.get(key) === d;
});
