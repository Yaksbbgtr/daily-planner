import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as D from '../js/dates.js';
import * as R from '../js/recur.js';
import { parse } from '../js/quickadd.js';
import { merge, same } from '../js/merge.js';

vm.runInThisContext(fs.readFileSync(new URL('../vendor/hebcal.js', import.meta.url), 'utf8') + ';globalThis.hebcal=hebcal;');
globalThis.localStorage = { m: new Map(), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, v); }, removeItem(k) { this.m.delete(k); } };
const store = await import('../js/store.js');
const J = await import('../js/jewish.js');

const T = '2026-11-22'; // a Sunday
const q = (s) => { const { title, date, time, end, kind } = parse(s, T); return [title, date, time, end, kind]; };

test('dates cross DST and month ends', () => {
  assert.equal(D.addDays('2026-10-31', 2), '2026-11-02');
  assert.equal(D.diffDays('2026-03-01', '2026-04-01'), 31);
  assert.equal(D.monthGrid('2026-11').length % 7, 0);
  assert.equal(D.monthGrid('2026-11')[0], '2026-11-01');
  assert.equal(D.monthGrid('2026-02').length, 28);
  assert.equal(D.addMonths('2026-12', 1), '2027-01');
});

test('quick add', () => {
  assert.deepEqual(q('Dentist tomorrow 3pm'), ['Dentist', '2026-11-23', '15:00', null, 'event']);
  assert.deepEqual(q('Meeting next Friday 3-4:30pm'), ['Meeting', '2026-12-04', '15:00', '16:30', 'event']);
  assert.deepEqual(q('Lunch 11-1pm friday'), ['Lunch', '2026-11-27', '11:00', '13:00', 'event']);
  assert.deepEqual(q('Buy milk'), ['Buy milk', null, null, null, 'task']);
  assert.deepEqual(q('Pay bill nov 30'), ['Pay bill', '2026-11-30', null, null, 'task']);
  assert.deepEqual(q('Pay bill 1/5'), ['Pay bill', '2027-01-05', null, null, 'task']);
  assert.deepEqual(q('Call at 4'), ['Call', T, '16:00', null, 'event']);
  assert.deepEqual(q('Shiur 8:30pm'), ['Shiur', T, '20:30', null, 'event']);
  assert.deepEqual(q('Renew passport in 2 weeks'), ['Renew passport', '2026-12-06', null, null, 'task']);
});
test('quick add leaves ordinary words alone', () => {
  for (const s of ['The cat sat down', 'Sun cream', 'May need glue', 'Read chapter 3', 'Order 2 pizzas', 'Fix bug #', 'Buy 5 apples'])
    assert.deepEqual(q(s), [s, null, null, null, 'task'], s);
  assert.equal(parse('Feb 30 report', T).date, null);
});
test('quick add repeats, stars and tags', () => {
  const p = parse('Trash every mon and thu #home !', T);
  assert.deepEqual([p.title, p.date, p.rule.days, p.tags, p.star], ['Trash', '2026-11-23', [1, 4], ['home'], true]);
  assert.deepEqual(parse('Vitamins every day', T).rule, { f: 'daily', n: 1 });
  assert.deepEqual(parse('Pay rent every month', T).rule, { f: 'monthly', n: 1 });
  assert.deepEqual(parse('Review every other week', T).rule, { f: 'weekly', n: 2 });
  assert.equal(parse('Minyan every weekday 7am', T).date, '2026-11-23');
  assert.deepEqual(parse('Trash every mon, thu 9pm', T).rule.days, [1, 4]);
});

test('repeat rules', () => {
  assert.ok(R.startsOn('2026-01-31', { f: 'monthly' }, '2026-02-28'));
  assert.ok(!R.startsOn('2026-01-31', { f: 'monthly' }, '2026-03-28'));
  assert.ok(R.startsOn('2024-02-29', { f: 'yearly' }, '2026-02-28'));
  assert.ok(R.startsOn('2026-11-22', { f: 'weekly', n: 2 }, '2026-12-06'));
  assert.ok(!R.startsOn('2026-11-22', { f: 'weekly', n: 2 }, '2026-11-29'));
  assert.ok(!R.startsOn('2026-11-22', { f: 'daily', until: '2026-11-25' }, '2026-11-26'));
  assert.ok(!R.startsOn('2026-11-22', { f: 'daily', ex: ['2026-11-24'] }, '2026-11-24'));
  assert.equal(R.occurrence({ date: '2026-11-22', endDate: '2026-11-24' }, '2026-11-24'), '2026-11-22');
  assert.equal(R.occurrence({ date: '2026-11-22', endDate: '2026-11-24' }, '2026-11-25'), null);
  assert.equal(R.nextAfter('2026-11-23', { f: 'weekly', days: [1, 4] }, '2026-11-23'), '2026-11-26');
  assert.equal(R.nextAfter('2026-11-23', { f: 'daily', until: '2026-11-23' }, '2026-11-23'), null);
});
test('Hebrew anniversaries', () => {
  // 12 Kislev 5787 -> 12 Kislev 5788
  const next = R.nextAfter(T, { f: 'hebrew' }, T);
  assert.equal(J.day(next).short, J.day(T).short);
  assert.equal(J.day(R.nextAfter(T, { f: 'yahrzeit' }, T)).short, J.day(T).short);
});

test('Jewish calendar', () => {
  assert.equal(J.day(T).full, 'י״ב כסלו תשפ״ז');
  assert.equal(J.zmanim(T), null);
  store.setSettings({ loc: J.cityLoc('New York') });
  const z = J.zmanim(T);
  assert.ok(z.every((x, i) => !i || x.at >= z[i - 1].at), 'zmanim in order');
  const fri = J.day('2026-11-27').items, sat = J.day('2026-11-28').items;
  assert.equal(J.formatTime(fri.find((x) => x.kind === 'candles').at), '4:12 PM');
  assert.match(sat.find((x) => x.kind === 'parsha').text, /Vayishlach/);
  assert.ok(sat.some((x) => x.kind === 'ends'));
  // Chanukah on a Friday: one candle-lighting line, and the holiday stays a holiday.
  const ch = J.day('2026-12-04').items;
  assert.equal(ch.filter((x) => x.kind === 'candles').length, 1);
  assert.ok(ch.some((x) => x.chanukah && x.kind !== 'candles'));
  assert.ok(J.isRestDay('2027-04-22'), 'first day of Pesach');
  assert.ok(J.isRestDay('2027-04-23'), 'second day outside Israel');
  assert.ok(J.day('2027-04-29').items.some((x) => x.kind === 'yomtov') && J.day('2027-04-29').items.filter((x) => x.kind === 'ends').length === 1);
  assert.ok(J.isRestDay('2027-10-11'), 'Yom Kippur');
  store.setSettings({ ends: 'min72' });
  assert.equal(J.day('2026-11-28').items.find((x) => x.kind === 'ends').text, 'Shabbos ends');
  store.setSettings({ ends: 'deg8.5', loc: J.cityLoc('Jerusalem') });
  assert.ok(!J.isRestDay('2027-04-23'), 'one day in Israel');
  for (const c of J.CITIES) assert.ok(J.cityLoc(c), c);
});
test('Hebrew date moves on at sunset', () => {
  store.setSettings({ loc: J.cityLoc('New York') });
  assert.equal(J.hebrewNow(new Date('2026-11-22T12:00:00-05:00')).night, false);
  const n = J.hebrewNow(new Date('2026-11-22T18:00:00-05:00'));
  assert.equal(n.night, true);
  assert.equal(n.full, 'י״ג כסלו תשפ״ז');
});

test('merge is order independent and keeps deletions', () => {
  const now = Date.now();
  const a = { x: { id: 'x', k: 'task', u: now, title: 'new' }, y: { id: 'y', k: 'task', u: now - 5, title: 'y' } };
  const b = { x: { id: 'x', k: 'task', u: now - 1, title: 'old' }, y: { id: 'y', k: 'task', u: now, del: 1 }, z: { id: 'z', k: 'note', u: 1 } };
  assert.ok(same(merge(a, b), merge(b, a)));
  assert.equal(merge(a, b).x.title, 'new');
  assert.equal(merge(a, b).y.del, 1);
  const t1 = { x: { id: 'x', k: 't', u: 5, a: 1 } }, t2 = { x: { id: 'x', k: 't', u: 5, a: 2 } };
  assert.ok(same(merge(t1, t2), merge(t2, t1)));
  assert.equal(Object.keys(merge({ q: { id: 'q', k: 't', u: 1, del: 1 } }, {})).length, 0);
  assert.equal(Object.keys(merge({ q: 'junk' }, {})).length, 0);
});
test('undo', () => {
  store.put({ id: 'u1', k: 'task', title: 'one' });
  const undo = store.change(() => { store.put({ ...store.get('u1'), title: 'two' }); store.put({ id: 'u2', k: 'task' }); });
  assert.equal(store.get('u1').title, 'two');
  undo();
  assert.equal(store.get('u1').title, 'one');
  assert.equal(store.get('u2'), null);
});

test('reminders ring at the right moment in the owner\'s time zone', async () => {
  const Rm = await import('../js/reminders.js');
  const tz = 'America/New_York', at = (d, t) => Rm.epoch(d, t, tz);
  assert.equal(new Date(at('2026-11-24', '09:00')).toISOString(), '2026-11-24T14:00:00.000Z');
  assert.equal(new Date(Rm.epoch('2026-07-01', '09:00', tz)).toISOString(), '2026-07-01T13:00:00.000Z');
  assert.equal(new Date(Rm.epoch('2026-11-24', '09:00', 'Asia/Jerusalem')).toISOString(), '2026-11-24T07:00:00.000Z');
  const recs = [
    { id: 'settings', k: 'settings', remEv: 15 },
    { id: 't1', k: 'task', title: 'Call bank', date: '2026-11-24', time: '14:00', done: null },
    { id: 't2', k: 'task', title: 'Groceries', date: '2026-11-24', done: null },
    { id: 't3', k: 'task', title: 'Done already', date: '2026-11-24', time: '15:00', done: 5 },
    { id: 't4', k: 'task', title: 'Early', date: '2026-11-24', time: '16:00', rem: 60 },
    { id: 'e1', k: 'event', title: 'Shiur', date: '2026-11-03', time: '20:30', rule: { f: 'weekly', n: 1 } },
    { id: 'e2', k: 'event', title: 'Quiet', date: '2026-11-24', time: '20:00', rem: -1 },
    { id: 'e3', k: 'event', title: 'Trip', date: '2026-11-24', endDate: '2026-11-26' },
    { id: 'gone', k: 'event', del: 1 },
  ];
  const apple = { events: [{ id: 'a1', t: 'Lunch', cal: 'Work', s: at('2026-11-24', '12:00') / 1000 }, { id: 'a2', t: 'Hidden', cal: 'Hidden', s: at('2026-11-24', '13:00') / 1000 }] };
  recs[0].hideCals = ['Hidden'];
  const got = Rm.due({ recs, apple, tz, from: at('2026-11-24', '00:00'), to: at('2026-11-25', '00:00') });
  assert.deepEqual(got.map((x) => [new Date(x.at).toISOString().slice(11, 16), x.title]), [
    ['13:00', 'Today: 1 all-day · 1 task'], ['16:45', 'Lunch'], ['19:00', 'Call bank'], ['20:00', 'Early'], ['01:15', 'Shiur']]);
  assert.match(got[0].body, /Trip, Groceries/);
  // Next week the weekly shiur rings again, with the same key never repeating.
  const next = Rm.due({ recs, tz, from: at('2026-12-01', '20:00'), to: at('2026-12-01', '20:30') });
  assert.deepEqual(next.map((x) => x.key), ['e:e1:2026-12-01:15']);
  assert.deepEqual(Rm.due({ recs: [{ id: 'settings', k: 'settings', remEv: -1, remDay: '' }, ...recs.slice(1)], tz, from: at('2026-11-24', '00:00'), to: at('2026-11-25', '00:00') }).map((x) => x.title), ['Call bank', 'Early']);
});

test('tefillin reminder before sunset unless done', async () => {
  const R = await import('../js/reminders.js');
  const sunset = Date.parse('2026-11-25T16:25:00-05:00');
  const recs = [{ id: 'tfplan', k: 'tfplan', days: { '2026-11-25': sunset } }];
  const win = { tz: 'America/New_York', from: sunset - 20 * 60000, to: sunset };
  const got = R.due({ recs, ...win });
  assert.equal(got.length, 1);
  assert.equal(got[0].at, sunset - 15 * 60000);
  assert.match(got[0].body, /4:25/);
  assert.equal(R.due({ recs: [...recs, { id: 'tf:2026-11-25', k: 'tefillin', day: '2026-11-25' }], ...win }).length, 0);
  assert.equal(R.due({ recs: [...recs, { id: 'settings', remTf: -1 }], ...win }).length, 0);
  assert.equal(R.due({ recs: [...recs, { id: 'settings', tfOff: true }], ...win }).length, 0);
});

test('what Claude sends back is checked before it is added', async () => {
  const { clean } = await import('../js/ai.js');
  const out = clean([
    { kind: 'event', title: ' Dentist ', date: '2026-11-31', time: '15:00', end: '25:00', star: 'yes', tags: ['#Health!'], notes: null },
    { title: '' },
    { kind: 'meeting', title: 'Call mom', date: '2026-11-27', time: null },
  ]);
  assert.deepEqual(out, [
    { kind: 'event', title: 'Dentist', date: null, time: '15:00', end: null, star: false, tags: ['health'], notes: '' },
    { kind: 'task', title: 'Call mom', date: '2026-11-27', time: null, end: null, star: false, tags: [], notes: '' },
  ]);
  assert.deepEqual(clean(null), []);
});
