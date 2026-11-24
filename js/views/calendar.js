import * as D from '../dates.js';
import * as J from '../jewish.js';
import { eventsOn, tasksDue, taskSort } from '../agenda.js';
import * as store from '../store.js';
import { emojiOf } from '../emoji.js';
import { taskRow } from '../editors.js';
import { color, esc, icon } from '../ui.js';
import { eventRows, jewishChips } from './today.js';

export const st = { ym: null, sel: null, mode: 'month' };
export function select(day) { st.sel = day; st.ym = day.slice(0, 7); }

function cell(d, today) {
  const h = J.day(d);
  const ev = eventsOn(d), due = tasksDue(d);
  const hol = h.items.filter((x) => ['yomtov', 'fast', 'minor', 'parsha'].includes(x.kind) && !x.at);
  const chips = [...ev.map((e) => `<span class="pill" style="--c:${color(e.color)}">${esc(e.title)}</span>`), ...due.map((t) => `<span class="pill task">${esc(t.title)}</span>`)];
  const lead = hol.find((x) => x.kind === 'yomtov') || hol.find((x) => x.kind !== 'parsha') || hol[0];
  const label = `${D.shortDay(d)}, ${h.full}${hol.length ? ', ' + hol.map((x) => x.text).join(', ') : ''}, ${ev.length} events, ${due.length} tasks`;
  return `<button class="cell ${d.slice(0, 7) !== st.ym ? 'out' : ''} ${d === today ? 'now' : ''} ${d === st.sel ? 'sel' : ''} ${J.isRestDay(d) ? 'rest' : ''} ${hol.some((x) => x.kind !== 'parsha') ? 'hol' : ''}" data-act="pickDay" data-day="${d}" aria-label="${esc(label)}" ${d === st.sel ? 'aria-current="date"' : ''} tabindex="${d === st.sel ? 0 : -1}">
    <span class="top"><b>${+d.slice(8)}</b><span lang="he">${esc(h.first ? h.short : h.dayNum)}</span></span>
    ${lead ? `<span class="hname">${esc(lead.text.replace(/^(Parshas|Parashat) /, '').replace(/^Chanukah:.*/, 'Chanukah'))}</span>` : ''}
    <span class="pills">${chips.slice(0, 3).join('')}${chips.length > 3 ? `<span class="more">${chips.length - 3} more</span>` : ''}</span></button>`;
}
function dayPane(d) {
  const h = J.day(d);
  const ev = eventRows(d), due = tasksDue(d).sort(taskSort);
  return `<section class="card daypane"><header><div><h2>${esc(D.friendly(d) === D.weekday(d) || /^(Today|Tomorrow|Yesterday)$/.test(D.friendly(d)) ? `${D.friendly(d)}, ${D.monthDay(d)}` : D.friendly(d))}</h2><p class="hint" lang="he">${esc(h.full)}</p></div><button class="plain" data-act="quickAdd" data-kind="event" data-date="${d}">Add</button></header>
    ${h.items.length ? `<div class="chips">${jewishChips(h.items)}</div>` : ''}
    ${ev ? `<ul class="rows">${ev}</ul>` : ''}${due.length ? `<ul class="rows">${due.map((t) => taskRow(t, { showDate: false })).join('')}</ul>` : ''}
    ${!ev && !due.length ? '<p class="empty">Nothing on this day.</p>' : ''}</section>`;
}
function weekTitle(wk) {
  const end = D.addDays(wk, 6);
  const short = (d) => D.monthDay(d).replace(/^(\w{3})\w*/, '$1');
  return wk.slice(0, 7) === end.slice(0, 7) ? `${short(wk)} – ${+end.slice(8)}` : `${short(wk)} – ${short(end)}`;
}
function hebSpan(a, b) { return [...new Set([J.day(a).monthName, J.day(b).monthName])].join(' – '); }
function hebMonths(ym) {
  const last = D.addDays(D.addMonths(ym, 1) + '-01', -1);
  return [...new Set([J.day(ym + '-01').monthName, J.day(last).monthName])].join(' – ');
}
/* ---------- week and day: hours down the side, things placed at their times ---------- */
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const p2 = (n) => String(n).padStart(2, '0');
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hourName = (h) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? 'Noon' : `${h - 12} PM`);
// What sits at a time on a day: events and timed tasks, each with a start and end in minutes.
function timedOn(d) {
  const out = [];
  for (const e of eventsOn(d)) {
    if (!e.time && !(e.cont && e.end)) continue;
    const a = e.time ? mins(e.time) : 0;
    // No end on the first day of something running past midnight: it fills the rest of the day.
    const b = e.end ? mins(e.end) : e.apple || (e.endDate && e.endDate > e.occ) ? 1440 : a + 60;
    out.push({ kind: 'event', a, b: Math.min(1440, Math.max(b > a ? b : 1440, a + 20)), e });
  }
  for (const t of store.all('task')) if (t.date === d && t.time) { const a = mins(t.time); out.push({ kind: 'task', a, b: Math.max(a + (t.dur || 30), a + 20), t }); }
  out.sort((x, y) => x.a - y.a || y.b - x.b);
  // Side by side when they overlap: each group of overlapping things shares the width.
  let group = [], end = -1;
  const close = () => { const lanes = []; for (const it of group) { let i = lanes.findIndex((l) => l <= it.a); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = it.b; it.lane = i; } group.forEach((it) => { it.lanes = lanes.length; }); group = []; };
  for (const it of out) { if (it.a >= end) { close(); end = -1; } group.push(it); end = Math.max(end, it.b); }
  close();
  return out;
}
function allDayOn(d) {
  const ev = eventsOn(d).filter((e) => !e.time && !(e.cont && e.end));
  const ts = tasksDue(d).filter((t) => !t.time);
  return [...ev.map((e) => `<button class="adp" data-act="openEvent" data-id="${esc(e.id)}" data-day="${d}" ${e.occ ? `data-occ="${e.occ}"` : ''} style="--c:${color(e.color)}">${esc(e.title)}</button>`),
    ...ts.map((t) => `<button class="adp task" data-act="editTask" data-id="${esc(t.id)}">${esc(t.title)}</button>`)].join('');
}
function block(it, d, wide) {
  const top = (it.a / 60) * 100, h = ((it.b - it.a) / 60) * 100;
  const pos = `top:calc(${top.toFixed(3)} * var(--hh) / 100);height:calc(${h.toFixed(3)} * var(--hh) / 100 - 2px);left:calc(${it.lane} * 100% / ${it.lanes});width:calc(100% / ${it.lanes} - 2px)`;
  const when = (a, b) => `${D.time(`${p2(Math.floor(a / 60))}:${p2(a % 60)}`)}${b < 1440 ? ' – ' + D.time(`${p2(Math.floor(b / 60))}:${p2(b % 60)}`) : ''}`;
  if (it.kind === 'event') {
    const e = it.e;
    return `<button class="tb ${it.b - it.a < 45 ? 'short' : ''}" data-act="openEvent" data-id="${esc(e.id)}" data-day="${d}" ${e.occ ? `data-occ="${e.occ}"` : ''} style="${pos};--c:${color(e.color)}">${wide ? `<span class="bubble" aria-hidden="true">${emojiOf({ ...e, k: 'event' })}</span>` : ''}<span class="tx"><b dir="auto">${esc(e.title)}</b><span>${esc(when(it.a, it.b))}${wide && e.loc ? ' · ' + esc(e.loc) : ''}</span></span></button>`;
  }
  const t = it.t;
  return `<button class="tb task ${t.done ? 'done' : ''} ${it.b - it.a < 45 ? 'short' : ''}" data-act="editTask" data-id="${esc(t.id)}" style="${pos};--c:${color(t.color)}">${wide ? `<span class="bubble" aria-hidden="true">${emojiOf(t)}</span>` : ''}<span class="tx"><b dir="auto">${esc(t.title)}</b><span>${esc(when(it.a, it.b))}</span></span></button>`;
}
function grid(days, today) {
  const wide = days.length === 1;
  const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
  const head = wide ? '' : `<div class="tg-head"><span></span>${days.map((d) => `<button class="tg-day ${d === today ? 'now' : ''} ${d === st.sel ? 'sel' : ''} ${J.isRestDay(d) ? 'rest' : ''}" data-act="calDay" data-day="${d}" aria-label="${esc(D.shortDay(d))}"><span>${esc(D.weekday(d).slice(0, 3))}</span><b>${+d.slice(8)}</b><i lang="he">${esc(J.day(d).dayNum)}</i></button>`).join('')}</div>`;
  const ad = days.map((d) => `<div class="tg-ad">${allDayOn(d)}</div>`);
  const hasAd = ad.some((x) => x !== '<div class="tg-ad"></div>');
  return `<div class="tgrid ${wide ? 'one' : 'seven'}" style="--n:${days.length}">${head}
    ${hasAd ? `<div class="tg-adrow"><span class="tg-adl">all day</span>${ad.join('')}</div>` : ''}
    <div class="tg-body" id="tgbody"><div class="tg-cols"><div class="tg-hours">${HOURS.map((h) => `<span>${h ? hourName(h) : ''}</span>`).join('')}</div>
    ${days.map((d) => `<div class="tg-col ${d === today ? 'now' : ''}">${HOURS.map((h) => `<button class="tg-slot" data-act="quickAdd" data-kind="event" data-date="${d}" data-time="${p2(h)}:00" aria-label="Add at ${hourName(h)} on ${esc(D.shortDay(d))}" tabindex="-1"></button>`).join('')}
      ${timedOn(d).map((it) => block(it, d, wide)).join('')}${d === today ? `<i class="tg-now" style="top:calc(${((nowM / 60) * 100).toFixed(2)} * var(--hh) / 100)"></i>` : ''}</div>`).join('')}</div></div></div>`;
}
export const scroll = { y: null };
// After drawing: open the hours at the last place you were, or around now (or 7 AM).
export function after(main) {
  const b = main.querySelector('#tgbody');
  if (!b) return;
  const hh = parseFloat(getComputedStyle(b.closest('.tgrid')).getPropertyValue('--hh')) || 56;
  if (scroll.y === null) { const h = st.sel === D.iso() ? Math.max(0, new Date().getHours() - 2) : 7; scroll.y = h * hh; }
  b.scrollTop = scroll.y;
  b.onscroll = () => { scroll.y = b.scrollTop; };
}

export function render() {
  const today = D.iso();
  if (!st.sel) select(today);
  const mode = st.mode;
  const wk = D.startOfWeek(st.sel);
  const title = mode === 'month' ? D.monthYear(st.ym + '-01') : mode === 'week' ? weekTitle(wk) : mode === 'day' ? (/^(Today|Tomorrow|Yesterday)$/.test(D.friendly(st.sel, today)) ? D.friendly(st.sel, today) : D.weekday(st.sel)) : 'Upcoming';
  const sub = mode === 'month' ? hebMonths(st.ym) : mode === 'week' ? hebSpan(wk, D.addDays(wk, 6)) : mode === 'day' ? `${D.monthDay(st.sel)} · ${J.day(st.sel).full}` : '';
  const arrows = mode === 'list' ? '' : `<div class="tools"><button class="roundbtn" data-act="calMove" data-n="-1" aria-label="Previous ${mode}">${icon('left')}</button><button class="roundbtn" data-act="calMove" data-n="1" aria-label="Next ${mode}">${icon('right')}</button></div>`;
  const head = `<header class="bar calhead"><div><h1>${esc(title)}</h1>${sub ? `<p class="hint" lang="he">${esc(sub)}</p>` : ''}</div>${arrows}</header>
    <div class="calbar"><div class="seg" role="group" aria-label="View">${[['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['list', 'List']].map(([m, n]) => `<button data-act="calMode" data-mode="${m}" aria-pressed="${mode === m}">${n}</button>`).join('')}</div>${mode !== 'list' ? '<button class="plain" data-act="calToday">Today</button>' : ''}</div>`;
  if (mode === 'week') return head + grid(Array.from({ length: 7 }, (_, i) => D.addDays(wk, i)), today);
  if (mode === 'day') {
    const items = J.day(st.sel).items;
    return head + `${items.length ? `<div class="chips">${jewishChips(items)}</div>` : ''}` + grid([st.sel], today);
  }
  if (st.mode === 'list') {
    let out = '';
    for (let i = 0; i < 45; i++) {
      const d = D.addDays(today, i), h = J.day(d);
      const ev = eventRows(d), due = tasksDue(d).sort(taskSort), items = h.items.filter((x) => x.kind !== 'omer');
      if (!ev && !due.length && !items.length) continue;
      out += `<section class="up"><header><h3>${esc(D.friendly(d, today))}${i < 7 ? ` <span>${esc(D.monthDay(d))}</span>` : ''}</h3><span lang="he">${esc(h.short)}</span></header>${items.length ? `<div class="chips">${jewishChips(items)}</div>` : ''}<ul class="rows">${ev}${due.map((t) => taskRow(t, { showDate: false })).join('')}</ul></section>`;
    }
    return head + `<div class="card">${out}</div>`;
  }
  return `${head}<div class="calcols"><div class="month"><div class="wds" aria-hidden="true">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((x) => `<span>${x}</span>`).join('')}</div><div class="grid">${D.monthGrid(st.ym).map((d) => cell(d, today)).join('')}</div></div>${dayPane(st.sel)}</div>`;
}
