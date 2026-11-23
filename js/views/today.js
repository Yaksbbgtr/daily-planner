import * as D from '../dates.js';
import * as store from '../store.js';
import * as J from '../jewish.js';
import { eventsOn, tasksDue, taskSort } from '../agenda.js';
import { taskRow, streak, hid } from '../editors.js';
import { color, esc, icon } from '../ui.js';

export function eventRows(day) {
  return eventsOn(day).map((e) => `<li><button class="event" data-act="openEvent" data-id="${esc(e.id)}" data-day="${day}" ${e.occ ? `data-occ="${e.occ}"` : ''} style="--c:${color(e.color)}">
    <span class="when">${e.time ? esc(D.time(e.time)) : e.cont && e.end ? `until ${esc(D.time(e.end))}` : 'All day'}</span><span class="what"><span class="t">${esc(e.title)}</span>${e.time && e.end || e.loc ? `<span class="meta">${[e.time && e.end ? 'to ' + D.time(e.end) : '', esc(e.loc || '')].filter(Boolean).join('<i></i>')}</span>` : ''}</span></button></li>`).join('');
}
export function jewishChips(items) {
  return items.map((x) => `<span class="chip ${x.kind}">${esc(x.text)}${x.at ? ` <b>${esc(J.formatTime(x.at))}</b>` : ''}</span>`).join('');
}

function ribbon(day) {
  const z = J.zmanim(day);
  if (!z) return `<button class="nudge" data-act="go" data-to="#/settings">Set your location to see zmanim and candle lighting</button>`;
  const at = Object.fromEntries(z.map((x) => [x.id, x.at.getTime()]));
  if (!at.sunrise || !at.sunset) return '';
  const from = (at.alos || at.sunrise) - 30 * 6e4, to = (at.tzeis || at.sunset) + 45 * 6e4;
  const pct = (t) => Math.max(0, Math.min(100, ((t - from) / (to - from)) * 100)).toFixed(2);
  const now = Date.now();
  const next = z.find((x) => x.at > now);
  const nowIn = now >= from && now <= to;
  return `<div class="ribbon"><p class="next">${next ? `<span>${esc(next.name)}</span><b>${esc(J.formatTime(next.at))}</b>` : '<span>All of today’s zmanim have passed</span>'}</p><div class="sky" style="--rise:${pct(at.sunrise)}%;--set:${pct(at.sunset)}%">
      ${z.filter((x) => ['shma', 'chatzos', 'plag'].includes(x.id)).map((x) => `<i class="mark ${x.at < now ? 'past' : ''}" style="left:${pct(x.at.getTime())}%"></i>`).join('')}
      ${nowIn ? `<i class="now" style="left:${pct(now)}%"></i>` : ''}</div>
      <div class="ends" aria-hidden="true"><span style="left:${pct(at.sunrise)}%">${esc(J.formatTime(new Date(at.sunrise)))}</span><span style="left:${pct(at.sunset)}%">${esc(J.formatTime(new Date(at.sunset)))}</span></div>
      <details id="zmanim"><summary>All zmanim</summary>
      <dl>${z.map((x) => `<div class="${x.at < now ? 'past' : x === next ? 'next' : ''}"><dt>${esc(x.name)}</dt><dd>${esc(J.formatTime(x.at))}</dd></div>`).join('')}</dl></details></div>`;
}

function habits(today) {
  const all = store.all('habit').sort((a, b) => a.made - b.made);
  const week = Array.from({ length: 7 }, (_, i) => D.addDays(today, i - 6));
  const rows = all.map((h) => {
    const n = streak(h, today);
    return `<li class="habit"><button class="text" data-act="editHabit" data-id="${esc(h.id)}"><span class="t">${esc(h.title)}</span>${n > 1 ? `<span class="meta">${n} in a row</span>` : ''}</button>
    <div class="dots">${week.map((d) => {
      const on = h.days.includes(D.dow(d)), did = !!store.get(hid(h.id, d));
      return `<button data-act="toggleHabit" data-id="${esc(h.id)}" data-day="${d}" class="${on ? '' : 'off'} ${d === today ? 'today' : ''}" aria-pressed="${did}" aria-label="${esc(h.title)}, ${esc(D.friendly(d))}"><span>${D.weekday(d)[0]}</span></button>`;
    }).join('')}</div></li>`;
  }).join('');
  return `<section class="card"><header><h2>Habits</h2><button class="plain" data-act="editHabit">Add</button></header>${rows ? `<ul class="rows">${rows}</ul>` : '<p class="empty">Things you want to do regularly. Tick them off here each day.</p>'}</section>`;
}

export function render() {
  const today = D.iso();
  const heb = J.hebrewNow();
  const info = J.day(today);
  const parsha = J.parshaFor(today);
  const events = eventRows(today);
  const late = store.all('task').filter((t) => !t.done && t.date && t.date < today).sort(taskSort);
  const due = tasksDue(today).sort(taskSort);
  const doneToday = store.all('task').filter((t) => t.done && D.iso(new Date(t.done)) === today).sort((a, b) => b.done - a.done);
  const items = info.items.filter((x) => x.kind !== 'parsha');
  return `<div class="today"><header class="hero"><div class="toprow"><p class="eyebrow">${esc([D.weekday(today), parsha].filter(Boolean).join(' · '))}</p><a class="icon gear" href="#/settings" aria-label="Settings">${icon('settings')}</a></div>
    <h1>${D.monthDay(today)}</h1><p class="heb"><span lang="he" dir="rtl">${esc(heb.full)}</span>${heb.night ? ' <span class="small">after sunset</span>' : ''}</p></header>
    ${items.length ? `<div class="chips">${jewishChips(items)}</div>` : ''}
    ${ribbon(today)}
    <div class="cols"><div>
      <section class="card"><header><h2>Schedule</h2><button class="plain" data-act="quickAdd" data-kind="event">Add</button></header>${events ? `<ul class="rows">${events}</ul>` : '<p class="empty">Nothing scheduled today.</p>'}</section>
      <section class="card tasks"><header><h2>Tasks</h2><button class="plain" data-act="quickAdd" data-kind="task" data-date="${today}">Add</button></header>
        ${late.length ? `<h3 class="late">Overdue</h3><ul class="rows">${late.map((t) => taskRow(t)).join('')}</ul>${due.length ? '<h3>Today</h3>' : ''}` : ''}
        ${due.length ? `<ul class="rows">${due.map((t) => taskRow(t, { showDate: false })).join('')}</ul>` : ''}
        ${!late.length && !due.length ? `<p class="empty">${doneToday.length ? 'All done for today.' : 'No tasks due today.'}</p>` : ''}
        ${doneToday.length ? `<details id="doneToday"><summary>${doneToday.length} done today</summary><ul class="rows">${doneToday.map((t) => taskRow(t, { showDate: false })).join('')}</ul></details>` : ''}</section>
    </div><div>
      ${habits(today)}
      <section class="card"><header><h2>Journal</h2><button class="plain" data-act="go" data-to="#/notes/journal">Past days</button></header>
      <textarea id="journal" class="paper" data-save="journal" data-day="${today}" dir="auto" aria-label="Journal for today" placeholder="How was today?">${esc(store.get('j:' + today)?.body)}</textarea></section>
    </div></div></div>`;
}
