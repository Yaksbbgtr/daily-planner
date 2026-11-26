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
import * as rituals from './rituals.js';
import * as focus from './focus.js';
import * as checklist from './checklist.js';
import * as files from './files.js';
import * as notify from './notify.js';

// The look, applied before anything draws. A copy on this device avoids a flash of the default.
// On top of the chosen look, your own accent and background colors (Settings > Look).
const HEX = /^#[0-9a-f]{6}$/i;
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const COLORVARS = ['--accent', '--on-accent', '--bg', '--card', '--card2', '--ink', '--soft', '--faint', '--line', '--dock-bg', 'color-scheme', '--btn-ink', '--btn-bg'];
export function applyTheme(t, own = store.local.get('colors') || {}) {
  const theme = ['dusk', 'daylight', 'gold', 'ocean'].includes(t) ? t : 'dusk';
  const root = document.documentElement, st = root.style;
  root.dataset.theme = theme;
  store.local.set('theme', theme);
  store.local.set('colors', own);
  COLORVARS.forEach((v) => st.removeProperty(v));
  if (HEX.test(own.accent || '')) { st.setProperty('--accent', own.accent); st.setProperty('--on-accent', lum(own.accent) > 0.4 ? '#111111' : '#ffffff'); }
  if (HEX.test(own.bg || '')) {
    const light = lum(own.bg) > 0.4, ink = light ? '#1a1a1a' : '#f5f5f5', mix = (p) => `color-mix(in srgb, ${ink} ${p}%, ${own.bg})`;
    st.setProperty('--bg', own.bg); st.setProperty('--card', light ? `color-mix(in srgb, #000 4%, ${own.bg})` : mix(7)); st.setProperty('--card2', light ? `color-mix(in srgb, #000 8%, ${own.bg})` : mix(12));
    st.setProperty('--ink', ink); st.setProperty('--soft', mix(62)); st.setProperty('--faint', mix(40)); st.setProperty('--line', light ? 'rgb(0 0 0 / .08)' : 'rgb(255 255 255 / .08)');
    st.setProperty('--dock-bg', `color-mix(in srgb, ${mix(12)} 85%, transparent)`); st.setProperty('color-scheme', light ? 'light' : 'dark');
  }
  // Buttons like Add and Past days: the color of their words, and the soft round highlight behind them.
  if (HEX.test(own.ink || '')) st.setProperty('--btn-ink', own.ink);
  if (own.hl === 'none') st.setProperty('--btn-bg', 'transparent');
  else if (HEX.test(own.hl || '')) st.setProperty('--btn-bg', `color-mix(in srgb, ${own.hl} 24%, transparent)`);
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', HEX.test(own.bg || '') ? own.bg : bg);
}
// Changing the look: the whole screen fades from the old colors to the new ones at once, instead of each
// button, card and line changing on its own timing.
// Animated swaps (view transitions) where the browser has them, the person has not asked for less motion, and the
// page is not being driven by a test robot (which expects each change to land at once).
function smooth() { return !!document.startViewTransition && !navigator.webdriver && !matchMedia('(prefers-reduced-motion: reduce)').matches && document.visibilityState === 'visible'; }
function recolor(fn) {
  const root = document.documentElement;
  const go = () => { root.classList.add('recolor'); fn(); void root.offsetWidth; requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('recolor'))); };
  if (smooth()) document.startViewTransition(go);
  else go();
}
// The coming weeks' sunsets on days tefillin are worn, so the reminder job (which has no Jewish calendar of its
// own) knows when to ring. Saved quietly when the app opens and when the location or setting changes.
function planTefillin() {
  try {
    const s = store.settings();
    if (!s.loc || s.tfOff) { if (store.get('tfplan')) store.change(() => store.remove('tfplan'), { quiet: true }); return; }
    const days = {};
    for (let i = 0, d = D.iso(); i < 21; i++, d = D.addDays(d, 1)) {
      if (J.isRestDay(d)) continue;
      const at = J.zmanim(d)?.find((x) => x.id === 'sunset')?.at;
      if (at && !isNaN(at)) days[d] = +at;
    }
    const old = store.get('tfplan');
    if (old && JSON.stringify(old.days) === JSON.stringify(days)) return;
    store.change(() => store.put({ id: 'tfplan', k: 'tfplan', days }), { quiet: true });
  } catch { /* no location or calendar yet */ }
}
let tfTimer = null;
const planSoon = () => { clearTimeout(tfTimer); tfTimer = setTimeout(planTefillin, 1500); };
const ownColors = () => { const s = store.settings(); return { accent: s.accent || null, bg: s.bg || null, ink: s.ink || null, hl: s.hl || null }; };
applyTheme(store.local.get('theme') || store.settings().theme, store.local.get('colors') || ownColors());

const VIEWS = { today, calendar, tasks, lists, notes, settings };
const NAMES = { today: 'Today', calendar: 'Calendar', tasks: 'Tasks', lists: 'Lists', notes: 'Notes', settings: 'Settings' };
const main = $('#main');
const open = new Set(); // which <details> are open, kept across renders
let route = [], stale = false, focusAfter = null, shownDay = D.iso();

function readRoute() {
  const r = location.hash.replace(/^#\/?/, '').split('/').map((x) => { try { return decodeURIComponent(x); } catch { return ''; } });
  return Object.hasOwn(VIEWS, r[0]) ? r : ['today'];
}
// The tab bar is built once, so the highlight can slide from tab to tab instead of jumping.
// Projects lives inside Tasks (#/tasks/projects) but gets its own tab.
const TABS = [['today', '#/today'], ['calendar', '#/calendar'], ['tasks', '#/tasks'], ['projects', '#/tasks/projects'], ['lists', '#/lists'], ['notes', '#/notes'], ['settings', '#/settings']];
const nav = $('#nav');
nav.innerHTML = `<span class="pill" aria-hidden="true"></span>` + TABS.map(([v, href]) => `<a href="${href}" data-tab="${v}" draggable="false">${icon(v)}<span>${v === 'projects' ? 'Projects' : NAMES[v]}</span></a>`).join('');
const tabNow = () => (route[0] === 'tasks' && route[1] === 'projects' ? 'projects' : route[0]);
const pill = $('.pill', nav);
function placePill(el, animate = true) {
  if (!el) { pill.style.opacity = '0'; return; }
  pill.classList.toggle('still', !animate);
  pill.style.opacity = '1';
  pill.style.width = el.offsetWidth + 'px';
  pill.style.transform = `translateX(${el.offsetLeft}px)`;
}
let placedOnce = false;
function renderNav() {
  const bad = (sync.state.user && sync.state.error) || store.status.saveFailed;
  document.body.classList.toggle('syncbad', !!bad);
  let current = null;
  nav.querySelectorAll('a').forEach((a) => {
    const on = a.dataset.tab === tabNow();
    if (on) { a.setAttribute('aria-current', 'page'); current = a; } else a.removeAttribute('aria-current');
  });
  placePill(current, placedOnce);
  placedOnce = true;
}
addEventListener('resize', () => placePill(nav.querySelector('[aria-current]'), false));

// Drag along the bar like in Apple's apps: the highlight follows the finger and lands on the nearest tab.
let drag = null;
nav.addEventListener('dragstart', (e) => e.preventDefault());
nav.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  drag = { x: e.clientX, moved: false, id: e.pointerId };
});
nav.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && Math.abs(e.clientX - drag.x) < 8) return;
  if (!drag.moved) { drag.moved = true; nav.setPointerCapture(e.pointerId); nav.classList.add('dragging'); }
  const box = nav.getBoundingClientRect(), w = pill.offsetWidth;
  const left = Math.max(4, Math.min(box.width - w - 4, e.clientX - box.left - w / 2));
  pill.classList.add('still');
  pill.style.opacity = '1';
  pill.style.transform = `translateX(${left}px)`;
  const hit = nearestTab(e.clientX);
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('hover', a === hit));
});
function nearestTab(x) {
  let best = null, dist = Infinity;
  nav.querySelectorAll('a').forEach((a) => { const r = a.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - x); if (d < dist) { dist = d; best = a; } });
  return best;
}
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const was = drag;
  drag = null;
  nav.classList.remove('dragging');
  nav.querySelectorAll('a.hover').forEach((a) => a.classList.remove('hover'));
  if (!was.moved) return;
  nav.dataset.justDragged = '1';
  setTimeout(() => { delete nav.dataset.justDragged; }, 400);
  const hit = nearestTab(e.clientX);
  placePill(hit);
  if (hit && hit.dataset.tab !== tabNow()) location.hash = hit.getAttribute('href');
}
nav.addEventListener('pointerup', endDrag);
nav.addEventListener('pointercancel', endDrag);
// A drag must not also count as a tap on the tab it started on.
nav.addEventListener('click', (e) => { if (nav.dataset.justDragged) { e.preventDefault(); delete nav.dataset.justDragged; } }, true);

function render() {
  // Keep what is being typed: a redraw restores the focused field and its cursor.
  const a = document.activeElement;
  const typing = a && main.contains(a) && a.id && 'value' in a && a.type !== 'file' ? { id: a.id, of: a.dataset.day || a.dataset.id, value: a.value, s: a.selectionStart, e: a.selectionEnd, text: /^(text|search|password|textarea)$/.test(a.type) } : null;
  const focusKey = a && main.contains(a) && !typing && a.dataset.act ? [a.dataset.act, a.dataset.id, a.dataset.day] : null;
  main.innerHTML = VIEWS[route[0]].render(route[1], route[2]);
  VIEWS[route[0]].after?.(main);
  // The checklist tiles scroll sideways once there are more than four: keep the chosen one in sight.
  const ckOn = main.querySelector('.parts [aria-pressed=true]');
  if (ckOn && ckOn.parentElement.scrollWidth > ckOn.parentElement.clientWidth) {
    const row = ckOn.parentElement, r = row.getBoundingClientRect(), b = ckOn.getBoundingClientRect(), pad = 16;
    if (b.right > r.right - pad) row.scrollLeft += b.right - r.right + pad;
    else if (b.left < r.left + pad) row.scrollLeft -= r.left + pad - b.left;
  }
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
  document.title = route[0] === 'today' ? 'Daily Planner' : `${NAMES[route[0]]} · Daily Planner`;
  stale = false;
}
// Moving between screens: the old one slides and fades into the new one. Tabs further right come in from the
// right, going into something (a project, a note) comes in from the right, and going back comes in from the left.
const depth = (r) => r.filter(Boolean).length;
function turn(swap, dir) {
  const root = document.documentElement;
  if (!smooth()) { swap(); main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter'); return; }
  root.dataset.turn = dir;
  const vt = document.startViewTransition(swap);
  vt.finished.finally(() => { if (root.dataset.turn === dir) delete root.dataset.turn; });
}
function go() {
  flush();
  const r = readRoute();
  const moved = r.join('/') !== route.join('/');
  if (r[0] !== 'notes') notes.st.q = '';
  if (!moved || !route.length) { route = r; render(); return; }
  const tabs = [...nav.querySelectorAll('a')].map((a) => a.dataset.tab);
  const from = tabNow();
  const was = route;
  const swap = () => { route = r; document.activeElement?.blur?.(); scrollTo(0, 0); render(); if (focusAfter) { $(focusAfter)?.focus(); focusAfter = null; } };
  const to = r[0] === 'tasks' && r[1] === 'projects' ? 'projects' : r[0];
  let dir = 'fade';
  if (from !== to) dir = tabs.indexOf(to) > tabs.indexOf(from) ? 'next' : 'back';
  else if (depth(r) !== depth(was)) dir = depth(r) > depth(was) ? 'next' : 'back';
  turn(swap, dir);
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
    E.quickAdd({ kind, time: el.dataset.time || null, date: el.dataset.date || (route[0] === 'calendar' && calendar.st.mode !== 'list' ? calendar.st.sel : null) });
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
  pickToday: (el) => { flush(); today.st.day = el.dataset.day; render(); },
  dayStep: (el) => { flush(); today.st.day = D.addDays(today.st.day || D.iso(), +el.dataset.n); render(); },
  planDay: () => rituals.planDay(),
  wrapDay: () => rituals.wrapDay(),
  rollOver: () => rituals.rollOver(),
  pickDay: (el) => { calendar.select(el.dataset.day); render(); $('.cell.sel')?.focus({ preventScroll: true }); },
  calMove: (el) => {
    const n = +el.dataset.n, m = calendar.st.mode, t = D.iso();
    if (m === 'week' || m === 'day') calendar.select(D.addDays(calendar.st.sel, m === 'week' ? 7 * n : n));
    else { const ym = D.addMonths(calendar.st.ym, n); calendar.select(t.startsWith(ym) ? t : ym + '-01'); }
    render();
  },
  calToday: () => { calendar.select(D.iso()); calendar.scroll.y = null; render(); },
  calMode: (el) => { calendar.st.mode = el.dataset.mode; calendar.scroll.y = null; render(); },
  calDay: (el) => { calendar.select(el.dataset.day); calendar.st.mode = 'day'; render(); },
  tag: (el) => { tasks.st.tag = el.dataset.tag || null; render(); },
  clearDone: () => {
    const done = store.all('task').filter((t) => t.done && (!tasks.st.tag || t.tags?.includes(tasks.st.tag)));
    toast(`Deleted ${done.length} done tasks`, store.change(() => done.forEach((t) => store.remove(t.id))));
  },
  // A list on the Lists page, or a checklist on a project (data-proj): the checklist stays on the project page.
  renameList: (el) => {
    const l = el.dataset.id ? store.get(el.dataset.id) : null;
    const proj = l ? l.proj || null : el.dataset.proj || null;
    const word = proj ? 'checklist' : 'list';
    sheet(l ? `Edit ${word}` : `New ${word}`, `<label>Name <input name="title" autofocus value="${esc(l?.title)}" placeholder="${proj ? 'Packing' : 'Shopping'}"></label><p class="err" role="alert" hidden></p>`, {
      del: l ? `Delete ${word}` : null,
      on: {
        save: (f) => {
          const title = f.title.value.trim();
          if (!title) { $('.err', f).textContent = `Give the ${word} a name.`; $('.err', f).hidden = false; return false; }
          const rec = l ? { ...l, title } : { id: store.uid(), k: 'list', made: Date.now(), title, ...(proj ? { proj } : {}) };
          // A new list opens on its own page: the route change draws it, so no extra draw of the old page first.
          store.change(() => store.put(rec), { quiet: !l && !proj });
          if (!l && !proj) location.hash = '#/lists/' + rec.id;
          if (!l && proj) setTimeout(() => document.getElementById('ck-' + rec.id)?.focus(), 50);
        },
        del: () => {
          const items = lists.itemsOf(l.id);
          const undo = store.change(() => { items.forEach((x) => store.remove(x.id)); store.remove(l.id); }, { quiet: !proj });
          if (!proj) location.hash = '#/lists';
          toast(`${proj ? 'Checklist' : 'List'} deleted`, undo);
        },
      },
    });
  },
  openFile: async (el) => {
    const f = store.get(el.dataset.id);
    if (!f) return;
    const pic = files.isImage(f);
    sheet(pic ? 'Photo' : 'File', `${pic ? '<div class="bigpic"><img alt="" data-big></div>' : `<div class="picked"><span class="bubble" aria-hidden="true">${E.fileGlyph()}</span><div class="grow"><b dir="auto">${esc(f.name)}</b><p class="hint">${esc(files.size(f.size))}</p></div></div>`}
      ${pic ? `<p class="hint" dir="auto">${esc(f.name)} · ${esc(files.size(f.size))}</p>` : ''}<p class="hint" data-state>Getting it…</p>
      <div class="links" data-btns hidden><a class="plain" data-open target="_blank" rel="noopener">Open</a><a class="plain" data-save download="${esc(f.name)}">Save</a>${navigator.canShare ? '<button type="button" class="plain" data-share>Share</button>' : ''}</div>`, {
      del: 'Delete',
      on: { del: () => toast('File deleted', files.remove(f)) },
      setup: async (form) => {
        const u = await files.url(f);
        const st = $('[data-state]', form);
        if (!u) { st.textContent = sync.state.user ? 'This file is not here yet. It shows up once the device that added it has synced.' : 'Sign in to get files added on your other devices.'; return; }
        st.hidden = true;
        $('[data-btns]', form).hidden = false;
        $('[data-open]', form).href = u; $('[data-save]', form).href = u;
        if (pic) $('[data-big]', form).src = u;
        const sh = $('[data-share]', form);
        if (sh) sh.onclick = async () => { try { const b = await files.blob(f); await navigator.share({ files: [new File([b], f.name, { type: f.type })] }); } catch { /* cancelled */ } };
      },
    });
  },
  toggleItem: (el) => { const x = store.get(el.dataset.id); if (x) store.change(() => store.put({ ...x, on: !x.on })); },
  removeItem: (el) => toast('Item removed', store.change(() => store.remove(el.dataset.id))),
  uncheckAll: (el) => { store.change(() => lists.itemsOf(el.dataset.id).filter((x) => x.on).forEach((x) => store.put({ ...x, on: false }))); },
  clearChecked: (el) => toast('Checked items removed', store.change(() => lists.itemsOf(el.dataset.id).filter((x) => x.on).forEach((x) => store.remove(x.id)))),
  newNote: (el) => {
    const rec = { id: store.uid(), k: 'note', made: Date.now(), title: '', body: '', folder: el.dataset.folder || null };
    store.change(() => store.put(rec), { quiet: true });
    focusAfter = '#notetitle';
    location.hash = '#/notes/' + rec.id;
  },
  noteFolder: (el) => { notes.st.folder = el.dataset.id || null; render(); },
  editFolder: (el) => {
    const fo = el.dataset.id ? store.get(el.dataset.id) : null;
    sheet(fo ? 'Folder' : 'New folder', `<label>Name <input name="title" autofocus value="${esc(fo?.title)}" placeholder="Recipes"></label><p class="err" role="alert" hidden></p>`, {
      del: fo ? 'Delete folder' : null,
      on: {
        save: (f) => {
          const title = f.title.value.trim();
          if (!title) { $('.err', f).textContent = 'Give the folder a name.'; $('.err', f).hidden = false; return false; }
          const rec = fo ? { ...fo, title } : { id: store.uid(), k: 'folder', made: Date.now(), title };
          notes.st.folder = rec.id;
          store.change(() => store.put(rec));
        },
        // The notes stay; they just leave the folder.
        del: () => {
          const ns = notes.notesIn(fo.id);
          notes.st.folder = null;
          const undo = store.change(() => { ns.forEach((n) => store.put({ ...n, folder: null })); store.remove(fo.id); });
          render();
          toast(ns.length ? `Folder deleted. Its ${ns.length} notes are still in All.` : 'Folder deleted', undo);
        },
      },
    });
  },
  editProject: (el) => E.editProject(el.dataset.id ? store.get(el.dataset.id) : null),
  finishProject: (el) => { const p = store.get(el.dataset.id); if (p) toast('Project finished', store.change(() => store.put({ ...p, done: Date.now() }))); },
  checkPart: (el) => { checklist.st.part = el.dataset.part; render(); },
  toggleRoutine: (el) => checklist.toggle(el.dataset.id, el.dataset.day),
  editRoutine: (el) => checklist.edit(el.dataset.id ? store.get(el.dataset.id) : null, el.dataset.part),
  tefillin: (el) => {
    const id = today.tfid(el.dataset.day);
    if (store.get(id)) store.change(() => store.remove(id));
    else { store.change(() => store.put({ id, k: 'tefillin', day: el.dataset.day })); toast('Tefillin: done for today'); }
  },
  sampleRoutine: () => checklist.sample(),
  editCkList: (el) => checklist.editList(el.dataset.id ? store.get(el.dataset.id) : null),
  toggleStep: (el) => E.toggleStep(el.dataset.id, el.dataset.step),
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
  signIn: async () => {
    flush();
    try { await sync.signIn(); } catch (e) { const m = $('#syncmsg'); if (m) m.textContent = e.message; }
  },
  signOut: async () => { flush(); await sync.signOut(); toast('Signed out. Your data stays on this device.'); },
  macKey: async (el) => {
    el.disabled = true;
    let key;
    try { key = await sync.makeMacKey(); } catch (e) { toast(e.message); return; } finally { el.disabled = false; }
    sheet('Mac key', `<p>On your Mac, open Terminal and run:</p><p><code>~/daily-planner/mac/install.sh</code></p><p>When it asks for the key, paste this. It is shown only once; making a new key turns the old one off.</p>
      <textarea id="mackey" readonly rows="3" aria-label="Mac key">${esc(key)}</textarea><button type="button" class="primary" data-copy>Copy key</button>`, {
      setup: (f) => { $('[data-copy]', f).onclick = async (e) => { try { await navigator.clipboard.writeText(key); e.target.textContent = 'Copied'; } catch { $('#mackey').select(); } }; },
    });
  },
  // Throws away the saved copy of the app (not your data) and loads it fresh.
  forceUpdate: async () => {
    flush();
    toast('Updating…');
    try { for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister(); } catch { /* none */ }
    try { for (const k of await caches.keys()) if (k.startsWith('planner-')) await caches.delete(k); } catch { /* none */ }
    location.replace(location.pathname + '?v=' + Date.now() + location.hash);
  },
  resetColors: () => recolor(() => { store.setSettings({ accent: null, bg: null, ink: null, hl: null }); applyTheme(store.settings().theme, ownColors()); }),
  mailSetup: async (el) => {
    el.disabled = true;
    let key;
    try { key = await sync.makeMailKey(); } catch (e) { toast(e.message); return; } finally { el.disabled = false; }
    const { mailScript } = await import('../mail/script.js');
    const { CLOUD } = await import('./config.js');
    const code = mailScript({ url: CLOUD.url, anon: CLOUD.key, key });
    sheet('Email to tasks', `<ol class="steps-how">
      <li>Open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> on your computer, signed in to the Gmail account to add. (Several accounts? Pick it from the round picture at the top right of that page.) A new project opens.</li>
      <li>Click in the code, press <b>⌘A</b>, then <b>⌘V</b>, so the script replaces everything, including the first line <code>function myFunction() {</code>. <button type="button" class="primary" data-copy>Copy script</button></li>
      <li>Press <b>Save</b>, pick <b>setup</b> in the menu next to <b>Run</b>, and press <b>Run</b>.</li>
      <li>Google asks for permission to read your Gmail. Allow it. If it says Google hasn't checked the app, press <b>Advanced</b>, then <b>Go to</b> your project: it is your own script.</li></ol>
      <p class="hint">From then on, every 5 minutes, new emails become tasks. To pick which emails (only starred ones, say), change the line that starts with <code>const WHICH</code>. Each Gmail account gets its own script and key; the key can only add tasks.</p>
      <textarea id="mailscript" readonly rows="4" aria-label="Script">${esc(code)}</textarea>`, {
      setup: (f) => { $('[data-copy]', f).onclick = async (e) => { try { await navigator.clipboard.writeText(code); e.target.textContent = 'Copied'; } catch { $('#mailscript').select(); } }; },
    });
    store.setSettings({ mailOn: store.settings().mailOn || Date.now() });
  },
  widgetSetup: async (el) => {
    el.disabled = true;
    let key;
    try { key = await sync.makeWidgetKey(); } catch (e) { toast(e.message); return; } finally { el.disabled = false; }
    const { widgetScript } = await import('../widget/script.js');
    const { CLOUD } = await import('./config.js');
    const code = widgetScript({ url: CLOUD.url, anon: CLOUD.key, key, app: location.origin + location.pathname });
    sheet('Phone widget', `<ol class="steps-how">
      <li>Get <a href="https://apps.apple.com/app/scriptable/id1405459188" target="_blank" rel="noopener">Scriptable</a> from the App Store. It is free.</li>
      <li><button type="button" class="primary" data-copy>Copy widget script</button></li>
      <li>Open Scriptable, tap <b>+</b> at the top right, and paste. Tap the title at the top and name it <b>Daily Planner</b>. Tap <b>Done</b>. (Tap ▶ to preview it.)</li>
      <li>On your Home Screen, press and hold an empty spot, tap <b>Edit</b> → <b>Add Widget</b>, pick <b>Scriptable</b>, choose a size, and add it.</li>
      <li>Press and hold the new widget, tap <b>Edit Widget</b>, and for <b>Script</b> pick <b>Daily Planner</b>. Tapping the widget opens the planner.</li></ol>
      <p class="hint">Lock Screen too: press and hold the Lock Screen, tap <b>Customize</b> → <b>Lock Screen</b>, tap the widget row, add Scriptable, then tap it and pick Daily Planner. The widget refreshes about every 15 minutes (iPhone decides exactly when). Its key can only read today's tasks and events.</p>
      <textarea id="widgetscript" readonly rows="4" aria-label="Script">${esc(code)}</textarea>`, {
      setup: (f) => { $('[data-copy]', f).onclick = async (e) => { try { await navigator.clipboard.writeText(code); e.target.textContent = 'Copied'; } catch { $('#widgetscript').select(); } }; },
    });
    store.setSettings({ widgetOn: store.settings().widgetOn || Date.now() });
  },
  pushOn: async (el) => {
    el.disabled = true;
    try { await notify.turnOn(); toast('Reminders are on for this device'); } catch (e) { toast(e.message); }
    el.disabled = false;
    render();
  },
  pushOff: async () => { try { await notify.turnOff(); } catch { /* already off */ } toast('Reminders are off for this device'); render(); },
  pushTest: async (el) => {
    el.disabled = true;
    try { const n = await notify.test(); toast(n ? `Sent to ${n} device${n === 1 ? '' : 's'}. It can take a few seconds.` : 'No device has reminders on yet.'); } catch (e) { toast(e.message); }
    el.disabled = false;
  },
  backup: () => { flush(); download(`daily-planner-backup-${D.iso()}.json`, JSON.stringify({ app: 'daily-planner', v: 1, made: new Date().toISOString(), recs: store.everything() }), 'application/json'); },
};
const SUBMIT = {
  addTask: (f) => {
    const p = parse(f.t.value);
    if (!p.title) return;
    const tags = !f.dataset.proj && tasks.st.tag && !p.tags.includes(tasks.st.tag) ? [...p.tags, tasks.st.tag] : p.tags;
    f.t.value = '';
    store.change(() => store.put({ id: store.uid(), k: 'task', made: Date.now(), title: p.title, date: p.date, time: p.time, rule: p.rule, star: p.star, tags, notes: '', done: null, proj: f.dataset.proj || null }));
  },
  addItem: (f) => {
    const title = f.t.value.trim();
    if (!title) return;
    f.t.value = '';
    store.change(() => store.put({ id: store.uid(), k: 'item', list: f.dataset.list, made: Date.now(), title, on: false }));
  },
};
const CHANGE = {
  theme: (el) => recolor(() => { applyTheme(el.value, ownColors()); store.setSettings({ theme: el.value }); }),
  accent: (el) => recolor(() => { store.setSettings({ accent: el.value || null }); applyTheme(store.settings().theme, ownColors()); }),
  bg: (el) => recolor(() => { store.setSettings({ bg: el.value || null }); applyTheme(store.settings().theme, ownColors()); }),
  ink: (el) => recolor(() => { store.setSettings({ ink: el.value || null }); applyTheme(store.settings().theme, ownColors()); }),
  hl: (el) => recolor(() => { store.setSettings({ hl: el.value || null }); applyTheme(store.settings().theme, ownColors()); }),
  remEv: (el) => store.setSettings({ remEv: +el.value }),
  remTask: (el) => store.setSettings({ remTask: +el.value }),
  remDay: (el) => store.setSettings({ remDay: el.value }),
  remTf: (el) => { if (el.value === 'off') store.setSettings({ tfOff: true }); else store.setSettings({ tfOff: false, remTf: +el.value }); planTefillin(); },
  city: (el) => { if (el.value !== 'keep') store.setSettings({ loc: el.value ? J.cityLoc(el.value) : null }); },
  candles: (el) => store.setSettings({ candles: +el.value }),
  ends: (el) => store.setSettings({ ends: el.value }),
  spelling: (el) => store.setSettings({ spelling: el.value }),
  cal: (el) => { const h = store.settings().hideCals.filter((c) => c !== el.value); store.setSettings({ hideCals: el.checked ? h : [...h, el.value] }); },
  moveNote: (el) => { flush(); const n = store.get(el.dataset.id); if (n) store.change(() => store.put({ ...n, folder: el.value || null })); },
  pickDate: (el) => { if (D.isRealDate(el.value)) { flush(); today.st.day = el.value; render(); } },
  openJournal: (el) => { if (D.isRealDate(el.value) && el.value <= D.iso()) location.hash = '#/notes/journal/' + el.value; },
  addFiles: async (el) => {
    const list = [...el.files];
    el.value = '';
    if (!list.length) return;
    toast(list.length > 1 ? `Adding ${list.length} files…` : 'Adding…');
    try {
      const big = await files.add(el.dataset.proj, list);
      toast(big ? `${big === list.length ? 'Not added' : 'Added the rest'}: files over ${files.size(files.MAX)} are too big.` : list.length > 1 ? `Added ${list.length} files` : 'Added');
    } catch { toast('Could not save that here. This device may be out of space.'); }
  },
  restore: async (el) => {
    const file = el.files[0];
    if (!file) return;
    try { store.importBackup(JSON.parse(await file.text())); toast('Backup restored'); sync.soon(); }
    catch { toast('That file is not a Daily Planner backup.'); }
    el.value = '';
  },
};
const LIVE = { noteSearch: (el) => { notes.st.q = el.value.trim(); render(); } };

// Swipe a task like in Things and TickTick: right to finish it, left to push it to tomorrow.
let swipe = null, swipedRow = null;
main.addEventListener('pointerdown', (e) => {
  swipedRow = null;
  const li = e.target.closest('li.task');
  const id = li?.querySelector('[data-act=toggleTask]')?.dataset.id;
  if (!id || e.button > 0) return;
  swipe = { li, id, x: e.clientX, y: e.clientY, dx: 0, on: false, pid: e.pointerId };
});
main.addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.pid) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (!swipe.on) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
    if (Math.abs(dx) < 12) return;
    swipe.on = true;
    swipe.li.setPointerCapture(e.pointerId);
    swipe.li.classList.add('swiping');
  }
  swipe.dx = Math.max(-140, Math.min(140, dx));
  swipe.li.style.setProperty('--sx', swipe.dx + 'px');
  swipe.li.dataset.dir = swipe.dx > 0 ? 'done' : 'later';
  swipe.li.classList.toggle('armed', Math.abs(swipe.dx) > 90);
});
function endSwipe(e) {
  if (!swipe || e.pointerId !== swipe.pid) return;
  const s = swipe;
  swipe = null;
  if (!s.on) return;
  s.li.classList.remove('swiping', 'armed');
  s.li.style.removeProperty('--sx');
  swipedRow = s.li;
  if (s.dx > 90) E.toggleTask(s.id);
  else if (s.dx < -90) {
    const t = store.get(s.id);
    if (t && !t.done) { const d = D.addDays(D.iso(), 1); toast('Moved to tomorrow', store.change(() => store.put({ ...t, date: d }))); }
  }
}
main.addEventListener('pointerup', endSwipe);
main.addEventListener('pointercancel', endSwipe);
// The click that ends a swipe is not a tap.
main.addEventListener('click', (e) => { const r = swipedRow; swipedRow = null; if (r && r.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && Object.hasOwn(ACT, el.dataset.act)) ACT[el.dataset.act](el);
});
// Browsers that only open the date picker from its small icon open it from anywhere on the day's name.
document.addEventListener('click', (e) => { if (e.target.id === 'daypick') try { e.target.showPicker(); } catch { /* opens by itself */ } });
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
  if (e.key === 'n') { e.preventDefault(); ACT.quickAdd({ dataset: {} }); }
  const i = '123456'.indexOf(e.key);
  if (i >= 0) location.hash = '#/' + Object.keys(VIEWS)[i];
});

// Only a field with something typed in it holds back a redraw; the focused field survives redraws anyway.
const busyTyping = () => main.contains(document.activeElement) && document.activeElement.matches('textarea, input') && document.activeElement.value !== '';
store.onChange((why) => {
  if (why !== 'remote') sync.soon();
  if (why === 'quiet') return;
  planSoon();
  if (why === 'remote') { const s = store.settings(), c = store.local.get('colors') || {}; if ((s.theme && s.theme !== document.documentElement.dataset.theme) || (s.accent || null) !== (c.accent || null) || (s.bg || null) !== (c.bg || null) || (s.ink || null) !== (c.ink || null) || (s.hl || null) !== (c.hl || null)) recolor(() => applyTheme(s.theme, ownColors())); }
  // Never redraw under someone typing because another device changed something.
  if (why === 'remote' && busyTyping()) { stale = true; return; }
  render();
});
let pushChecked = false;
sync.watch((appleChanged) => {
  if (sync.state.user && !sync.state.busy) files.upload();
  if (sync.state.user && !pushChecked) { pushChecked = true; notify.refresh(); }
  const line = $('#syncline');
  if (line) { line.textContent = settings.syncText(); line.className = sync.state.error ? 'late' : ''; }
  if (appleChanged || route[0] === 'settings') { if (busyTyping()) stale = true; else render(); }
  else renderNav();
});

/* ---------- picking up a new version ---------- */
const VERSION = document.querySelector('meta[name=app-version]')?.content;
// Versions look like 2026.11.23-22: compared number by number, so -10 comes after -9.
function newer(a, b) {
  const x = String(a).split(/\D+/).map(Number), y = String(b || '').split(/\D+/).map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
async function checkUpdate() {
  if (!navigator.onLine) return;
  let live;
  try {
    const html = await (await fetch('./?check=' + Date.now(), { cache: 'no-store' })).text();
    live = html.match(/name="app-version" content="([^"]+)"/)?.[1];
  } catch { return; }
  // Only ever move forward: a stale copy from the server (an old CDN edge) must not reload the app back and forth.
  if (!live || !newer(live, VERSION)) return;
  // Reload by itself once per version, and never under someone typing.
  let tried = null;
  try { tried = sessionStorage.getItem('planner.reloadedFor'); } catch { /* blocked */ }
  if (tried !== live && !busyTyping() && !$('#sheet').open) {
    try { sessionStorage.setItem('planner.reloadedFor', live); } catch { /* blocked */ }
    flush();
    location.reload();
  } else toast('A new version is ready', Object.assign(() => { flush(); location.reload(); }, { label: 'Reload' }));
}
setTimeout(checkUpdate, 1500);
setInterval(() => { if (document.visibilityState === 'visible') checkUpdate(); }, 30 * 60000);

addEventListener('hashchange', go);
addEventListener('pagehide', () => flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { flush(); return; }
  tick();
  sync.syncNow();
  checkUpdate();
});
addEventListener('online', () => sync.syncNow());
function tick() {
  if (document.visibilityState === 'hidden') return;
  const d = D.iso();
  if (d !== shownDay) { if (calendar.st.sel === shownDay) calendar.select(d); if (today.st.day === shownDay) today.st.day = d; shownDay = d; flush(); render(); }
  // Not in the middle of a swipe either: redrawing would drop the row under the finger.
  else if (route[0] === 'today' && !busyTyping() && !$('#sheet').open && !swipe) render();
}
setInterval(tick, 60000);
setInterval(() => { if (document.visibilityState === 'visible') sync.syncNow(); }, 5 * 60000);

// Starter note folders, added once. Fixed ids keep devices from making copies.
if (!store.local.get('seed.folders')) {
  const have = new Set(store.all('folder').map((f) => f.title.trim().toLowerCase()));
  store.change(() => ['Career', 'Emotions', 'Environmental', 'Mind', 'Money', 'Physical Health', 'Relationships'].forEach((title, i) => {
    const id = 'folder-' + title.toLowerCase().replace(/\W+/g, '-');
    if (!store.everything()[id] && !have.has(title.toLowerCase())) store.put({ id, k: 'folder', made: Date.now() + i, title });
  }), { quiet: true });
  store.local.set('seed.folders', 1);
}

go();
planSoon();
sync.init();
focus.resume();
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
