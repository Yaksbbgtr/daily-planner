// Stands in for vendor/supabase.js in the browser test. Queries go to an in-memory Postgres with the real schema
// (tests/db.js) through window.__pg, as the signed-in test account. The test pushes live updates with __live().
(function () {
  const KEY = 'fake.session';
  const session = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const cbs = [], channels = [];
  const fire = (ev) => cbs.forEach((cb) => cb(ev, session()));
  const run = (op) => (navigator.onLine === false
    ? Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    : window.__pg(session()?.user || null, op));
  const thenable = (op) => ({ then: (a, b) => run(op).then(a, b) });
  function from(table) {
    const op = { kind: 'select', table, filters: [] };
    const b = {
      select(cols) { op.cols = cols; return b; },
      gt(c, v) { op.filters.push([c, '>', v]); return b; },
      order(c) { op.order = c; return b; },
      limit(n) { op.limit = n; return b; },
      maybeSingle() { op.single = true; return b; },
      upsert(row) { op.kind = 'upsert'; op.row = row; return b; },
      then(a, c) { return run(op).then(a, c); },
    };
    return b;
  }
  window.supabase = { createClient: () => ({
    auth: {
      onAuthStateChange(cb) { cbs.push(cb); setTimeout(() => cb('INITIAL_SESSION', session()), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithOAuth() {
        const u = JSON.parse(localStorage.getItem('fake.account') || 'null');
        localStorage.setItem(KEY, JSON.stringify({ user: u }));
        setTimeout(() => fire('SIGNED_IN'), 0);
        return { data: {}, error: null };
      },
      async signOut() { localStorage.removeItem(KEY); setTimeout(() => fire('SIGNED_OUT'), 0); return { error: null }; },
    },
    from,
    rpc: (fn, args) => thenable({ kind: 'rpc', fn, args }),
    channel() {
      const ch = { handlers: [], on(type, f, cb) { ch.handlers.push(cb); return ch; }, subscribe() { channels.push(ch); return ch; } };
      return ch;
    },
    removeChannel(ch) { channels.splice(channels.indexOf(ch), 1); },
  }) };
  window.__live = () => { if (navigator.onLine !== false) channels.forEach((ch) => ch.handlers.forEach((h) => h({}))); };
})();
