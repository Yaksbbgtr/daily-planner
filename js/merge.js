// Every record is { id, k: kind, u: last-changed ms, del?: 1, ...fields }.
// Newest change wins per record, so merging in any order gives the same result.
const KEEP_DELETED = 180 * 864e5;

const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

export const valid = (r) => !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.k === 'string' && Number.isFinite(r.u);

export function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.u !== b.u) return a.u > b.u ? a : b;
  return stable(a) >= stable(b) ? a : b;
}

export function merge(a, b, now = Date.now()) {
  const out = {};
  for (const id of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const r = newer(valid(a?.[id]) ? a[id] : null, valid(b?.[id]) ? b[id] : null);
    if (r && !(r.del && now - r.u > KEEP_DELETED)) out[id] = r;
  }
  return out;
}

export const same = (a, b) => stable(a) === stable(b);
