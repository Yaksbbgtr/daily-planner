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
  await mac.waitForSelector('.glancecard.sun');
  await add(mac, 'Dentist 3-4pm');
  await add(mac, 'Parent meeting sunday 8pm');
  await add(mac, 'Pay electric bill #home !');
  await add(mac, 'Buy challah today');
  await add(mac, 'Trash every mon and thu');
  await add(mac, '<img src=x onerror=alert(1)> today');
  assert.equal(await mac.locator('.timeline .block').count(), 1);
  assert.equal(await mac.locator('.today .task').count(), 2);
  assert.equal(await mac.locator('main img').count(), 0);
  // complete and undo
  await mac.click('.tick[aria-label="Buy challah today"], .tick[aria-label="Buy challah"]');
  assert.equal(await mac.locator('.anytime .task:not(.done)').count(), 1);
  await mac.click('#toast button');
  assert.equal(await mac.locator('.anytime .task:not(.done)').count(), 2);
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
  for (const d of ['2026-11-25', '2026-11-26', '2026-11-27']) { await mac.evaluate((d) => import('./js/views/today.js').then((m) => { m.st.day = d; dispatchEvent(new HashChangeEvent('hashchange')); }), d); await mac.waitForFunction((d) => document.querySelector('.habbtn')?.dataset.day === d, d); await mac.locator('.hab .habbtn').first().click(); }
  assert.match(await mac.textContent('.hab .meta'), /3 in a row/);
  await mac.screenshot({ path: shots + '/today-habits.png' });
  await mac.locator('.hab .habname').first().click(); await mac.waitForSelector('.hstats');
  assert.match(await mac.textContent('.hstats .nums'), /3\s*now\s*3\s*best run\s*3\s*total/);
  await mac.screenshot({ path: shots + '/habit-stats.png' });
  await mac.click('#sheet [data-close]');
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
  await mac.click('.timeline .block'); await mac.fill('#sheet [name=end]', '14:00'); await mac.click('#sheet .primary');
  assert.match(await mac.textContent('#sheet .err'), /not after/);
  await mac.fill('#sheet [name=end]', '16:30'); await mac.selectOption('#sheet [name=f]', 'weekly'); await mac.screenshot({ path: shots + '/event.png' });
  await mac.click('#sheet .primary');
  assert.match(await mac.textContent('.timeline .block'), /4:30 PM/);
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
  await mac.fill('#notesearch', '');
  // note folders
  await mac.click('.chip.add'); await mac.fill('#sheet [name=title]', 'Recipes'); await mac.click('#sheet .primary');
  await mac.waitForFunction(() => /Recipes/.test(document.querySelector('.chips.folders [aria-pressed=true]')?.textContent));
  assert.equal(await mac.locator('.note').count(), 0);
  await mac.click('[data-act=newNote]'); await mac.fill('#notetitle', 'Kugel');
  await mac.evaluate(() => { location.hash = '#/notes'; });
  await mac.waitForSelector('.note');
  assert.equal(await mac.locator('.note').count(), 1);
  await mac.click('.chips.folders [data-id=""]');
  assert.equal(await mac.locator('.note').count(), 2);
  await mac.screenshot({ path: shots + '/folders.png' });
  // projects with subtasks
  await mac.evaluate(() => { location.hash = '#/tasks/projects'; });
  await mac.click('[data-act=editProject]'); await mac.fill('#sheet [name=title]', 'Pesach cleaning'); await mac.click('#sheet .primary');
  await mac.waitForSelector('[data-proj]');
  for (const x of ['Kitchen', 'Car']) { await mac.fill('#newtask', x); await mac.press('#newtask', 'Enter'); }
  await mac.locator('.task .text', { hasText: 'Kitchen' }).click();
  for (const x of ['Oven', 'Fridge']) { await mac.fill('#sheet [data-newsub]', x); await mac.press('#sheet [data-newsub]', 'Enter'); }
  await mac.click('#sheet .primary');
  await mac.waitForSelector('li.steps');
  await mac.locator('[data-act=toggleStep]').first().click();
  assert.equal(await mac.locator('li.steps li.on').count(), 1);
  await mac.locator('.task .tick').last().click();
  assert.match(await mac.textContent('.bar .hint'), /1 of 2 done/);
  await mac.screenshot({ path: shots + '/project.png' });
  await mac.evaluate(() => { location.hash = '#/tasks/projects'; });
  assert.match(await mac.textContent('.tile.project'), /1 left of 2/);
  // daily checklist
  await mac.evaluate(() => { location.hash = '#/today'; });
  await mac.click('[data-act=sampleRoutine]');
  await mac.waitForSelector('.parts');
  await mac.click('.parts [data-part=morning]');
  assert.equal(await mac.locator('.cklist li').count(), 5);
  await mac.locator('.cklist .ck').first().click();
  assert.equal(await mac.locator('.cklist li.on').count(), 1);
  assert.match(await mac.textContent('.parts [data-part=morning]'), /1\/5/);
  await mac.click('[data-act=editRoutine][data-part=morning]'); await mac.fill('#sheet [name=title]', 'Stretch'); await mac.click('#sheet .primary');
  assert.equal(await mac.locator('.cklist li').count(), 6);
  await mac.locator('.checklist').screenshot({ path: shots + '/checklist.png' });
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
  await phone.waitForSelector('.timeline .block');
  assert.equal(await phone.inputValue('#journal'), 'A good day.');
  assert.match(await phone.textContent('main'), /Dentist/);
  await phone.evaluate(() => { location.hash = '#/tasks'; });
  await phone.fill('#newtask', 'From phone'); await phone.press('#newtask', 'Enter');
  await phone.clock.runFor(1500);
  await mac.evaluate(() => { location.hash = '#/tasks'; });
  await mac.clock.runFor(1500);
  await mac.waitForFunction(() => /From phone/.test(document.querySelector('main').textContent));
  // email to tasks: the setup sheet hands over a script with the key filled in
  await mac.evaluate(() => { location.hash = '#/settings'; });
  await mac.click('[data-act=mailSetup]'); await mac.waitForSelector('#mailscript');
  assert.match(await mac.inputValue('#mailscript'), /const KEY = "[0-9a-f]{64}";[\s\S]*rpc\/add_mail/);
  await mac.click('#sheet [data-close]');
  await mac.evaluate(() => { location.hash = '#/tasks'; }); await mac.waitForSelector('#newtask');
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
  // tab bar: the highlight sits on the current tab, and dragging along the bar switches tabs
  await phone.evaluate(() => { location.hash = '#/today'; }); await phone.waitForTimeout(600);
  const pillOn = (p) => p.evaluate(() => { const a = document.querySelector('#nav [aria-current]').getBoundingClientRect(), b = document.querySelector('#nav .pill').getBoundingClientRect(); return Math.abs(a.left - b.left) < 3 && Math.abs(a.width - b.width) < 3; });
  assert.ok(await pillOn(phone), 'highlight on Today');
  await phone.screenshot({ path: shots + '/p-dock.png', clip: { x: 0, y: 700, width: 390, height: 144 } });
  const tabAt = (n) => phone.evaluate((n) => { const r = document.querySelectorAll('#nav a')[n].getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, n);
  const [x0, y0] = await tabAt(0), [x3] = await tabAt(3);
  await phone.mouse.move(x0, y0); await phone.mouse.down();
  for (let i = 1; i <= 8; i++) await phone.mouse.move(x0 + ((x3 - x0) * i) / 8, y0);
  await phone.mouse.up();
  await phone.waitForFunction(() => location.hash === '#/lists');
  await phone.waitForTimeout(600);
  assert.ok(await pillOn(phone), 'highlight slid to Lists');
  await phone.click('#nav [data-tab=calendar]');
  await phone.waitForFunction(() => location.hash === '#/calendar');
  // swiping a task row right finishes it
  await phone.evaluate(() => { location.hash = '#/tasks'; }); await phone.waitForTimeout(100);
  const row = await phone.evaluate(() => { const li = [...document.querySelectorAll('li.task')].find((x) => /Fix shelf/.test(x.textContent)); li.scrollIntoView({ block: 'center' }); const r = li.getBoundingClientRect(); return [r.left + 60, r.top + r.height / 2]; });
  await phone.mouse.move(row[0], row[1]); await phone.mouse.down();
  for (let i = 1; i <= 10; i++) await phone.mouse.move(row[0] + i * 14, row[1]);
  await phone.mouse.up();
  await phone.waitForFunction(() => /Task done|Done/.test(document.querySelector('#toast')?.textContent || ''));
  assert.ok(await phone.evaluate(() => !document.querySelector('#sheet').open), 'a swipe is not a tap');
  // signing out keeps the data here
  await phone.evaluate(() => { location.hash = '#/settings'; });
  await phone.click('[data-act=signOut]');
  await phone.waitForSelector('[data-act=signIn]');
  await phone.evaluate(() => { location.hash = '#/tasks'; });
  assert.match(await phone.textContent('main'), /From phone/);
  // looks
  await mac.evaluate(() => { location.hash = '#/today'; }); await mac.waitForTimeout(50); await mac.screenshot({ path: shots + '/today.png' });
  await mac.click('.glancecard.sun'); await mac.waitForSelector('.zlist'); await mac.screenshot({ path: shots + '/zmanim.png' });
  // looks: each theme, on the phone
  await phone.evaluate(() => { location.hash = '#/today'; }); await phone.waitForTimeout(100);
  for (const t of ['dusk', 'daylight', 'gold', 'ocean']) {
    await phone.evaluate((t) => { location.hash = '#/settings'; }, t);
    await phone.click(`.themes input[value=${t}]`, { force: true });
    assert.equal(await phone.evaluate(() => document.documentElement.dataset.theme), t);
    await phone.evaluate(() => { location.hash = '#/today'; }); await phone.waitForTimeout(80);
    await phone.screenshot({ path: `${shots}/theme-${t}.png` });
  }
  await phone.evaluate(() => { location.hash = '#/settings'; }); await phone.click('.themes input[value=dusk]', { force: true });
  // your own colors, which reach the other device too
  await phone.click('.swatches input[name=accent][value="#0088ff"]', { force: true });
  await phone.click('.swatches input[name=bg][value="#ffffff"]', { force: true });
  assert.equal(await phone.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), '#0088ff');
  assert.equal(await phone.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)');
  await phone.evaluate(() => { location.hash = '#/today'; }); await phone.waitForTimeout(80);
  await phone.screenshot({ path: `${shots}/own-colors.png` });
  await phone.evaluate(() => { location.hash = '#/settings'; }); await phone.click('[data-act=resetColors]');
  assert.equal(await phone.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(5, 5, 5)');
  // plan the day, wrap it up, and the focus timer
  await mac.evaluate(() => { location.hash = '#/today'; });
  await mac.evaluate(() => import('./js/rituals.js').then((m) => m.planDay())); await mac.waitForSelector('#sheet[open]');
  await mac.screenshot({ path: shots + '/plan.png' });
  await mac.click('#sheet .primary');
  await mac.evaluate(() => import('./js/rituals.js').then((m) => m.wrapDay())); await mac.waitForSelector('#sheet[open]');
  await mac.screenshot({ path: shots + '/wrap.png' });
  await mac.click('#sheet .primary');
  await mac.evaluate(() => { location.hash = '#/tasks'; });
  await mac.locator('.task .text').first().click();
  await mac.click('#sheet [data-focus]');
  await mac.waitForSelector('#focus');
  await mac.click('#focus [data-len="5"]'); await mac.click('#focus [data-f=go]');
  await mac.clock.runFor(60000);
  assert.match(await mac.textContent('#focus .left'), /^4:0\d$/);
  await mac.screenshot({ path: shots + '/focus.png' });
  await mac.click('#focus [data-f=hide]');
  await mac.waitForSelector('#focuspill');
  await mac.clock.runFor(5 * 60000);
  await mac.waitForFunction(() => /Time is up/.test(document.querySelector('#toast')?.textContent));
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
