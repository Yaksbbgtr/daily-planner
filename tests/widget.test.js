// Runs the phone widget script with a stand-in for the Scriptable app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { widgetScript } from '../widget/script.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function run(data, family, now) {
  const texts = [], files = {};
  let shown = null, sent = null;
  class Stack {
    constructor() { this.kids = []; }
    addText(s) { const t = { s, centerAlignText() {} }; texts.push(s); this.kids.push(t); return t; }
    addStack() { const k = new Stack(); this.kids.push(k); return k; }
    addImage() { return {}; } addSpacer() {} centerAlignContent() {} setPadding() {}
    async presentMedium() { shown = this; }
  }
  const env = {
    Color: class { constructor(c) { this.c = c; } }, Size: class {}, Font: Object.assign(class {}, new Proxy({}, { get: () => () => ({}) })),
    ListWidget: Stack, SFSymbol: { named: () => ({ image: {} }) },
    Request: class { async loadJSON() { sent = JSON.parse(this.body); if (data instanceof Error) throw data; return data; } },
    FileManager: { local: () => ({ joinPath: (a, b) => a + '/' + b, cacheDirectory: () => 'c', writeString: (f, s) => { files[f] = s; }, fileExists: (f) => f in files, readString: (f) => files[f] }) },
    config: { widgetFamily: family, runsInWidget: !!family }, Script: { setWidget: (w) => { shown = w; }, complete() {} },
  };
  env.Font = new Proxy(class { constructor(n, s) { this.n = n; } }, { get: (t, k) => (k in t ? t[k] : () => ({})) });
  const RealDate = Date;
  const FakeDate = class extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return +now; } };
  const code = widgetScript({ url: 'https://x.supabase.co', anon: 'anon', key: 'k'.repeat(64), app: 'https://app/' });
  const fn = new Function(...Object.keys(env), 'Date', `return (async () => {${code}\n})()`);
  await fn(...Object.values(env), FakeDate);
  return { texts, shown, sent };
}

test('the widget shows what is left of today', async () => {
  const now = new Date(2026, 10, 23, 15, 0); // Monday 3pm
  const day = iso(now);
  const at = (h) => Math.floor(new Date(2026, 10, 23, h).getTime() / 1000);
  const data = {
    tasks: [{ title: 'Call mom', date: day }, { title: 'Late one', date: '2026-11-20' }, { title: 'Starred', date: day, star: true }, { title: 'Tomorrow', date: '2026-11-24' }],
    events: [{ title: 'College Writing I', date: '2026-11-23', time: '18:00', end: '21:00', rule: { f: 'weekly', days: [1] } },
      { title: 'Not today', date: '2026-11-17', time: '09:00', rule: { f: 'weekly', days: [2] } }],
    apple: [{ t: 'Morning class', cal: 'Canvas', s: at(9), e: at(10) }, { t: 'Gym', cal: 'Home', s: at(16), e: at(17) },
      { t: 'Hidden', cal: 'Secret', s: at(16), e: at(17) }, { t: 'Holiday', cal: 'Canvas', day, endDay: day }],
    hide: ['Secret'],
  };
  const { texts, sent } = await run(data, 'large', now);
  assert.equal(sent.key, 'k'.repeat(64));
  const shown = texts.join('|');
  for (const s of ['College Writing I', '6pm', 'Gym', 'Holiday', 'Call mom', 'Late one', 'Starred']) assert.ok(shown.includes(s), s);
  for (const s of ['Morning class', 'Hidden', 'Not today', 'Tomorrow']) assert.ok(!shown.includes(s), s);
  assert.ok(shown.indexOf('Holiday') < shown.indexOf('Gym') && shown.indexOf('Gym') < shown.indexOf('College Writing I'));
  assert.ok(shown.indexOf('Starred') < shown.indexOf('Call mom'));
  for (const f of ['small', 'medium', 'accessoryRectangular', 'accessoryInline', 'accessoryCircular', null]) await run(data, f, now);
  const lock = await run(data, 'accessoryInline', now);
  assert.deepEqual(lock.texts, ['4pm Gym']);
});

test('the widget still draws when the planner cannot be reached', async () => {
  const { texts } = await run(new Error('offline'), 'medium', new Date(2026, 10, 23, 15, 0));
  assert.ok(texts.includes('Nothing else today'));
  assert.ok(texts.includes('Could not reach the planner'));
});
