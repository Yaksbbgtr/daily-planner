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
  const gists = {};
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  async function device(opts) {
    const c = await b.newContext({ timezoneId: 'America/New_York', serviceWorkers: 'block', ...opts });
    const p = await c.newPage();
    await p.clock.install({ time: new Date('2026-11-27T13:20:00-05:00') });
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await p.route('https://api.github.com/**', (r) => {
      const q = r.request(), m = q.method(), id = q.url().match(/gists\/(\w+)/)?.[1];
      const send = (status, body) => r.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
      if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      if (q.headers().authorization !== 'Bearer good') return send(401, {});
      if (m === 'GET' && !id) return send(200, Object.values(gists));
      if (m === 'POST') { const g = { id: 'g1', files: JSON.parse(q.postData()).files }; gists.g1 = g; return send(201, g); }
      if (m === 'PATCH') Object.assign(gists[id].files, JSON.parse(q.postData()).files);
      return gists[id] ? send(200, gists[id]) : send(404, {});
    });
    await p.goto(url);
    return p;
  }
  const add = async (p, text, kind) => {
    await p.click('#add'); await p.fill('#qa', text);
    if (kind) await p.click(`[data-kind=${kind}] >> nth=-1`);
    await p.click('#sheet .primary');
  };
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
  assert.equal(await mac.locator('.today .card > .rows .task').count(), 1);
  await mac.click('#toast button');
  assert.equal(await mac.locator('.today .card > .rows .task').count(), 2);
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
  assert.match(await night.evaluate(() => localStorage.getItem('luach.data')), /Friday text/);
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
  // sync
  await mac.evaluate(() => { location.hash = '#/settings'; });
  await mac.fill('#token', 'bad'); await mac.click('[data-submit=syncOn] button');
  await mac.waitForFunction(() => /did not accept/.test(document.querySelector('#syncmsg')?.textContent));
  await mac.fill('#token', 'good'); await mac.click('[data-submit=syncOn] button');
  await mac.waitForSelector('#syncline');
  await mac.waitForFunction(() => /Synced/.test(document.querySelector('#syncline').textContent));
  const noon = Math.floor(new Date('2026-11-27T12:00:00-05:00') / 1000);
  gists.g1.files['luach-apple.json'] = { content: JSON.stringify({ v: 1, updated: '2026-11-27T18:00:00Z', events: [
    { id: 'a1', t: 'Staff lunch', cal: 'Work', color: '#1badf8', s: noon, e: noon + 3600 }, { id: 'a2', t: 'Trip', cal: 'Family', color: 'red;x', day: '2026-11-26', endDay: '2026-11-28' }] }) };
  const phone = await device({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.evaluate(() => { location.hash = '#/settings'; });
  await phone.fill('#token', 'good'); await phone.click('[data-submit=syncOn] button');
  await phone.waitForSelector('[data-change=cal]');
  await phone.screenshot({ path: shots + '/p-settings.png' });
  await phone.evaluate(() => { location.hash = '#/today'; });
  await phone.waitForSelector('.event');
  assert.match(await phone.textContent('main'), /Staff lunch/); assert.match(await phone.textContent('main'), /Trip/);
  assert.equal(await phone.inputValue('#journal'), 'A good day.');
  for (const v of ['today', 'calendar', 'tasks', 'lists', 'notes', 'settings']) {
    await phone.evaluate((x) => { location.hash = '#/' + x; }, v);
    await phone.waitForTimeout(60);
    const o = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(o <= 0, `${v} overflows by ${o}`);
    await phone.screenshot({ path: `${shots}/p-${v}.png` });
  }
  await phone.click('#add'); await phone.fill('#qa', 'Shiur motzei shabbos tomorrow 8:30pm every week'); await phone.screenshot({ path: shots + '/p-add.png' });
  await phone.click('#sheet [data-close]');
  // a change on the phone reaches the Mac; both devices keep their edits
  await phone.evaluate(() => { location.hash = '#/tasks'; });
  await phone.fill('#newtask', 'From phone'); await phone.press('#newtask', 'Enter'); await phone.clock.runFor(3000);
  await phone.waitForTimeout(300);
  await mac.evaluate(() => { location.hash = '#/tasks'; });
  await mac.fill('#newtask', 'From mac'); await mac.press('#newtask', 'Enter');
  await mac.clock.runFor(3000); await mac.waitForTimeout(400);
  await mac.evaluate(() => document.activeElement.blur()); await mac.clock.runFor(50);
  assert.match(await mac.textContent('main'), /From phone/);
  assert.match(gists.g1.files['luach-sync.json'].content, /From mac/);
  // unreadable cloud data is never overwritten
  gists.g1.files['luach-sync.json'].content = '{broken';
  await mac.evaluate(() => { location.hash = '#/settings'; }); await mac.click('[data-act=syncNow]');
  await mac.waitForFunction(() => /unreadable/.test(document.querySelector('#syncline').textContent));
  assert.equal(gists.g1.files['luach-sync.json'].content, '{broken');
  // looks
  await mac.evaluate(() => { location.hash = '#/today'; }); await mac.waitForTimeout(50); await mac.click('#zmanim summary'); await mac.screenshot({ path: shots + '/today.png' });
  await mac.emulateMedia({ colorScheme: 'dark' }); await mac.screenshot({ path: shots + '/today-dark.png' });
  // offline through the service worker
  const c = await b.newContext(); const off = await c.newPage(); await off.goto(url);
  await off.evaluate(() => navigator.serviceWorker.ready); await off.reload(); await off.waitForSelector('.hero');
  await c.setOffline(true); await off.reload(); await off.waitForSelector('.hero');
  assert.deepEqual(errors, []);
  console.log('browser test passed');
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
