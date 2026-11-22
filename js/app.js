import * as D from './dates.js';
import * as store from './store.js';
import * as sync from './sync.js';
import * as J from './jewish.js';
import { parse } from './quickadd.js';
import * as E from './editors.js';
import { eventsOn } from './agenda.js';
import { $, download, esc, icon, sheet, toast } from './ui.js';
import * as today from './views/today.js';
import * as calendar from './views/calendar.js';
import * as tasks from './views/tasks.js';
import * as lists from './views/lists.js';
import * as notes from './views/notes.js';
import * as settings from './views/settings.js';

const VIEWS = { today, calendar, tasks, lists, notes, settings };
const NAMES = { today: 'Today', calendar: 'Calendar', tasks: 'Tasks', lists: 'Lists', notes: 'Notes', settings: 'Settings' };
const main = $('#main');
const open = new Set(); // which <details> are open, kept across renders
let route = [], stale = false, shownDay = D.iso();

function readRoute() {
  const r = location.hash.replace(/^#\/?/, '').split('/').map((x) => { try { return decodeURIComponent(x); } catch { return ''; } });
  return Object.hasOwn(VIEWS, r[0]) ? r : ['today'];
}
function renderNav() {
  const bad = (sync.state.token && sync.state.error) || store.status.saveFailed;
  $('#nav').innerHTML = `<p class="brand" aria-hidden="true">Luach</p>` + Object.keys(VIEWS).map((v) => `<a href="#/${v}" class="${v}" ${route[0] === v ? 'aria-current="page"' : ''}>${icon(v)}<span>${NAMES[v]}</span>${v === 'settings' && bad ? '<i class="alert" title="Sync problem"></i>' : ''}</a>`).join('');
}
function render() {
  // Keep what is being typed: a redraw restores the focused field and its cursor.
  const a = document.activeElement;
  const typing = a && main.contains(a) && a.id && 'value' in a && a.type !== 'file' ? { id: a.id, of: a.dataset.day || a.dataset.id, value: a.value, s: a.selectionStart, e: a.selectionEnd, text: /^(text|search|password|textarea)$/.test(a.type) } : null;
  const focusKey = a && main.contains(a) && !typing && a.dataset.act ? [a.dataset.act, a.dataset.id, a.dataset.day] : null;
  main.innerHTML = VIEWS[route[0]].render(route[1], route[2]);
  main.querySelectorAll('details[id]').forEach((d) => { d.open = open.has(d.id); });
  if (route[0] === 'notes' && $('#notesearch') && !typing) $('#notesearch').value = notes.st.q;
  if (typing) {
    const el = document.getElementById(typing.id);
    // Same field for the same day or note: at midnight the journal becomes a new page.
    if (el && (el.dataset.day || el.dataset.id) === typing.of) { el.value = typing.value; el.focus({ preventScroll: true }); if (typing.text) try { el.setSelectionRange(typing.s, typing.e); } catch { /* not a text field */ } }
  } else if (focusKey) {
    [...main.querySelectorAll(`[data-act="${focusKey[0]}"]`)].find((x) => x.dataset.id === focusKey[1] && x.dataset.day === focusKey[2])?.focus({ preventScroll: true });
  }
  renderNav();
  document.title = route[0] === 'today' ? 'Luach' : `${NAMES[route[0]]} · Luach`;
  stale = false;
}
function go() {
  flush();
  const r = readRoute();
  const moved = r.join('/') !== route.join('/');
  if (r[0] !== 'notes') notes.st.q = '';
  route = r;
  if (moved) { document.activeElement?.blur?.(); scrollTo(0, 0); }
  render();
}

/* ---------- text that saves as you type ---------- */
const pending = new Map();
const SAVERS = {
  journal(el) {
    const id = 'j:' + el.dataset.day, body = el.value;
    if (!body.trim()) return store.get(id) && store.remove(id);
    if (store.get(id)?.body !== body) store.put({ id, k: 'journal', body });
  },
  noteTitle(el) { const n = store.get(el.dataset.id); if (n && n.title !== el.value) store.put({ ...n, title: el.value }); },
  noteBody(el) { const n = store.get(el.dataset.id); if (n && n.body !== el.value) store.put({ ...n, body: el.value }); },
};
function saveSoon(el) {
  clearTimeout(pending.get(el));
  pending.set(el, setTimeout(() => flush(el), 500));
}
function flush(only) {
  for (const [el, t] of [...pending]) {
    if (only && el !== only) continue;
    clearTimeout(t);
    pending.delete(el);
    store.change(() => SAVERS[el.dataset.save](el), { quiet: true });
  }
}

/* ---------- actions ---------- */
const ACT = {
  go: (el) => { location.hash = el.dataset.to; },
  quickAdd: (el) => {
    const kind = el.dataset.kind || (route[0] === 'tasks' ? 'task' : null);
    E.quickAdd({ kind, date: el.dataset.date || (route[0] === 'calendar' && calendar.st.mode === 'month' ? calendar.st.sel : null) });
  },
  toggleTask: (el) => E.toggleTask(el.dataset.id),
  editTask: (el) => E.editTask(store.get(el.dataset.id)),
  openEvent: (el) => {
    const { id, day, occ } = el.dataset;
    if (occ) return E.editEvent(store.get(id), { occ });
    const e = eventsOn(day).find((x) => x.id === id);
    if (e) E.showApple(e, day);
  },
  editHabit: (el) => E.editHabit(el.dataset.id ? store.get(el.dataset.id) : null),
  toggleHabit: (el) => E.toggleHabit(el.dataset.id, el.dataset.day),
  pickDay: (el) => { calendar.select(el.dataset.day); render(); $('.cell.sel')?.focus({ preventScroll: true }); },
  calMove: (el) => {
    const ym = D.addMonths(calendar.st.ym, +el.dataset.n), t = D.iso();
    calendar.select(t.startsWith(ym) ? t : ym + '-01');
    render();
  },
  calToday: () => { calendar.select(D.iso()); render(); },
  calMode: (el) => { calendar.st.mode = el.dataset.mode; render(); },
  tag: (el) => { tasks.st.tag = el.dataset.tag || null; render(); },
  clearDone: () => {
    const done = store.all('task').filter((t) => t.done && (!tasks.st.tag || t.tags?.includes(tasks.st.tag)));
    toast(`Deleted ${done.length} done tasks`, store.change(() => done.forEach((t) => store.remove(t.id))));
  },
  renameList: (el) => {
    const l = el.dataset.id ? store.get(el.dataset.id) : null;
    sheet(l ? 'Edit list' : 'New list', `<label>Name <input name="title" autofocus value="${esc(l?.title)}" placeholder="Shopping"></label><p class="err" role="alert" hidden></p>`, {
      del: l ? 'Delete list' : null,
      on: {
        save: (f) => {
          const title = f.title.value.trim();
          if (!title) { $('.err', f).textContent = 'Give the list a name.'; $('.err', f).hidden = false; return false; }
          const rec = l ? { ...l, title } : { id: store.uid(), k: 'list', made: Date.now(), title };
          store.change(() => store.put(rec));
          if (!l) location.hash = '#/lists/' + rec.id;
        },
        del: () => {
          const items = lists.itemsOf(l.id);
          const undo = store.change(() => { items.forEach((x) => store.remove(x.id)); store.remove(l.id); });
          location.hash = '#/lists';
          toast('List deleted', undo);
        },
      },
    });
  },
  toggleItem: (el) => { const x = store.get(el.dataset.id); if (x) store.change(() => store.put({ ...x, on: !x.on })); },
  removeItem: (el) => toast('Item removed', store.change(() => store.remove(el.dataset.id))),
  uncheckAll: (el) => { store.change(() => lists.itemsOf(el.dataset.id).filter((x) => x.on).forEach((x) => store.put({ ...x, on: false }))); },
  clearChecked: (el) => toast('Checked items removed', store.change(() => lists.itemsOf(el.dataset.id).filter((x) => x.on).forEach((x) => store.remove(x.id)))),
  newNote: () => {
    const rec = { id: store.uid(), k: 'note', made: Date.now(), title: '', body: '' };
    store.change(() => store.put(rec));
    location.hash = '#/notes/' + rec.id;
    setTimeout(() => $('#notetitle')?.focus(), 0);
  },
  pinNote: (el) => { flush(); const n = store.get(el.dataset.id); store.change(() => store.put({ ...n, pin: !n.pin })); },
  deleteNote: (el) => {
    flush();
    const undo = store.change(() => store.remove(el.dataset.id), { quiet: true });
    location.hash = '#/notes';
    toast('Note deleted', undo);
  },
  locate: () => {
    if (!navigator.geolocation) return toast('This device cannot share its location.');
    toast('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => {
        // About a kilometer: close enough for zmanim, and all that gets synced.
        store.setSettings({ loc: { name: 'My location', lat: +c.latitude.toFixed(2), lon: +c.longitude.toFixed(2), tz: Intl.DateTimeFormat().resolvedOptions().timeZone } });
        toast('Location set');
      },
      () => toast('Could not get your location. Pick a city instead.'), { timeout: 15000 });
  },
  syncNow: () => { flush(); sync.syncNow(); },
  syncOff: () => { sync.disconnect(); toast('Sync is off on this device. Your data stays here.'); },
  backup: () => { flush(); download(`luach-backup-${D.iso()}.json`, JSON.stringify({ app: 'luach', v: 1, made: new Date().toISOString(), recs: store.everything() }), 'application/json'); },
};
const SUBMIT = {
  addTask: (f) => {
    const p = parse(f.t.value);
    if (!p.title) return;
    const tags = tasks.st.tag && !p.tags.includes(tasks.st.tag) ? [...p.tags, tasks.st.tag] : p.tags;
    f.t.value = '';
    store.change(() => store.put({ id: store.uid(), k: 'task', made: Date.now(), title: p.title, date: p.date, time: p.time, rule: p.rule, star: p.star, tags, notes: '', done: null }));
  },
  addItem: (f) => {
    const title = f.t.value.trim();
    if (!title) return;
    f.t.value = '';
    store.change(() => store.put({ id: store.uid(), k: 'item', list: f.dataset.list, made: Date.now(), title, on: false }));
  },
  syncOn: async (f) => {
    const token = f.t.value.trim(), b = $('button', f);
    if (!token) return;
    b.disabled = true;
    try { await sync.connect(token); f.t.blur(); render(); }
    catch (e) { b.disabled = false; const m = $('#syncmsg'); if (m) m.textContent = e.message; }
  },
};
const CHANGE = {
  city: (el) => { if (el.value !== 'keep') store.setSettings({ loc: el.value ? J.cityLoc(el.value) : null }); },
  candles: (el) => store.setSettings({ candles: +el.value }),
  ends: (el) => store.setSettings({ ends: el.value }),
  spelling: (el) => store.setSettings({ spelling: el.value }),
  cal: (el) => { const h = store.settings().hideCals.filter((c) => c !== el.value); store.setSettings({ hideCals: el.checked ? h : [...h, el.value] }); },
  openJournal: (el) => { if (D.isRealDate(el.value) && el.value <= D.iso()) location.hash = '#/notes/journal/' + el.value; },
  restore: async (el) => {
    const file = el.files[0];
    if (!file) return;
    try { store.importBackup(JSON.parse(await file.text())); toast('Backup restored'); sync.soon(); }
    catch { toast('That file is not a Luach backup.'); }
    el.value = '';
  },
};
const LIVE = { noteSearch: (el) => { notes.st.q = el.value.trim(); render(); } };

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && Object.hasOwn(ACT, el.dataset.act)) ACT[el.dataset.act](el);
});
document.addEventListener('submit', (e) => {
  const n = e.target.dataset.submit;
  if (n) { e.preventDefault(); SUBMIT[n](e.target); }
});
document.addEventListener('change', (e) => { const n = e.target.dataset?.change; if (n) CHANGE[n](e.target); });
document.addEventListener('input', (e) => {
  const d = e.target.dataset || {};
  if (d.save) saveSoon(e.target);
  if (d.live) LIVE[d.live](e.target);
});
document.addEventListener('focusout', (e) => { if (e.target.dataset?.save) flush(e.target); setTimeout(() => { if (stale && !busyTyping()) render(); }, 0); });
document.addEventListener('toggle', (e) => { if (e.target.id && e.target.tagName === 'DETAILS') e.target.open ? open.add(e.target.id) : open.delete(e.target.id); }, true);
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || $('#sheet').open) return;
  const t = e.target;
  if (t.matches?.('.cell') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    calendar.select(D.addDays(calendar.st.sel, { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]));
    render();
    $('.cell.sel').focus({ preventScroll: true });
    return;
  }
  if (t.matches?.('input, textarea, select')) return;
  if (e.key === 'n') { e.preventDefault(); $('#add').click(); }
  const i = '123456'.indexOf(e.key);
  if (i >= 0) location.hash = '#/' + Object.keys(VIEWS)[i];
});

const busyTyping = () => main.contains(document.activeElement) && document.activeElement.matches('textarea, input');
store.onChange((why) => {
  if (why !== 'remote') sync.soon();
  if (why === 'quiet') return;
  // Never redraw under someone typing because another device changed something.
  if (why === 'remote' && busyTyping()) { stale = true; return; }
  render();
});
sync.watch((appleChanged) => {
  const line = $('#syncline');
  if (line) { line.textContent = settings.syncText(); line.className = sync.state.error ? 'late' : ''; }
  if (appleChanged || (!sync.state.token && route[0] === 'settings')) { if (busyTyping()) stale = true; else render(); }
  else renderNav();
});

addEventListener('hashchange', go);
addEventListener('pagehide', () => flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { flush(); return; }
  tick();
  sync.syncNow();
});
addEventListener('online', () => sync.syncNow());
function tick() {
  if (document.visibilityState === 'hidden') return;
  const d = D.iso();
  if (d !== shownDay) { if (calendar.st.sel === shownDay) calendar.select(d); shownDay = d; flush(); render(); }
  else if (route[0] === 'today' && !busyTyping() && !$('#sheet').open) render();
}
setInterval(tick, 60000);
setInterval(() => { if (document.visibilityState === 'visible') sync.syncNow(); }, 5 * 60000);

go();
sync.syncNow();
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
