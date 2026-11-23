// The forms for adding and changing things.
import * as D from './dates.js';
import * as store from './store.js';
import { parse } from './quickadd.js';
import { describe, nextAfter } from './recur.js';
import { day as hebDay } from './jewish.js';
import { $, esc, icon, sheet, closeSheet, toast, download } from './ui.js';

export const COLORS = ['#d4af37', '#e8e2d0', '#c8796b', '#8fa98a', '#6aa6c6', '#a38cc6', '#8a8a8a'];
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
const fail = (form, msg) => { const e = $('.err', form); e.textContent = msg; e.hidden = false; return false; };
const ERR = '<p class="err" role="alert" hidden></p>';

/* ---------- quick add ---------- */
export function quickAdd({ kind = null, date = null } = {}) {
  let picked = kind;
  sheet('Add', `<input id="qa" name="text" autofocus autocomplete="off" enterkeyhint="done" placeholder="Dentist tomorrow 3pm" aria-label="What to add">
    <div class="seg" role="group" aria-label="Type">${[['task', 'Task'], ['event', 'Event'], ['note', 'Note']].map(([k, t]) => `<button type="button" data-kind="${k}">${t}</button>`).join('')}</div>
    <p class="preview" aria-live="polite"></p>${ERR}`, {
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
  sheet(isNew ? 'New task' : 'Task', `<label>Task <input name="title" ${isNew ? 'autofocus' : ''} value="${esc(t.title)}"></label>
    <div class="row2"><label>Due <input type="date" name="date" value="${esc(t.date || '')}"></label><label>Time <input type="time" name="time" value="${esc(t.time || '')}"></label></div>
    ${repeatFields(t.rule)}
    <label>Tags <input name="tags" value="${esc((t.tags || []).join(' '))}" placeholder="home school" autocapitalize="off"></label>
    <label class="check"><input type="checkbox" name="star" ${t.star ? 'checked' : ''}> Star this task</label>
    <label>Notes <textarea name="notes" rows="3">${esc(t.notes)}</textarea></label>${ERR}`, {
    setup: wireRepeat,
    del: isNew ? null : 'Delete',
    on: {
      save: (f) => {
        const title = f.title.value.trim();
        if (!title) return fail(f, 'Give the task a name.');
        const date = f.date.value || (f.f.value || f.time.value ? D.iso() : null);
        const tags = [...new Set(f.tags.value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [])];
        store.change(() => store.put({ ...t, title, date, time: f.time.value || null, rule: readRepeat(f, t.rule, date), star: f.star.checked, tags, notes: f.notes.value.trim() }));
      },
      del: () => toast('Task deleted', store.change(() => store.remove(t.id))),
    },
  });
}

/* ---------- events ---------- */
export function editEvent(e, { isNew, occ } = {}) {
  const repeats = !isNew && !!e.rule;
  sheet(isNew ? 'New event' : 'Event', `<label>Event <input name="title" ${isNew ? 'autofocus' : ''} value="${esc(e.title)}"></label>
    <label class="check"><input type="checkbox" name="allday" ${e.time ? '' : 'checked'}> All day</label>
    <div class="row2"><label>Starts <input type="date" name="date" value="${esc(e.date)}"></label><label data-timed>Time <input type="time" name="time" value="${esc(e.time || '')}"></label></div>
    <div class="row2"><label>Ends <input type="date" name="endDate" value="${esc(e.endDate || e.date)}"></label><label data-timed>Time <input type="time" name="end" value="${esc(e.end || '')}"></label></div>
    <p class="hint" data-heb></p>
    ${repeatFields(e.rule, true)}
    ${repeats ? '<p class="hint">Changes apply to every time this event repeats.</p>' : ''}
    <label>Location <input name="loc" value="${esc(e.loc)}"></label>
    <div class="colors" role="group" aria-label="Color">${COLORS.map((c, i) => `<label><input type="radio" name="color" value="${c}" ${(e.color || COLORS[0]) === c ? 'checked' : ''} aria-label="Color ${i + 1}"><span style="background:${c}"></span></label>`).join('')}</div>
    <label>Notes <textarea name="notes" rows="3">${esc(e.notes)}</textarea></label>
    ${isNew ? '' : `<div class="links"><button type="button" class="plain" data-ics>Add to Apple Calendar</button>${repeats && occ ? `<button type="button" class="plain" data-skip>Skip ${esc(D.shortDay(occ))}</button>` : ''}</div>`}${ERR}`, {
    setup: (f) => {
      wireRepeat(f);
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
        store.change(() => store.put({ ...e, title, date, endDate: endDate > date ? endDate : null, time, end, rule: readRepeat(f, e.rule, date), loc: f.loc.value.trim(), color: f.color.value, notes: f.notes.value.trim() }));
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
  sheet(isNew ? 'New habit' : 'Habit', `<label>Habit <input name="title" ${isNew ? 'autofocus' : ''} value="${esc(h.title)}" placeholder="Walk 20 minutes"></label><fieldset><legend>On these days</legend>${dayPicks(h.days)}</fieldset>${ERR}`, {
    del: isNew ? null : 'Delete',
    on: {
      save: (f) => {
        const title = f.title.value.trim(), days = readDays(f);
        if (!title) return fail(f, 'Give the habit a name.');
        if (!days.length) return fail(f, 'Pick at least one day.');
        store.change(() => store.put({ ...h, title, days }));
      },
      del: () => toast('Habit deleted', store.change(() => { store.remove(h.id); })),
    },
  });
}
export const hid = (id, day) => `h:${id}:${day}`;
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
  if (t.time) meta.push(D.time(t.time));
  if (t.rule) meta.push(`${icon('repeat')}${esc(describe(t.rule))}`);
  meta.push(...(t.tags || []).map((x) => `#${esc(x)}`));
  return `<li class="task ${t.done ? 'done' : ''}"><button class="tick" data-act="toggleTask" data-id="${esc(t.id)}" role="checkbox" aria-checked="${!!t.done}" aria-label="${esc(t.title)}"></button>
    <button class="text" data-act="editTask" data-id="${esc(t.id)}"><span class="t">${t.star ? '<span class="star" aria-label="Starred">★</span> ' : ''}${esc(t.title)}</span>${meta.length ? `<span class="meta">${meta.join('<i></i>')}</span>` : ''}</button></li>`;
}
