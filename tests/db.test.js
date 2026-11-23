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
