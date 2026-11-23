// A full-screen focus timer with a big ring, like the focus timers in TickTick and Tiimo.
// The end time is saved, so the timer keeps going if the app is closed and opened again.
import * as store from './store.js';
import { emojiOf, glyph } from './emoji.js';
import { esc, toast } from './ui.js';
import { toggleTask } from './editors.js';

const { local } = store;
const LENGTHS = [5, 15, 25, 45, 60];
let tick = null;

const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const state = () => local.get('focus');
const save = (f) => local.set('focus', f);

export function start(taskId) {
  const f = state();
  if (f && f.task !== taskId && (f.end || f.paused)) { show(); return; }
  save({ task: taskId, mins: f?.task === taskId ? f.mins : 25, end: null, paused: null });
  show();
}

function stop() {
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
  el.querySelectorAll('[data-len]').forEach((b) => { b.setAttribute('aria-pressed', +b.dataset.len === f.mins); b.disabled = !!(f.end || f.paused); });
}

function finish() {
  const f = state();
  stop();
  const t = f && store.get(f.task);
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
  if (t && !t.done) toast(`Time is up for “${t.title}”`, Object.assign(() => toggleTask(t.id), { label: 'Mark done' }));
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
    <div class="lengths" role="group" aria-label="Length">${LENGTHS.map((m) => `<button type="button" data-len="${m}">${m} min</button>`).join('')}</div>
    <div class="controls"><button type="button" class="primary" data-f="go">Start</button><button type="button" class="pillbtn" data-f="done">Done</button><button type="button" class="pillbtn" data-f="hide">Hide</button><button type="button" class="pillbtn" data-f="stop">Stop</button></div></div>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const cur = state();
    if (b.dataset.len) { save({ ...cur, mins: +b.dataset.len }); draw(); return; }
    const act = b.dataset.f;
    if (act === 'go') {
      if (cur.end) save({ ...cur, paused: cur.end - Date.now(), end: null });
      else save({ ...cur, end: Date.now() + (cur.paused ?? cur.mins * 60000), paused: null });
      draw();
    } else if (act === 'hide') { el.remove(); pill(); }
    else if (act === 'stop') stop();
    else if (act === 'done') { const id = cur.task; stop(); if (!store.get(id)?.done) toggleTask(id); }
  });
  document.body.append(el);
  draw();
  loop();
  el.querySelector('[data-f=go]').focus();
}

// Pick up a timer left running.
export function resume() { if (state()?.end || state()?.paused) { pill(); loop(); } }
