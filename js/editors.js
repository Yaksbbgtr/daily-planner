// The forms for adding and changing things.
import * as D from './dates.js';
import * as store from './store.js';
import { parse } from './quickadd.js';
import { describe, nextAfter } from './recur.js';
import { day as hebDay } from './jewish.js';
import { $, esc, icon, sheet, closeSheet, toast, download, color } from './ui.js';
import { PICKS, guess, emojiOf } from './emoji.js';

export const COLORS = ['#ff8a5c', '#ffc145', '#5fd3a5', '#4cc9f0', '#b69cff', '#ff7eb6', '#9aa5b1'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const dayPicks = (picked) => `<div class="days" role="group" aria-label="Days">${DAYS.map((d, i) => `<label><input type="checkbox" name="wd" value="${i}" ${picked.includes(i) ? 'checked' : ''} aria-label="${DAYNAMES[i]}"><span>${d}</span></label>`).join('')}</div>`;
const readDays = (f) => [...f.querySelectorAll('[name=wd]:checked')].map((x) => +x.value);

function repeatFields(rule, hebrew) {
  const opts = [['', 'Does not repeat'], ['daily', 'Days'], ['weekly', 'Weeks'], ['monthly', 'Months'], ['yearly', 'Years'], ...(hebrew ? [['hebrew', 'Hebrew year (birthday, anniversary)'], ['yahrzeit', 'Yahrzeit']] : [])];
  return `<div class="row2"><label>Repeat <select name="f">${opts.map(([v, t]) => `<option value="${v}" ${rule?.f === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label data-when="n">Every <input type="number" name="n" min="1" max="99" inputmode="numeric" value="${rule?.n || 1}"></label></div>
    <div data-when="wd">${dayPicks(rule?.days || [])}</div>
    <label data-when="until">Until (optional) <input type="date" name="until" value="${esc(rule?.until || '')}"></label>`;
}
function wireRepeat(form) {
  const upd = () => {
    const f = form.f.value;
    const show = { n: ['daily', 'weekly', 'monthly', 'yearly'].includes(f), wd: f === 'weekly', until: !!f };
    form.querySelectorAll('[data-when]').forEach((el) => { el.hidden = !show[el.dataset.when]; });
  };
  form.f.addEventListener('change', upd);
  upd();
}
function readRepeat(form, old, date) {
  const f = form.f.value;
  if (!f) return null;
  const n = Math.min(99, Math.max(1, parseInt(form.n.value, 10) || 1));
  const days = f === 'weekly' ? readDays(form) : [];
  const until = D.isRealDate(form.until.value) && form.until.value >= date ? form.until.value : null;
  return { f, n, ...(days.length ? { days } : {}), ...(until ? { until } : {}), ...(old?.ex?.length ? { ex: old.ex } : {}) };
}
// A round picture for the item: picked from a grid, or guessed from the title ("Auto").
function iconField(rec, kind) {
  const cur = rec.emoji || '';
  return `<div class="picked"><span class="bubble" data-preview style="--c:${color(rec.color)}">${emojiOf({ ...rec, k: kind })}</span><div class="grow"><b>Icon</b><p class="hint">Pick one, or leave it on Auto</p></div></div>
    <div class="emojis" role="radiogroup" aria-label="Icon"><label class="auto"><input type="radio" name="emoji" value="" ${cur ? '' : 'checked'} aria-label="Auto"><span>Auto</span></label>${PICKS.map((e) => `<label><input type="radio" name="emoji" value="${e}" ${cur === e ? 'checked' : ''} aria-label="${e}"><span>${e}</span></label>`).join('')}</div>`;
}
function wireIcon(form, kind) {
  const upd = () => {
    const b = form.querySelector('[data-preview]');
    b.textContent = form.emoji.value || guess(form.title.value, kind);
    const c = form.querySelector('[name=color]:checked');
    if (c) b.style.setProperty('--c', c.value);
  };
  form.addEventListener('change', upd);
  form.title.addEventListener('input', upd);
}
const colorField = (cur) => `<div class="colors" role="radiogroup" aria-label="Color">${COLORS.map((c, i) => `<label><input type="radio" name="color" value="${c}" ${(cur || COLORS[0]) === c ? 'checked' : ''} aria-label="Color ${i + 1}"><span style="background:${c}"></span></label>`).join('')}</div>`;
const fail = (form, msg) => { const e = $('.err', form); e.textContent = msg; e.hidden = false; return false; };
const ERR = '<p class="err" role="alert" hidden></p>';

/* ---------- quick add ---------- */
export function quickAdd({ kind = null, date = null } = {}) {
  let picked = kind;
  sheet('Add', `<input id="qa" name="text" autofocus autocomplete="off" enterkeyhint="done" placeholder="Dentist tomorrow 3pm" aria-label="What to add">
    <div class="seg" role="group" aria-label="Type">${[['task', 'Task'], ['event', 'Event'], ['note', 'Note']].map(([k, t]) => `<button type="button" data-kind="${k}">${t}</button>`).join('')}</div>
    <div class="picked qa-preview"><span class="bubble" data-qabub aria-hidden="true">✅</span><p class="preview grow" aria-live="polite"></p></div>${ERR}`, {
    save: 'Add',
    on: { save: (form) => {
      const r = build(form.text.value, picked, date);
      if (!r.rec.title) return fail(form, 'Type something first.');
      const undo = store.change(() => store.put(r.rec));
      toast(`Added to ${{ task: 'tasks', event: 'calendar', note: 'notes' }[r.kind]}`, undo);
    } },
    setup: (form, d) => {
      const upd = () => {
        const r = build(form.text.value, picked, date);
        form.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.kind === r.kind));
        $('.preview', form).textContent = summary(r);
        $('[data-qabub]', form).textContent = r.kind === 'note' ? '📝' : guess(r.rec.title, r.kind);
        $('.err', form).hidden = true;
      };
      form.text.oninput = upd;
      form.querySelectorAll('[data-kind]').forEach((b) => { b.onclick = () => { picked = b.dataset.kind; upd(); form.text.focus(); }; });
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'plain more'; more.textContent = 'More options';
      more.onclick = () => {
        const r = build(form.text.value, picked, date);
        closeSheet();
        if (r.kind === 'note') { store.change(() => store.put(r.rec)); location.hash = '#/notes/' + r.rec.id; }
        else (r.kind === 'event' ? editEvent : editTask)(r.rec, { isNew: true });
      };
      $('.body', d).append(more);
      upd();
    },
  });
}
function build(text, picked, date) {
  const p = parse(text);
  const kind = picked || p.kind;
  const id = store.uid(), made = Date.now();
  if (kind === 'note') return { kind, rec: { id, k: 'note', made, title: text.trim(), body: '' } };
  if (kind === 'event') return { kind, rec: { id, k: 'event', made, title: p.title, date: p.date || date || D.iso(), time: p.time, end: p.end || p.defaultEnd || null, rule: p.rule, color: COLORS[0], loc: '', notes: '' } };
  return { kind, rec: { id, k: 'task', made, title: p.title, date: p.date || date, time: p.time, rule: p.rule, star: p.star, tags: p.tags, notes: '', done: null } };
}
function summary({ kind, rec }) {
  if (!rec.title) return 'Dates, times, #tags, “every Monday” and ! are understood.';
  if (kind === 'note') return 'Saved as a note';
  const bits = [rec.date ? D.friendly(rec.date) : 'No date'];
  if (rec.time) bits.push(D.time(rec.time) + (rec.end ? ' to ' + D.time(rec.end) : ''));
  else if (kind === 'event') bits.push('All day');
  if (rec.rule) bits.push(describe(rec.rule));
  if (rec.star) bits.push('Starred');
  if (rec.tags?.length) bits.push(rec.tags.map((t) => '#' + t).join(' '));
  return `${rec.title}: ${bits.join(', ')}`;
}

/* ---------- tasks ---------- */
export function toggleTask(id) {
  const t = store.get(id);
  if (!t) return;
  if (t.done) { store.change(() => store.put({ ...t, done: null })); return; }
  const today = D.iso();
  const next = t.rule && t.date ? nextAfter(t.date, t.rule, t.date > today ? t.date : today) : null;
  const undo = store.change(() => {
    if (next) {
      store.put({ ...t, id: store.uid(), rule: null, done: Date.now() });
      store.put({ ...t, date: next });
    } else store.put({ ...t, done: Date.now() });
  });
  toast(next ? `Done. Next: ${D.friendly(next)}` : 'Task done', undo);
}
export function editTask(t, { isNew } = {}) {
  const LEN = [['', 'No length'], [15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [90, '1½ hours'], [120, '2 hours'], [180, '3 hours']];
  let subs = (t.checklist || []).map((x) => ({ ...x }));
  const subRows = () => subs.map((x, i) => `<div class="subrow"><input type="checkbox" data-sub="${i}" ${x.on ? 'checked' : ''} aria-label="Done"><input type="text" data-subt="${i}" value="${esc(x.t)}" aria-label="Step ${i + 1}"><button type="button" class="icon faint" data-subdel="${i}" aria-label="Remove step">${icon('close')}</button></div>`).join('');
  sheet(isNew ? 'New task' : 'Task', `<label>Task <input name="title" ${isNew ? 'autofocus' : ''} value="${esc(t.title)}"></label>
    ${iconField(t, 'task')}
    <div class="row2"><label>Day <input type="date" name="date" value="${esc(t.date || '')}"></label><label>Time <input type="time" name="time" value="${esc(t.time || '')}"></label></div>
    <label>How long <select name="dur">${LEN.map(([v, n]) => `<option value="${v}" ${String(t.dur || '') === String(v) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    ${repeatFields(t.rule)}
    <fieldset><legend>Steps</legend><div class="sublist" data-subs>${subRows()}</div><div class="inline" style="margin:8px 0 0"><input data-newsub placeholder="Add a step" aria-label="Add a step"><button type="button" class="plain" data-addsub>Add</button></div></fieldset>
    <fieldset><legend>Color</legend>${colorField(t.color)}</fieldset>
    <label>Tags <input name="tags" value="${esc((t.tags || []).join(' '))}" placeholder="home school" autocapitalize="off"></label>
    <label class="check"><input type="checkbox" name="star" ${t.star ? 'checked' : ''}> Star this task</label>
    <label>Notes <textarea name="notes" rows="3">${esc(t.notes)}</textarea></label>
    ${isNew || t.done ? '' : '<button type="button" class="primary" data-focus>🎯 Focus on this</button>'}${ERR}`, {
    setup: (f) => {
      wireRepeat(f);
      wireIcon(f, 'task');
      const box = f.querySelector('[data-subs]'), add = f.querySelector('[data-newsub]');
      const redraw = () => { box.innerHTML = subRows(); };
      box.addEventListener('input', (e) => { const i = e.target.dataset.subt; if (i !== undefined) subs[i].t = e.target.value; });
      box.addEventListener('change', (e) => { const i = e.target.dataset.sub; if (i !== undefined) subs[i].on = e.target.checked; });
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-subdel]'); if (b) { subs.splice(+b.dataset.subdel, 1); redraw(); } });
      const push = () => { const v = add.value.trim(); if (!v) return; subs.push({ id: store.uid(), t: v, on: false }); add.value = ''; redraw(); add.focus(); };
      f.querySelector('[data-addsub]').onclick = push;
      add.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); push(); } });
      const fb = f.querySelector('[data-focus]');
      if (fb) fb.onclick = () => { closeSheet(); import('./focus.js').then((m) => m.start(t.id)); };
    },
    del: isNew ? null : 'Delete',
    on: {
      save: (f) => {
        const title = f.title.value.trim();
        if (!title) return fail(f, 'Give the task a name.');
        const date = f.date.value || (f.f.value || f.time.value ? D.iso() : null);
        const tags = [...new Set(f.tags.value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [])];
        const checklist = subs.map((x) => ({ ...x, t: x.t.trim() })).filter((x) => x.t);
        store.change(() => store.put({ ...t, title, date, time: f.time.value || null, dur: +f.dur.value || null, rule: readRepeat(f, t.rule, date), star: f.star.checked, tags, notes: f.notes.value.trim(), emoji: f.emoji.value || null, color: f.color.value, checklist }));
      },
      del: () => toast('Task deleted', store.change(() => store.remove(t.id))),
    },
  });
}

/* ---------- events ---------- */
export function editEvent(e, { isNew, occ } = {}) {
  const repeats = !isNew && !!e.rule;
  sheet(isNew ? 'New event' : 'Event', `<label>Event <input name="title" ${isNew ? 'autofocus' : ''} value="${esc(e.title)}"></label>
    ${iconField(e, 'event')}
    <label class="check"><input type="checkbox" name="allday" ${e.time ? '' : 'checked'}> All day</label>
    <div class="row2"><label>Starts <input type="date" name="date" value="${esc(e.date)}"></label><label data-timed>Time <input type="time" name="time" value="${esc(e.time || '')}"></label></div>
    <div class="row2"><label>Ends <input type="date" name="endDate" value="${esc(e.endDate || e.date)}"></label><label data-timed>Time <input type="time" name="end" value="${esc(e.end || '')}"></label></div>
    <p class="hint" data-heb></p>
    ${repeatFields(e.rule, true)}
    ${repeats ? '<p class="hint">Changes apply to every time this event repeats.</p>' : ''}
    <label>Location <input name="loc" value="${esc(e.loc)}"></label>
    <fieldset><legend>Color</legend>${colorField(e.color)}</fieldset>
    <label class="check"><input type="checkbox" name="countdown" ${e.countdown ? 'checked' : ''}> Count down to it on Today</label>
    <label>Notes <textarea name="notes" rows="3">${esc(e.notes)}</textarea></label>
    ${isNew ? '' : `<div class="links"><button type="button" class="plain" data-ics>Add to Apple Calendar</button>${repeats && occ ? `<button type="button" class="plain" data-skip>Skip ${esc(D.shortDay(occ))}</button>` : ''}</div>`}${ERR}`, {
    setup: (f) => {
      wireRepeat(f);
      wireIcon(f, 'event');
      const timed = () => {
        f.querySelectorAll('[data-timed]').forEach((x) => { x.hidden = f.allday.checked; });
        if (!f.allday.checked && !f.time.value) { f.time.value = '09:00'; f.end.value = '10:00'; }
      };
      f.allday.onchange = timed;
      timed();
      let prev = f.date.value;
      const heb = () => { $('[data-heb]', f).textContent = D.isRealDate(f.date.value) ? hebDay(f.date.value).full : ''; };
      heb();
      f.date.onchange = () => {
        // Moving the start keeps the length.
        if (D.isRealDate(f.date.value) && D.isRealDate(prev) && D.isRealDate(f.endDate.value)) f.endDate.value = D.addDays(f.endDate.value, D.diffDays(prev, f.date.value));
        prev = f.date.value;
        heb();
      };
      const ics = $('[data-ics]', f);
      if (ics) ics.onclick = () => download('event.ics', toIcs(e, occ || e.date), 'text/calendar');
      const skip = $('[data-skip]', f);
      if (skip) skip.onclick = () => { closeSheet(); toast(`Skipped ${D.shortDay(occ)}`, store.change(() => store.put({ ...e, rule: { ...e.rule, ex: [...(e.rule.ex || []), occ] } }))); };
    },
    del: isNew ? null : repeats ? 'Delete all' : 'Delete',
    on: {
      save: (f) => {
        const title = f.title.value.trim();
        if (!title) return fail(f, 'Give the event a name.');
        const date = f.date.value;
        if (!D.isRealDate(date)) return fail(f, 'Pick a start date.');
        const endDate = D.isRealDate(f.endDate.value) ? f.endDate.value : date;
        if (endDate < date) return fail(f, 'The event ends before it starts.');
        const time = f.allday.checked ? null : f.time.value || null;
        const end = time ? f.end.value || null : null;
        if (time && end && endDate === date && end <= time) return fail(f, 'The end time is not after the start time.');
        store.change(() => store.put({ ...e, title, date, endDate: endDate > date ? endDate : null, time, end, rule: readRepeat(f, e.rule, date), loc: f.loc.value.trim(), color: f.color.value, notes: f.notes.value.trim(), emoji: f.emoji.value || null, countdown: f.countdown.checked }));
      },
      del: () => toast('Event deleted', store.change(() => store.remove(e.id))),
    },
  });
}
export function showApple(e, day) {
  sheet('Apple Calendar', `<h3>${esc(e.title)}</h3><p>${esc(D.friendly(day))}${e.time ? ', ' + D.time(e.time) + (e.end ? ' to ' + D.time(e.end) : '') : ', all day'}</p>${e.loc ? `<p>${esc(e.loc)}</p>` : ''}<p class="hint">From “${esc(e.cal)}”. Change it in Apple Calendar; Daily Planner shows the update after the Mac helper next runs.</p>`);
}

export function toIcs(e, occ) {
  const q = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const d8 = (s) => s.replaceAll('-', '');
  const span = e.endDate ? D.diffDays(e.date, e.endDate) : 0;
  const last = D.addDays(occ, span);
  const t6 = (t) => t.replace(':', '') + '00';
  const r = e.rule;
  const FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };
  const rr = r && FREQ[r.f] ? `RRULE:FREQ=${FREQ[r.f]};INTERVAL=${r.n || 1}${r.days?.length ? ';BYDAY=' + r.days.map((x) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][x]).join(',') : ''}${r.until ? ';UNTIL=' + d8(r.until) + (e.time ? 'T235959' : '') : ''}` : null;
  const ex = rr ? (r.ex || []).filter((x) => x >= occ).map((x) => (e.time ? `EXDATE:${d8(x)}T${t6(e.time)}` : `EXDATE;VALUE=DATE:${d8(x)}`)) : [];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Daily Planner//EN', 'BEGIN:VEVENT', `UID:${e.id}@daily-planner`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`,
    ...(e.time ? [`DTSTART:${d8(occ)}T${t6(e.time)}`, `DTEND:${d8(last)}T${t6(e.end || D.addMinutes(e.time, 60))}`] : [`DTSTART;VALUE=DATE:${d8(occ)}`, `DTEND;VALUE=DATE:${d8(D.addDays(last, 1))}`]),
    ...(rr ? [rr, ...ex] : []), `SUMMARY:${q(e.title)}`, ...(e.loc ? [`LOCATION:${q(e.loc)}`] : []), ...(e.notes ? [`DESCRIPTION:${q(e.notes)}`] : []), 'END:VEVENT', 'END:VCALENDAR'];
  return lines.join('\r\n') + '\r\n';
}

/* ---------- habits ---------- */
export function editHabit(h) {
  const isNew = !h;
  h ||= { id: store.uid(), k: 'habit', made: Date.now(), title: '', days: [0, 1, 2, 3, 4, 5, 6] };
  sheet(isNew ? 'New habit' : 'Habit', `<label>Habit <input name="title" ${isNew ? 'autofocus' : ''} value="${esc(h.title)}" placeholder="Walk 20 minutes"></label>${isNew ? '' : habitStats(h)}${iconField(h, 'habit')}<fieldset><legend>On these days</legend>${dayPicks(h.days)}</fieldset>${ERR}`, {
    setup: (f) => wireIcon(f, 'habit'),
    del: isNew ? null : 'Delete',
    on: {
      save: (f) => {
        const title = f.title.value.trim(), days = readDays(f);
        if (!title) return fail(f, 'Give the habit a name.');
        if (!days.length) return fail(f, 'Pick at least one day.');
        store.change(() => store.put({ ...h, title, days, emoji: f.emoji.value || null }));
      },
      del: () => toast('Habit deleted', store.change(() => { store.remove(h.id); })),
    },
  });
}
export const hid = (id, day) => `h:${id}:${day}`;
// The last five weeks as a grid of dots, with the longest run and the total (after TickTick's habit stats).
function habitStats(h) {
  const today = D.iso();
  const start = D.addDays(D.startOfWeek(today), -28);
  let total = 0, best = 0, run = 0;
  const logs = store.all('habitlog').filter((x) => x.id.startsWith(`h:${h.id}:`)).map((x) => x.id.slice(-10)).sort();
  total = logs.length;
  if (logs.length) for (let d = logs[0]; d <= today; d = D.addDays(d, 1)) {
    if (!h.days.includes(D.dow(d))) continue;
    if (store.get(hid(h.id, d))) { run++; best = Math.max(best, run); } else if (d !== today) run = 0;
  }
  const cells = Array.from({ length: 35 }, (_, i) => D.addDays(start, i)).map((d) => `<i class="${d > today ? 'fut' : store.get(hid(h.id, d)) ? 'on' : h.days.includes(D.dow(d)) ? '' : 'off'}" title="${esc(D.shortDay(d))}"></i>`).join('');
  return `<div class="hstats"><div class="nums"><div><b>${streak(h, today)}</b><span>now</span></div><div><b>${best}</b><span>best run</span></div><div><b>${total}</b><span>total</span></div></div><div class="heat" aria-label="Last five weeks">${cells}</div></div>`;
}
export function toggleHabit(id, day) {
  const key = hid(id, day);
  store.change(() => (store.get(key) ? store.remove(key) : store.put({ id: key, k: 'habitlog' })));
}
export function streak(h, today = D.iso()) {
  let n = 0;
  for (let d = today, i = 0; i < 1500; d = D.addDays(d, -1), i++) {
    if (!h.days.includes(D.dow(d))) continue;
    if (store.get(hid(h.id, d))) n++;
    else if (d !== today) break;
  }
  return n;
}

/* ---------- shared rows ---------- */
export function taskRow(t, { showDate = true } = {}) {
  const today = D.iso();
  const meta = [];
  if (showDate && t.date) meta.push(`<span class="${!t.done && t.date < today ? 'late' : ''}">${esc(D.friendly(t.date))}</span>`);
  if (t.time) meta.push(D.time(t.time) + (t.dur ? ` · ${t.dur} min` : ''));
  if (t.checklist?.length) meta.push(`☑︎ ${t.checklist.filter((x) => x.on).length}/${t.checklist.length}`);
  if (t.rule) meta.push(`${icon('repeat')}${esc(describe(t.rule))}`);
  meta.push(...(t.tags || []).map((x) => `#${esc(x)}`));
  return `<li class="task ${t.done ? 'done' : ''}"><button class="tick" data-act="toggleTask" data-id="${esc(t.id)}" role="checkbox" aria-checked="${!!t.done}" aria-label="${esc(t.title)}"></button>
    <button class="text" data-act="editTask" data-id="${esc(t.id)}" style="--c:${color(t.color)}"><span class="bubble" aria-hidden="true">${emojiOf(t)}</span><span class="tx"><span class="t">${t.star ? '<span class="star" aria-label="Starred">★</span> ' : ''}${esc(t.title)}</span>${meta.length ? `<span class="meta">${meta.join('<i></i>')}</span>` : ''}</span></button></li>`;
}
