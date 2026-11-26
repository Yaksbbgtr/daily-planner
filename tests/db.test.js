import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { makeDb, user, as } from './db.js';

const db = await makeDb();
const a = await user(db, 'a@example.com'), b = await user(db, 'b@example.com');
const push = (u, rows) => as(db, u, 'select push($1::jsonb) as n', [JSON.stringify(rows)]).then((r) => r.rows[0].n);
const mine = (u) => as(db, u, 'select body, sv from records order by sv').then((r) => r.rows);

test('newest change wins', async () => {
  assert.equal(await push(a, [{ id: 't1', k: 'task', u: 10, title: 'one' }]), 1);
  assert.equal(await push(a, [{ id: 't1', k: 'task', u: 5, title: 'older' }]), 0);
  assert.equal(await push(a, [{ id: 't1', k: 'task', u: 20, title: 'two' }]), 1);
  assert.equal((await mine(a))[0].body.title, 'two');
});
test('people only see their own records', async () => {
  await push(b, [{ id: 't1', k: 'task', u: 1, title: 'b' }]);
  assert.deepEqual((await mine(b)).map((r) => r.body.title), ['b']);
  assert.deepEqual((await mine(a)).map((r) => r.body.title), ['two']);
  await assert.rejects(push(null, [{ id: 'x', k: 'task', u: 1 }]));
  await assert.rejects(as(db, a, "insert into records (id, u, body, sv) values ('z', 1, '{}', 1)"));
  await assert.rejects(as(db, a, "update records set body = '{}'"));
  assert.equal((await as(db, null, 'select count(*)::int as n from records').catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n, 0);
});
test('changed rows come back in order', async () => {
  const before = Math.max(...(await mine(a)).map((r) => +r.sv));
  await push(a, [{ id: 't2', k: 'task', u: 30 }, { id: 'bad' }, { id: 5, k: 'task', u: 1 }]);
  const after = (await as(db, a, 'select body from records where sv > $1 order by sv', [before])).rows;
  assert.deepEqual(after.map((r) => r.body.id), ['t2']);
});
test('the Mac key sends Apple events for its owner only', async () => {
  const key = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  await as(db, a, 'insert into feed_keys (key_hash) values ($1)', [hash]);
  await as(db, null, 'select put_apple($1, $2::jsonb)', [key, JSON.stringify({ v: 1, events: [{ id: 'e', t: 'Lunch' }] })]);
  assert.equal((await as(db, a, 'select data from apple')).rows[0].data.events[0].t, 'Lunch');
  assert.equal((await as(db, b, 'select count(*)::int as n from apple')).rows[0].n, 0);
  await assert.rejects(as(db, null, 'select put_apple($1, $2::jsonb)', ['wrong', '{"events":[]}']));
  assert.equal((await as(db, b, 'select count(*)::int as n from feed_keys')).rows[0].n, 0);
});
test('the email key turns emails into tasks once, for its owner only', async () => {
  const key = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  await as(db, a, 'insert into mail_keys (key_hash) values ($1)', [hash]);
  const mails = [{ id: 'm1', at: 100, title: 'Essay 2 due Friday', notes: 'From Prof', link: 'https://mail.google.com/mail/#all/m1', k: 'note', evil: 1 }, { id: 'bad id!', at: 1, title: 'x' }];
  assert.equal((await as(db, null, 'select add_mail($1, $2::jsonb) as n', [key, JSON.stringify(mails)])).rows[0].n, 1);
  assert.equal((await as(db, null, 'select add_mail($1, $2::jsonb) as n', [key, JSON.stringify(mails)])).rows[0].n, 0);
  const t = (await as(db, a, "select body from records where id = 'mail:m1'")).rows[0].body;
  assert.equal(t.k, 'task'); assert.equal(t.title, 'Essay 2 due Friday'); assert.deepEqual(t.tags, ['email']); assert.equal(t.evil, undefined);
  // a task deleted in the app stays deleted when the same email comes again
  await push(a, [{ id: 'mail:m1', k: 'task', u: 500, del: true }]);
  await as(db, null, 'select add_mail($1, $2::jsonb)', [key, JSON.stringify(mails)]);
  assert.equal((await as(db, a, "select body from records where id = 'mail:m1'")).rows[0].body.del, true);
  assert.equal((await as(db, b, "select count(*)::int as n from records where id like 'mail:%'")).rows[0].n, 0);
  await assert.rejects(as(db, null, 'select add_mail($1, $2::jsonb)', ['wrong', '[]']));
  // a second Gmail account gets its own key, and the first keeps working
  const key2 = crypto.randomBytes(32).toString('hex');
  await as(db, a, 'insert into mail_keys (key_hash) values ($1)', [crypto.createHash('sha256').update(key2).digest('hex')]);
  assert.equal((await as(db, null, 'select add_mail($1, $2::jsonb) as n', [key2, JSON.stringify([{ id: 'w1', at: 7, title: 'Action required: timesheet' }])])).rows[0].n, 1);
  assert.equal((await as(db, null, 'select add_mail($1, $2::jsonb) as n', [key, JSON.stringify([{ id: 'p2', at: 8, title: 'Homework 4 due Monday' }])])).rows[0].n, 1);
});
test('the widget key reads only its owner\'s plan', async () => {
  const key = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  await as(db, a, 'insert into widget_keys (key_hash) values ($1)', [hash]);
  const today = new Date().toISOString().slice(0, 10);
  await push(a, [{ id: 'w1', k: 'task', u: 900, title: 'Call mom', date: today, done: null, notes: 'secret' },
    { id: 'w2', k: 'task', u: 900, title: 'Done one', date: today, done: 5 },
    { id: 'w3', k: 'event', u: 900, title: 'Class', date: '2020-01-06', time: '18:00', rule: { f: 'weekly', days: [1] } },
    { id: 'w4', k: 'note', u: 900, title: 'Diary' }]);
  await push(b, [{ id: 'w5', k: 'task', u: 900, title: 'Not mine', date: today, done: null }]);
  const d = (await as(db, null, 'select widget_data($1) as d', [key])).rows[0].d;
  assert.deepEqual(d.tasks.map((t) => t.title), ['Call mom']);
  assert.equal(d.tasks[0].notes, undefined);
  assert.deepEqual(d.events.map((e) => e.title), ['Class']);
  assert.deepEqual(d.hide, []);
  await assert.rejects(as(db, null, 'select widget_data($1)', ['wrong']));
});
test('only emails that ask for something become tasks', async () => {
  const yes = [['Assignment 3: Literary Analysis', 'From Canvas'], ['Reminder: quiz tomorrow', ''], ['Hi', 'Please review the attached draft and send comments'],
    ['Week 5', 'The discussion post is due Sunday at 11:59pm'], ['Action required: complete your FAFSA', ''], ['Midterm review sheet', '']];
  const no = [['Your verification code is 123456', ''], ['Your order has shipped', ''], ['50% off everything this weekend', ''], ['Assignment 2 has been graded', ''],
    ['Lunch tomorrow?', 'Hey want to grab lunch'], ['Weekly newsletter', 'Assignments and more. Unsubscribe here'], ['Security alert', 'New sign-in on Mac'], ['Submission received: Essay 1', '']];
  const is = async (t, n) => (await as(db, null, 'select mail_is_task($1, $2) as ok', [t, n])).rows[0].ok;
  for (const [t, n] of yes) assert.equal(await is(t, n), true, t);
  for (const [t, n] of no) assert.equal(await is(t, n), false, t);
});
test('files and push addresses belong to their owner only', async () => {
  await as(db, a, "insert into storage.objects (bucket_id, name) values ('files', $1)", [a.id + '/f1']);
  await assert.rejects(as(db, a, "insert into storage.objects (bucket_id, name) values ('files', $1)", [b.id + '/f2']));
  assert.equal((await as(db, b, "select count(*)::int as n from storage.objects")).rows[0].n, 0);
  assert.equal((await as(db, a, "select count(*)::int as n from storage.objects")).rows[0].n, 1);
  const sub = { endpoint: 'https://push.example/1', keys: { p256dh: 'x', auth: 'y' } };
  await as(db, a, 'insert into push_subs (endpoint, sub, tz) values ($1, $2, $3)', [sub.endpoint, sub, 'America/New_York']);
  await assert.rejects(as(db, b, 'insert into push_subs (endpoint, user_id, sub) values ($1, $2, $3)', ['https://push.example/2', a.id, sub]));
  await assert.rejects(as(db, a, 'insert into push_subs (endpoint, sub) values ($1, $2)', ['http://insecure/1', sub]));
  assert.equal((await as(db, b, 'select count(*)::int as n from push_subs')).rows[0].n, 0);
  await assert.rejects(as(db, a, 'select * from push_sent'));
  await assert.rejects(as(db, a, 'select * from push_config'));
  await assert.rejects(as(db, a, "select remind_items($1, '2026-01-01', '2027-01-01')", [a.id]));
});
test('the reminder job gets settings, open tasks and events near the day', async () => {
  await push(a, [{ id: 'settings', k: 'settings', u: 1, remEv: 5 }, { id: 'r1', k: 'task', u: 1, date: '2026-11-24', time: '09:00', done: null },
    { id: 'r2', k: 'task', u: 1, date: '2026-11-24', done: 123 }, { id: 'r3', k: 'task', u: 1, date: '2026-12-30', done: null },
    { id: 'r4', k: 'event', u: 1, date: '2026-01-01', rule: { f: 'weekly' } }, { id: 'r5', k: 'event', u: 1, date: '2026-01-01', rule: null }, { id: 'r6', k: 'event', u: 1, date: '2026-11-23', time: '10:00' },
    { id: 'tfplan', k: 'tfplan', u: 1, days: {} }, { id: 'tf:2026-11-24', k: 'tefillin', u: 1, day: '2026-11-24' }, { id: 'tf:2026-10-01', k: 'tefillin', u: 1, day: '2026-10-01' }]);
  const ids = (await db.query("select remind_items($1, '2026-11-22', '2026-11-26') as b", [a.id])).rows.map((r) => r.b.id).filter((x) => /^(r\d|settings|tf)/.test(x)).sort();
  assert.deepEqual(ids, ['r1', 'r4', 'r6', 'settings', 'tf:2026-11-24', 'tfplan']);
});
