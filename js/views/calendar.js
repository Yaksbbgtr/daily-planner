import * as D from '../dates.js';
import * as J from '../jewish.js';
import { eventsOn, tasksDue, taskSort } from '../agenda.js';
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
  return `<section class="card daypane"><header><div><h2>${esc(D.friendly(d) === D.weekday(d) || /^(Today|Tomorrow|Yesterday)$/.test(D.friendly(d)) ? `${D.friendly(d)}, ${D.monthDay(d)}` : D.friendly(d))}</h2><p class="hint" lang="he">${esc(h.full)}</p></div><button class="plain" data-act="quickAdd" data-kind="event" data-date="${d}">Add event</button></header>
    ${h.items.length ? `<div class="chips">${jewishChips(h.items)}</div>` : ''}
    ${ev ? `<ul class="rows">${ev}</ul>` : ''}${due.length ? `<ul class="rows">${due.map((t) => taskRow(t, { showDate: false })).join('')}</ul>` : ''}
    ${!ev && !due.length ? '<p class="empty">Nothing on this day.</p>' : ''}</section>`;
}
function hebMonths(ym) {
  const last = D.addDays(D.addMonths(ym, 1) + '-01', -1);
  return [...new Set([J.day(ym + '-01').monthName, J.day(last).monthName])].join(' – ');
}
export function render() {
  const today = D.iso();
  if (!st.sel) select(today);
  const head = `<header class="bar"><div><h1>${st.mode === 'month' ? D.monthYear(st.ym + '-01') : 'Upcoming'}</h1>${st.mode === 'month' ? `<p class="hint" lang="he">${esc(hebMonths(st.ym))}</p>` : ''}</div>
    <div class="tools"><div class="seg" role="group" aria-label="View"><button data-act="calMode" data-mode="month" aria-pressed="${st.mode === 'month'}">Month</button><button data-act="calMode" data-mode="list" aria-pressed="${st.mode === 'list'}">Upcoming</button></div>
    ${st.mode === 'month' ? `<button class="icon" data-act="calMove" data-n="-1" aria-label="Previous month">${icon('left')}</button><button class="plain" data-act="calToday">Today</button><button class="icon" data-act="calMove" data-n="1" aria-label="Next month">${icon('right')}</button>` : ''}</div></header>`;
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
