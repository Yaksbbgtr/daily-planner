// The Home Screen and Lock Screen widget for iPhone. It runs in the free Scriptable app, which can
// draw widgets from a script. The app fills in a read-only key and hands you a ready copy:
// Settings > Phone widget.
export function widgetScript({ url, anon, key, app }) {
  return `// Daily Planner widget. Shows today's schedule and tasks. Tap it to open the planner.
// Works in every Home Screen size and on the Lock Screen.
const PLANNER = ${JSON.stringify(url)};
const ANON = ${JSON.stringify(anon)};
const KEY = ${JSON.stringify(key)};
const APP = ${JSON.stringify(app)};

const BG = new Color('#050505'), INK = new Color('#f5f5f5'), SOFT = new Color('#a8a8a8'), LINE = new Color('#2a2a2a');
const p2 = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
const dow = (s) => toDate(s).getDay();
const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
const dim = (y, m) => new Date(y, m, 0).getDate();
const hm = (secs) => { const d = new Date(secs * 1000); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
const clock = (t) => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const pm = h >= 12; h = h % 12 || 12; return h + (m ? ':' + p2(m) : '') + (pm ? 'pm' : 'am'); };
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// The same repeat rules as the planner (Hebrew-date repeats are left to the app).
function startsOn(start, rule, day) {
  if (day === start) return !(rule && rule.ex || []).includes(day) && (!(rule && rule.days && rule.days.length) || rule.f !== 'weekly' || rule.days.includes(dow(day)));
  if (!rule || day < start || (rule.until && day > rule.until) || (rule.ex || []).includes(day)) return false;
  const n = rule.n || 1, [sy, sm, sd] = start.split('-').map(Number), [y, m, d] = day.split('-').map(Number);
  switch (rule.f) {
    case 'daily': return diffDays(start, day) % n === 0;
    case 'weekly': { const days = rule.days && rule.days.length ? rule.days : [dow(start)]; return days.includes(dow(day)) && (diffDays(addDays(start, -dow(start)), addDays(day, -dow(day))) / 7) % n === 0; }
    case 'monthly': return ((y - sy) * 12 + m - sm) % n === 0 && d === Math.min(sd, dim(y, m));
    case 'yearly': return (y - sy) % n === 0 && m === sm && d === Math.min(sd, dim(y, m));
  }
  return false;
}
function occurrence(ev, day) {
  const span = ev.endDate && ev.endDate > ev.date ? diffDays(ev.date, ev.endDate) : 0;
  for (let back = 0; back <= span; back++) { const s = addDays(day, -back); if (startsOn(ev.date, ev.rule, s)) return s; }
  return null;
}

// Today's plan from the planner, or the last copy when the phone is offline.
async function load() {
  const fm = FileManager.local(), file = fm.joinPath(fm.cacheDirectory(), 'daily-planner-widget.json');
  try {
    const r = new Request(PLANNER + '/rest/v1/rpc/widget_data');
    r.method = 'POST'; r.timeoutInterval = 15;
    r.headers = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };
    r.body = JSON.stringify({ key: KEY });
    const d = await r.loadJSON();
    if (!d || !Array.isArray(d.tasks)) throw new Error((d && d.message) || 'No answer');
    fm.writeString(file, JSON.stringify(d));
    return d;
  } catch (e) {
    if (fm.fileExists(file)) return JSON.parse(fm.readString(file));
    return { tasks: [], events: [], apple: [], hide: [], error: String(e.message || e) };
  }
}

function plan(d, now) {
  const day = iso(now), nowMin = now.getHours() * 60 + now.getMinutes();
  const hide = d.hide || [];
  const events = [];
  for (const ev of d.events || []) {
    const s = occurrence(ev, day);
    if (!s) continue;
    events.push({ title: ev.title || 'Untitled', time: s === day ? ev.time : null, end: ev.end, color: ev.color });
  }
  for (const e of d.apple || []) {
    if (hide.includes(e.cal)) continue;
    if (e.day) { if (e.day <= day && (e.endDay || e.day) >= day) events.push({ title: e.t || 'Untitled', time: null, color: e.color }); continue; }
    const from = iso(new Date(e.s * 1000)), to = iso(new Date(Math.max(e.s, e.e - 1) * 1000));
    if (from > day || to < day) continue;
    events.push({ title: e.t || 'Untitled', time: from === day ? hm(e.s) : null, end: to === day ? hm(e.e) : null, color: e.color });
  }
  // Events that have ended drop off; all-day ones stay on top.
  const left = events.filter((e) => !e.end || !e.time || mins(e.end) > nowMin || (e.end < e.time))
    .sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title));
  const tasks = (d.tasks || []).filter((t) => t.date && t.date <= day)
    .sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || (a.time || '99').localeCompare(b.time || '99') || a.date.localeCompare(b.date));
  return { day, events: left, tasks, late: tasks.filter((t) => t.date < day).length };
}

const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? new Color(c) : INK);
function text(stack, s, font, color, lines = 1) { const t = stack.addText(s); t.font = font; t.textColor = color; t.lineLimit = lines; return t; }
function hebrew(now) { try { return new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long' }).format(now); } catch (e) { return ''; } }

function header(w, now, big) {
  text(w, now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase(), Font.semiboldSystemFont(10), SOFT);
  const row = w.addStack(); row.centerAlignContent();
  text(row, now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }), new Font('Georgia', big ? 24 : 20), INK);
  const h = hebrew(now);
  if (h && big) { row.addSpacer(); text(row, h, Font.systemFont(11), SOFT); }
}
function eventRow(w, e, size = 13) {
  const row = w.addStack(); row.centerAlignContent(); row.spacing = 6;
  const bar = row.addStack(); bar.size = new Size(3, size + 3); bar.cornerRadius = 1.5; bar.backgroundColor = hex(e.color);
  text(row, e.title, Font.mediumSystemFont(size), INK);
  row.addSpacer();
  text(row, e.time ? clock(e.time) : 'All day', Font.systemFont(size - 2), SOFT);
}
function taskRow(w, t, day, size = 13) {
  const row = w.addStack(); row.centerAlignContent(); row.spacing = 6;
  const dot = row.addImage(SFSymbol.named(t.star ? 'star' : 'circle').image); dot.imageSize = new Size(size - 2, size - 2); dot.tintColor = t.date < day ? new Color('#ff6b6b') : SOFT;
  text(row, t.title, Font.systemFont(size), INK);
}
function section(w, name) { w.addSpacer(8); text(w, name.toUpperCase(), Font.semiboldSystemFont(9), SOFT); w.addSpacer(3); }

function build(d, family) {
  const now = new Date(), p = plan(d, now), w = new ListWidget();
  w.url = APP;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const next = p.events.find((e) => e.time) || p.events[0];
  const left = p.tasks.length + (p.tasks.length === 1 ? ' task' : ' tasks');

  if (family === 'accessoryInline') { text(w, next ? (next.time ? clock(next.time) + ' ' : '') + next.title : left, Font.systemFont(12), INK); return w; }
  if (family === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    text(w, String(p.tasks.length), Font.boldRoundedSystemFont(22), INK).centerAlignText();
    text(w, 'tasks', Font.systemFont(9), INK).centerAlignText();
    return w;
  }
  if (family === 'accessoryRectangular') {
    text(w, next ? next.title : 'Nothing else today', Font.semiboldSystemFont(14), INK);
    if (next) text(w, next.time ? clock(next.time) + (next.end ? ' – ' + clock(next.end) : '') : 'All day', Font.systemFont(12), INK);
    text(w, left + (p.late ? ', ' + p.late + ' late' : ''), Font.systemFont(12), INK);
    return w;
  }

  w.backgroundColor = BG;
  const pad = family === 'small' ? 14 : 16;
  w.setPadding(pad, pad, pad, pad);
  if (family === 'small') {
    header(w, now, false);
    section(w, 'Next');
    if (next) { text(w, next.title, Font.mediumSystemFont(13), INK, 2); text(w, next.time ? clock(next.time) : 'All day', Font.systemFont(11), SOFT); }
    else text(w, 'Nothing else today', Font.systemFont(12), SOFT);
    w.addSpacer();
    text(w, left + (p.late ? ' · ' + p.late + ' late' : ''), Font.mediumSystemFont(11), p.late ? new Color('#ff6b6b') : SOFT);
  } else {
    header(w, now, true);
    const large = family === 'large' || family === 'extraLarge';
    const room = large ? 14 : 4;
    const ev = p.events.slice(0, Math.max(1, Math.min(p.events.length, large ? 6 : (p.tasks.length ? 2 : 4))));
    const tk = p.tasks.slice(0, Math.max(0, room - ev.length));
    section(w, 'Schedule');
    if (p.events.length) ev.forEach((e) => { eventRow(w, e, large ? 14 : 12); w.addSpacer(large ? 5 : 3); });
    else text(w, 'Nothing else today', Font.systemFont(12), SOFT);
    if (p.tasks.length) {
      section(w, 'Tasks' + (p.tasks.length > tk.length ? ' · ' + p.tasks.length : ''));
      tk.forEach((t) => { taskRow(w, t, p.day, large ? 14 : 12); w.addSpacer(large ? 5 : 3); });
    }
    w.addSpacer();
  }
  if (d.error && !d.tasks.length) { text(w, 'Could not reach the planner', Font.systemFont(9), SOFT); }
  return w;
}

const data = await load();
const w = build(data, config.widgetFamily || 'medium');
if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;
}
