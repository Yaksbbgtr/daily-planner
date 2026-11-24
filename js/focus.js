// A full-screen focus timer with a big ring, like the focus timers in TickTick and Tiimo.
// The end time is saved, so the timer keeps going if the app is closed and opened again.
import * as store from './store.js';
import { emojiOf, glyph } from './emoji.js';
import { esc, toast } from './ui.js';
import { toggleTask, logTime, progOf, spentText, progBar } from './editors.js';

const { local } = store;
const LENGTHS = [5, 15, 25, 45, 60];
let tick = null;

const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const state = () => local.get('focus');
// How long the timer has been running since it was last started or resumed, in minutes.
const runMins = (f) => (f?.end && f.run ? Math.max(0, Math.min(Date.now(), f.end) - f.run) / 60000 : 0);
// Puts the time focused so far on the task (as minutes and toward its percentage) and starts counting afresh.
function flush(f) {
  const m = runMins(f);
  const r = m >= 0.25 ? logTime(f.task, m, f.mins) : null;
  if (f.end) save({ ...f, run: Date.now() });
  return r;
}
const liveProg = (f, t) => Math.min(100, Math.round(progOf(t) + (runMins(f) / (t.dur || f.mins)) * 100));
const save = (f) => local.set('focus', f);

export function start(taskId) {
  const f = state();
  if (f && f.task !== taskId && (f.end || f.paused)) { show(); return; }
  save({ task: taskId, mins: f?.task === taskId ? f.mins : 25, end: null, paused: null });
  show();
}

function stop() {
  const f = state();
  if (f) flush(f);
  save(null);
  clearInterval(tick); tick = null;
  document.getElementById('focus')?.remove();
  document.getElementById('focuspill')?.remove();
}

function draw() {
  const f = state();
  const el = document.getElementById('focus');
  if (!f || !el) return;
  const total = f.mins * 60000;
  const left = f.end ? f.end - Date.now() : f.paused ?? total;
  if (f.end && left <= 0) return finish();
  const r = 140, c = 2 * Math.PI * r;
  el.querySelector('.fill').setAttribute('stroke-dasharray', `${((c * left) / total).toFixed(1)} ${c.toFixed(1)}`);
  el.querySelector('.left').textContent = fmt(left);
  el.querySelector('[data-f=go]').textContent = f.end ? 'Pause' : f.paused ? 'Resume' : 'Start';
  const t = store.get(f.task);
  if (t) {
    const p = liveProg(f, t), sp = (t.spent || 0) + runMins(f);
    el.querySelector('.tprog b').style.width = p + '%';
    el.querySelector('.tprog').setAttribute('aria-valuenow', p);
    el.querySelector('[data-ptext]').textContent = `${p}% done${sp >= 0.5 ? ` · ${spentText(sp)} focused` : ''}`;
    const sl = el.querySelector('[data-plog]');
    if (document.activeElement !== sl) sl.value = p;
  }
  el.querySelectorAll('[data-len]').forEach((b) => { b.setAttribute('aria-pressed', +b.dataset.len === f.mins); b.disabled = !!(f.end || f.paused); });
}

function finish() {
  const f = state();
  const r = f && flush(f);
  save(null);
  stop();
  const t = f && store.get(f.task);
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
  const note = r ? ` · ${r.prog}% done` : '';
  if (t && !t.done) toast(`Time is up for “${t.title}”${note}`, Object.assign(() => toggleTask(t.id), { label: 'Mark done' }));
  else toast('Time is up');
}

function pill() {
  let p = document.getElementById('focuspill');
  const f = state();
  if (!f?.end) { p?.remove(); return; }
  if (!p) {
    p = document.createElement('button');
    p.id = 'focuspill';
    p.onclick = show;
    document.body.append(p);
  }
  const left = f.end - Date.now();
  if (left <= 0) return finish();
  p.innerHTML = `${glyph('target')} ${fmt(left)}`;
}

function loop() {
  clearInterval(tick);
  tick = setInterval(() => { if (document.getElementById('focus')) draw(); else pill(); }, 500);
}

export function show() {
  const f = state();
  if (!f) return;
  const t = store.get(f.task);
  if (!t) { stop(); return; }
  document.getElementById('focuspill')?.remove();
  document.getElementById('focus')?.remove();
  const r = 140, c = 2 * Math.PI * r;
  const el = document.createElement('div');
  el.id = 'focus';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Focus timer');
  el.innerHTML = `<div class="inner"><span class="emoji" aria-hidden="true">${emojiOf(t)}</span><h2>${esc(t.title)}</h2>
    <div class="dial"><svg viewBox="0 0 320 320" aria-hidden="true"><circle cx="160" cy="160" r="${r}" class="track"/><circle cx="160" cy="160" r="${r}" class="fill" stroke-dasharray="${c} ${c}"/></svg><div class="left" role="timer" aria-live="off"></div></div>
    <div class="fprog">${progBar(progOf(t))}<span data-ptext></span><label>Log it yourself <input type="range" data-plog min="0" max="100" step="1" value="${progOf(t)}" aria-label="Percent done"></label></div>
    <div class="lengths" role="group" aria-label="Length">${LENGTHS.map((m) => `<button type="button" data-len="${m}">${m} min</button>`).join('')}</div>
    <div class="controls"><button type="button" class="primary" data-f="go">Start</button><button type="button" class="pillbtn" data-f="done">Done</button><button type="button" class="pillbtn" data-f="hide">Hide</button><button type="button" class="pillbtn" data-f="stop">Stop</button></div></div>`;
  // Setting the percentage by hand: what was focused so far is kept, and the slider's value becomes the new total.
  const sl = el.querySelector('[data-plog]');
  sl.addEventListener('input', () => { el.querySelector('[data-ptext]').textContent = `${sl.value}% done`; el.querySelector('.tprog b').style.width = sl.value + '%'; });
  sl.addEventListener('change', () => {
    const cur = state();
    if (!cur) return;
    flush(cur);
    const task = store.get(cur.task);
    if (task) store.change(() => store.put({ ...task, prog: +sl.value }));
    draw();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const cur = state();
    if (b.dataset.len) { save({ ...cur, mins: +b.dataset.len }); draw(); return; }
    const act = b.dataset.f;
    if (act === 'go') {
      if (cur.end) { flush(cur); save({ ...state(), paused: cur.end - Date.now(), end: null, run: null }); }
      else save({ ...cur, end: Date.now() + (cur.paused ?? cur.mins * 60000), paused: null, run: Date.now() });
      draw();
    } else if (act === 'hide') { el.remove(); pill(); }
    else if (act === 'stop') stop();
    else if (act === 'done') {
      const id = cur.task;
      stop();
      const t2 = store.get(id);
      if (t2 && !t2.done) { if (progOf(t2) < 100) store.change(() => store.put({ ...t2, prog: 100 }), { quiet: true }); toggleTask(id); }
    }
  });
  document.body.append(el);
  draw();
  loop();
  el.querySelector('[data-f=go]').focus();
}

// Pick up a timer left running.
export function resume() { if (state()?.end || state()?.paused) { pill(); loop(); } }
