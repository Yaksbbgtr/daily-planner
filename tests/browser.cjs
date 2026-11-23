// End-to-end check in Chromium with a fake GitHub. Usage: node tests/browser.cjs <playwright path> <screenshot dir>
const { chromium } = require(process.argv[2]);
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[3];
const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'text/plain' }); r.end(fs.readFileSync(p));
});
(async () => {
  await new Promise((f) => srv.listen(0, f));
  const url = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch();
  const errors = [];
  const { makeDb, user, as } = await import('./db.js');
  const db = await makeDb();
  const me = await user(db, 'me@example.com');
  const pages = [];
  // Runs what the fake client asks, the way the Supabase API would, then tells the other devices like Realtime does.
  async function pg(u, op) {
    try {
      let rows;
      if (op.kind === 'rpc') rows = (await as(db, u, `select ${op.fn === 'push' ? 'push($1::jsonb)' : 'x'}`, [JSON.stringify(op.args.rows)])).rows;
      else if (op.kind === 'upsert') rows = (await as(db, u, 'insert into feed_keys (user_id, key_hash) values ($1, $2) on conflict (user_id) do update set key_hash = excluded.key_hash', [op.row.user_id, op.row.key_hash])).rows;
      else if (op.table === 'records') rows = (await as(db, u, 'select body, sv from records where sv > $1 order by sv limit $2', [op.filters[0][2], op.limit])).rows;
      else if (op.table === 'apple') { rows = (await as(db, u, 'select data, updated::text from apple')).rows; return { data: rows[0] || null, error: null }; }
      if (op.kind !== 'select') setTimeout(live, 50);
      return { data: rows, error: null };
    } catch (e) { return { data: null, error: { message: e.message } }; }
  }
  const live = () => pages.forEach((p) => p.evaluate(() => window.__live?.()).catch(() => {}));
  async function device(opts) {
    const c = await b.newContext({ timezoneId: 'America/New_York', serviceWorkers: 'block', ...opts });
    const p = await c.newPage();
    await p.clock.install({ time: new Date('2026-11-27T13:20:00-05:00') });
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await c.route('**/vendor/supabase.js', (r) => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8') }));
    await c.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const CLOUD = { url: 'https://test.supabase.co', key: 'test' };" }));
    await c.exposeBinding('__pg', (src, u, op) => pg(u, op));
    await c.addInitScript((u) => localStorage.setItem('fake.account', JSON.stringify(u)), me);
    pages.push(p);
    await p.goto(url);
    return p;
  }
  const add = async (p, text, kind) => {
    await p.click('#add'); await p.fill('#qa', text);
    if (kind) await p.click(`[data-kind=${kind}] >> nth=-1`);
    await p.click('#sheet .primary');
  };
  // data saved under the old name carries over
  const old = await device({});
  await old.evaluate(() => { localStorage.clear(); localStorage.setItem('luach.data', JSON.stringify({ v: 1, recs: { x: { id: 'x', k: 'task', u: 1, title: 'Old task', date: null, done: null } } })); });
  await old.reload(); await old.evaluate(() => { location.hash = '#/tasks'; });
  assert.match(await old.textContent('main'), /Old task/);
  await old.evaluate(() => localStorage.clear()); await old.close();
  const mac = await device({ viewport: { width: 1280, height: 860 } });
  await mac.waitForSelector('.nudge');
  await mac.evaluate(() => { location.hash = '#/settings'; });
  await mac.selectOption('[data-change=city]', 'New York');
  await mac.evaluate(() => { location.hash = '#/today'; });
  await mac.waitForSelector('.sky');
  await add(mac, 'Dentist 3-4pm');
  await add(mac, 'Parent meeting sunday 8pm');
  await add(mac, 'Pay electric bill #home !');
  await add(mac, 'Buy challah today');
  await add(mac, 'Trash every mon and thu');
  await add(mac, '<img src=x onerror=alert(1)> today');
  assert.equal(await mac.locator('.event').count(), 1);
  assert.equal(await mac.locator('.today .task').count(), 2);
  assert.equal(await mac.locator('main img').count(), 0);
  // complete and undo
  await mac.click('.tick[aria-label="Buy challah today"], .tick[aria-label="Buy challah"]');
  assert.equal(await mac.locator('.today .tasks > .rows .task').count(), 1);
  await mac.click('#toast button');
  assert.equal(await mac.locator('.today .tasks > .rows .task').count(), 2);
  // repeating task moves on
  await mac.evaluate(() => { location.hash = '#/tasks'; });
  await mac.click('.tick[aria-label="Trash"]');
  assert.match(await mac.textContent('#toast'), /Next: (Thursday|Thu)/);
  await mac.fill('#newtask', 'Order seforim next week #school'); await mac.press('#newtask', 'Enter');
  await mac.fill('#newtask', 'Fix shelf #home'); await mac.press('#newtask', 'Enter');
  assert.equal(await mac.evaluate(() => document.activeElement.id), 'newtask');
  await mac.click('.tags [data-tag=home]');
  assert.equal(await mac.locator('.rows .task').count(), 2);
  await mac.click('.tags [data-tag=""]');
  await mac.screenshot({ path: shots + '/tasks.png' });
  // habit
  await mac.evaluate(() => { location.hash = '#/today'; });
  for (const h of ['Walk 20 minutes', 'Read']) { await mac.click('[data-act=editHabit]:not([data-id])'); await mac.fill('#sheet [name=title]', h); await mac.click('#sheet .primary'); }
  for (const i of [4, 5, 6]) await mac.locator('.habit').first().locator('.dots button').nth(i).click();
  assert.match(await mac.textContent('.habit .meta'), /3 in a row/);
  // journal saves while typing, survives reload
  await mac.fill('#journal', 'A good day.'); await mac.clock.runFor(700);
  await mac.reload(); await mac.waitForSelector('#journal');
  assert.equal(await mac.inputValue('#journal'), 'A good day.');
  // left focused past midnight, the journal starts a new page and keeps the old one
  const night = await device({ viewport: { width: 900, height: 700 } });
  await night.fill('#journal', 'Friday text'); await night.clock.fastForward('11:00:00'); await night.clock.runFor(61000);
  await night.waitForFunction(() => document.querySelector('#journal').dataset.day === '2026-11-28');
  assert.equal(await night.inputValue('#journal'), '');
  assert.match(await night.evaluate(() => localStorage.getItem('planner.data')), /Friday text/);
  // events: edit, repeat by Hebrew date, validation
  await mac.click('.event'); await mac.fill('#sheet [name=end]', '14:00'); await mac.click('#sheet .primary');
  assert.match(await mac.textContent('#sheet .err'), /not after/);
  await mac.fill('#sheet [name=end]', '16:30'); await mac.selectOption('#sheet [name=f]', 'weekly'); await mac.screenshot({ path: shots + '/event.png' });
  await mac.click('#sheet .primary');
  assert.match(await mac.textContent('.event'), /to 4:30 PM/);
  await mac.evaluate(() => { location.hash = '#/calendar'; });
  assert.equal(await mac.locator('.cell .pill', { hasText: 'Dentist' }).count() >= 1, true);
  await mac.click('[data-day="2026-12-04"]');
  assert.match(await mac.textContent('.daypane'), /Candle lighting 4:10/);
  await mac.click('.daypane .event'); await mac.click('[data-skip]');
  assert.equal(await mac.locator('.daypane .event').count(), 0);
  await mac.focus('.cell.sel'); await mac.keyboard.press('ArrowRight');
  assert.equal(await mac.getAttribute('.cell.sel', 'data-day'), '2026-12-05');
  await mac.screenshot({ path: shots + '/calendar.png' });
  await mac.click('[data-mode=list]'); await mac.screenshot({ path: shots + '/upcoming.png' });
  // lists
  await mac.evaluate(() => { location.hash = '#/lists'; });
  await mac.click('[data-act=renameList]'); await mac.fill('#sheet [name=title]', 'Shabbos shopping'); await mac.click('#sheet .primary');
  for (const x of ['Challah', 'Grape juice', 'דגים']) { await mac.fill('#newitem', x); await mac.press('#newitem', 'Enter'); }
  await mac.locator('.tick').first().click();
  assert.equal(await mac.locator('.task.done').count(), 1);
  await mac.screenshot({ path: shots + '/list.png' });
  // notes
  await mac.evaluate(() => { location.hash = '#/notes'; });
  await mac.click('[data-act=newNote]'); await mac.fill('#notetitle', 'Ideas'); await mac.fill('#notebody', 'First idea');
  await mac.evaluate(() => { location.hash = '#/notes'; });
  await mac.waitForSelector('.note');
  assert.match(await mac.textContent('.note'), /Ideas.*First idea/s);
  await mac.fill('#notesearch', 'zzz'); assert.equal(await mac.locator('.note').count(), 0);
  // sync: sign in, then a change on one device shows up on the other by itself
  await mac.evaluate(() => { location.hash = '#/settings'; });
  await mac.click('[data-act=signIn]');
  await mac.waitForFunction(() => /Synced/.test(document.querySelector('#syncline')?.textContent));
  assert.match(await mac.textContent('main'), /me@example\.com/);
  const phone = await device({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.evaluate(() => { location.hash = '#/settings'; });
  await phone.click('[data-act=signIn]');
  await phone.waitForFunction(() => /Synced/.test(document.querySelector('#syncline')?.textContent));
  await phone.evaluate(() => { location.hash = '#/today'; });
  await phone.waitForSelector('.event');
  assert.equal(await phone.inputValue('#journal'), 'A good day.');
  assert.match(await phone.textContent('main'), /Dentist/);
  await phone.evaluate(() => { location.hash = '#/tasks'; });
  await phone.fill('#newtask', 'From phone'); await phone.press('#newtask', 'Enter');
  await phone.clock.runFor(1500);
  await mac.evaluate(() => { location.hash = '#/tasks'; });
  await mac.clock.runFor(1500);
  await mac.waitForFunction(() => /From phone/.test(document.querySelector('main').textContent));
  // edits made offline go up when the connection is back, and the newest edit wins
  await mac.context().setOffline(true);
  await mac.fill('#newtask', 'Made offline'); await mac.press('#newtask', 'Enter');
  await mac.clock.runFor(1500);
  await mac.context().setOffline(false);
  await mac.evaluate(() => dispatchEvent(new Event('online')));
  await phone.waitForTimeout(300);
  await phone.clock.runFor(1500);
  await phone.waitForFunction(() => /Made offline/.test(document.querySelector('main').textContent));
  // Apple Calendar through the Mac key
  await phone.evaluate(() => { location.hash = '#/settings'; });
  await phone.click('[data-act=macKey]');
  const key = await phone.inputValue('#mackey');
  assert.match(key, /^[0-9a-f]{64}$/);
  await phone.click('#sheet [data-close]');
  const noon = Math.floor(new Date('2026-11-27T12:00:00-05:00') / 1000);
  await as(db, null, 'select put_apple($1, $2::jsonb)', [key, JSON.stringify({ v: 1, events: [
    { id: 'a1', t: 'Staff lunch', cal: 'Work', color: '#1badf8', s: noon, e: noon + 3600 }, { id: 'a2', t: 'Trip', cal: 'Family', color: 'red;x', day: '2026-11-26', endDay: '2026-11-28' }] })]);
  live(); await phone.waitForTimeout(200); await phone.clock.runFor(1000);
  await phone.waitForSelector('[data-change=cal]');
  await phone.screenshot({ path: shots + '/p-settings.png' });
  await phone.evaluate(() => { location.hash = '#/today'; });
  await phone.waitForSelector('.event');
  assert.match(await phone.textContent('main'), /Staff lunch/); assert.match(await phone.textContent('main'), /Trip/);
  for (const v of ['today', 'calendar', 'tasks', 'lists', 'notes', 'settings']) {
    await phone.evaluate((x) => { location.hash = '#/' + x; }, v);
    await phone.waitForTimeout(60);
    const o = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(o <= 0, `${v} overflows by ${o}`);
    await phone.screenshot({ path: `${shots}/p-${v}.png` });
  }
  await phone.click('#add'); await phone.fill('#qa', 'Shiur motzei shabbos tomorrow 8:30pm every week'); await phone.waitForTimeout(400); await phone.screenshot({ path: shots + '/p-add.png' });
  await phone.click('#sheet [data-close]');
  // signing out keeps the data here
  await phone.evaluate(() => { location.hash = '#/settings'; });
  await phone.click('[data-act=signOut]');
  await phone.waitForSelector('[data-act=signIn]');
  await phone.evaluate(() => { location.hash = '#/tasks'; });
  assert.match(await phone.textContent('main'), /From phone/);
  // looks
  await mac.evaluate(() => { location.hash = '#/today'; }); await mac.waitForTimeout(50); await mac.click('#zmanim summary'); await mac.screenshot({ path: shots + '/today.png' });
  await mac.emulateMedia({ colorScheme: 'dark' }); await mac.screenshot({ path: shots + '/today-dark.png' });
  // offline through the service worker
  const c = await b.newContext(); const off = await c.newPage(); await off.goto(url);
  await off.evaluate(() => navigator.serviceWorker.ready); await off.reload(); await off.waitForSelector('.hero');
  await c.setOffline(true); await off.reload(); await off.waitForSelector('.hero');
  // an open app reloads itself when a newer version goes live
  await off.close(); await c.close();
  const up = await device({});
  await up.route('**/?check=*', async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/app-version" content="[^"]+"/, 'app-version" content="newer"') }); });
  const nav = up.waitForEvent('framenavigated');
  await up.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await nav;
  await up.waitForSelector('.hero');
  assert.equal(await up.evaluate(() => sessionStorage.getItem('planner.reloadedFor')), 'newer');
  assert.deepEqual(errors, []);
  console.log('browser test passed');
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
