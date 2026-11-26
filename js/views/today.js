// The day at a glance: a strip of days, a progress ring, and a timeline of round bubbles (after Structured and Tiimo).
import * as D from '../dates.js';
import * as store from '../store.js';
import * as J from '../jewish.js';
import { eventsOn, tasksDue, taskSort } from '../agenda.js';
import { taskRow, streak, hid, progOf, progBar } from '../editors.js';
import { emojiOf, glyph } from '../emoji.js';
import { color, esc, icon } from '../ui.js';
import * as checklist from '../checklist.js';

export const st = { day: null };
const p2 = (n) => String(n).padStart(2, '0');
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hm = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const span = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

export function eventRows(day) {
  return eventsOn(day).map((e) => `<li><button class="event" data-act="openEvent" data-id="${esc(e.id)}" data-day="${day}" ${e.occ ? `data-occ="${e.occ}"` : ''} style="--c:${color(e.color)}">
    <span class="bubble" aria-hidden="true">${emojiOf({ ...e, k: 'event' })}</span><span class="what"><span class="t">${esc(e.title)}</span><span class="meta">${[e.time ? D.time(e.time) + (e.end ? ' – ' + D.time(e.end) : '') : e.cont && e.end ? `until ${D.time(e.end)}` : 'All day', esc(e.loc || ''), e.apple ? esc(e.cal) : '', e.links?.length ? '🔗' : ''].filter(Boolean).join('<i></i>')}</span></span></button></li>`).join('');
}
export function jewishChips(items) {
  return items.map((x) => `<span class="chip ${x.kind}">${esc(x.text)}${x.at ? ` <b>${esc(J.formatTime(x.at))}</b>` : ''}</span>`).join('');
}



// What is happening now or next: timed events (yours and Apple's) and timed tasks, looking up to two weeks ahead.
function upcoming(day, today) {
  const now = Date.now(), from = day === today ? now : new Date(`${day}T00:00`).getTime();
  for (let i = 0, d = day; i < 14; i++, d = D.addDays(d, 1)) {
    const items = [
      ...eventsOn(d).filter((e) => e.time && !e.cont).map((e) => ({ e, d, at: new Date(`${d}T${e.time}`).getTime(), end: e.end ? new Date(`${d}T${e.end}`).getTime() : null })),
      ...store.all('task').filter((t) => t.date === d && t.time && !t.done).map((t) => ({ t, d, at: new Date(`${d}T${t.time}`).getTime(), end: t.dur ? new Date(`${d}T${t.time}`).getTime() + t.dur * 60000 : null })),
    ].sort((a, b) => a.at - b.at);
    const hit = items.find((x) => x.at >= from || (x.end && x.end > from && day === today));
    if (hit) return hit;
  }
  return null;
}
function nextCard(day, today) {
  const x = upcoming(day, today);
  if (!x) return `<div class="glancecard next empty"><span class="lbl">Next up</span><span class="nt">Nothing on your calendar</span><span class="lbl">for the next two weeks</span></div>`;
  const now = Date.now(), it = x.e || x.t;
  const live = x.at <= now && x.end && x.end > now;
  const until = Math.round((x.at - now) / 60000);
  const when = live ? `Now · until ${D.time(it.end || D.addMinutes(it.time, it.dur))}`
    : x.d === today && until < 60 && until >= 0 ? `Next up · in ${Math.max(1, until)} min`
    : x.d === today ? 'Next up · today' : `Next up · ${D.friendly(x.d, today)}`;
  const at = [D.time(it.time) + (x.e && x.e.end ? ` – ${D.time(x.e.end)}` : ''), x.e?.loc ? esc(x.e.loc) : ''].filter(Boolean).join(' · ');
  const act = x.e ? `data-act="openEvent" data-id="${esc(x.e.id)}" data-day="${x.d}" ${x.e.occ ? `data-occ="${x.e.occ}"` : ''}` : `data-act="editTask" data-id="${esc(x.t.id)}"`;
  return `<button class="glancecard next ${live ? 'live' : ''}" ${act} style="--c:${color(it.color)}"><span class="lbl when">${esc(when)}</span><span class="nt"><span class="ne" aria-hidden="true">${emojiOf({ ...it, k: x.e ? 'event' : 'task' })}</span><span dir="auto">${esc(it.title || 'Untitled')}</span></span><span class="lbl">${at}</span></button>`;
}

// Tefillin, on days they are worn (not Shabbos or Yom Tov): asks until you tap "Did it". If you have not by a
// little before sunset, a reminder goes out (reminders.js, from the sunset times saved in planTefillin).
export const tfid = (d) => 'tf:' + d;
function tefillin(day, today) {
  const s = store.settings();
  // Only today, and only until sunset (6 PM without a location): after that the day for tefillin is over.
  if (s.tfOff || day !== today || J.isRestDay(day)) return '';
  const sunset = J.zmanim(day)?.find((x) => x.id === 'sunset')?.at;
  const end = sunset && !isNaN(sunset) ? +sunset : new Date(`${day}T18:00`).getTime();
  if (Date.now() >= end) return '';
  if (store.get(tfid(day))) return `<button class="ritual tfdone" data-act="tefillin" data-day="${day}" aria-pressed="true"><span class="bubble">${glyph('check')}</span><span><b>Tefillin</b><span class="meta">Put on today · tap to undo</span></span></button>`;
  const hint = sunset ? `Before sunset at ${J.formatTime(sunset, false)}` : 'Set your location for a reminder before sunset';
  return `<div class="ritual tfask"><span class="bubble">${glyph('hand-heart')}</span><span><b>Did you put on tefillin yet today?</b><span class="meta">${esc(hint)}</span></span><button class="primary" data-act="tefillin" data-day="${day}">Did it</button></div>`;
}

function glance(day, today) {
  const z = J.zmanim(day);
  let sun = '';
  if (!z) sun = `<a class="glancecard nudge" href="#/settings"><span class="big">${glyph('map-pin', 'g big')}</span><span>Set your location for zmanim and candle lighting</span></a>`;
  else {
    const now = Date.now();
    const candles = J.day(day).items.find((x) => x.kind === 'candles' || x.kind === 'ends');
    const next = day === today ? z.find((x) => x.at > now) : null;
    const show = candles && (day !== today || candles.at > now) ? { name: candles.text, at: candles.at, holy: true } : next || z.find((x) => x.id === 'sunset');
    sun = `<button class="glancecard sun ${show.holy ? 'holy' : ''}" data-act="go" data-to="#/today/zmanim"><span class="lbl">${esc(day === today && !show.holy ? 'Next · ' + show.name : show.name)}</span><span class="big">${esc(J.formatTime(show.at))}</span><span class="lbl">All zmanim ›</span></button>`;
  }
  return `<div class="glance">${nextCard(day, today)}${sun}</div>`;
}

function timeline(day, today) {
  const evs = eventsOn(day);
  const tasks = store.all('task').filter((t) => t.date === day && (!t.done || D.iso(new Date(t.done)) >= day)).sort(taskSort);
  const anytime = [...evs.filter((e) => !e.time && !(e.cont && e.end)), ...tasks.filter((t) => !t.time)];
  const timed = [
    ...evs.filter((e) => e.time || (e.cont && e.end)).map((e) => ({ kind: 'event', at: e.time || '00:00', end: e.end, e })),
    ...tasks.filter((t) => t.time).map((t) => ({ kind: 'task', at: t.time, end: t.dur ? D.addMinutes(t.time, t.dur) : null, t })),
  ];
  // Sunrise, sunset and candle lighting sit in the day as markers.
  const z = J.zmanim(day);
  if (z) {
    const pick = { sunrise: 'sunrise', sunset: 'sunset' };
    for (const x of z) if (pick[x.id]) timed.push({ kind: 'zman', at: hm(x.at), name: x.name, emoji: pick[x.id], when: x.at });
    for (const x of J.day(day).items) if (x.at && (x.kind === 'candles' || x.kind === 'ends')) timed.push({ kind: 'zman', at: hm(x.at), name: x.text, emoji: 'candle', when: x.at, holy: true });
  }
  timed.sort((a, b) => a.at.localeCompare(b.at) || (a.kind === 'zman' ? -1 : 1));
  const nowM = day === today ? new Date().getHours() * 60 + new Date().getMinutes() : null;
  let html = '', lastEnd = null, nowShown = nowM === null;
  const nowLine = () => `<li class="nowline" aria-label="Now"><span>${esc(D.time(`${p2(Math.floor(nowM / 60))}:${p2(nowM % 60)}`))}</span></li>`;
  for (const it of timed) {
    const m = mins(it.at);
    if (!nowShown && m > nowM) { html += nowLine(); nowShown = true; }
    if (it.kind !== 'zman' && lastEnd !== null && m - lastEnd >= 90) html += `<li class="gap">${span(m - lastEnd)} free</li>`;
    if (it.kind === 'zman') html += `<li class="zman ${it.holy ? 'holy' : ''}"><span class="time">${esc(J.formatTime(it.when))}</span><span class="dot">${glyph(it.emoji)}</span><span class="t">${esc(it.name)}</span></li>`;
    else if (it.kind === 'event') {
      const e = it.e;
      html += `<li class="slot"><span class="time">${e.time ? esc(D.time(e.time)) : ''}</span><button class="block" data-act="openEvent" data-id="${esc(e.id)}" data-day="${day}" ${e.occ ? `data-occ="${e.occ}"` : ''} style="--c:${color(e.color)}"><span class="bubble">${emojiOf({ ...e, k: 'event' })}</span><span class="what"><span class="t">${esc(e.title)}</span><span class="meta">${[e.time && e.end ? `${D.time(e.time)} – ${D.time(e.end)}` : e.cont && e.end ? `until ${D.time(e.end)}` : '', esc(e.loc || ''), e.apple ? esc(e.cal) : '', e.links?.length ? '🔗' : ''].filter(Boolean).join('<i></i>')}</span></span></button></li>`;
      if (e.end) lastEnd = Math.max(lastEnd ?? 0, mins(e.end)); else lastEnd = Math.max(lastEnd ?? 0, m + 30);
    } else {
      const t = it.t;
      html += `<li class="slot ${t.done ? 'done' : ''}"><span class="time">${esc(D.time(t.time))}</span><div class="block task-block" style="--c:${color(t.color)}"><button class="bubble" data-act="toggleTask" data-id="${esc(t.id)}" aria-hidden="true" tabindex="-1">${emojiOf(t)}</button><button class="what" data-act="toggleTask" data-id="${esc(t.id)}" aria-hidden="true" tabindex="-1"><span class="t">${esc(t.title)}</span><span class="meta">${t.dur ? `${D.time(t.time)} – ${D.time(D.addMinutes(t.time, t.dur))}` : D.time(t.time)}${progOf(t) && !t.done ? ` · ${progOf(t)}%` : ''}</span>${progOf(t) && !t.done ? progBar(progOf(t)) : ''}</button><button class="editbtn" data-act="editTask" data-id="${esc(t.id)}" aria-label="Edit ${esc(t.title)}">${glyph('pencil')}</button><button class="check" data-act="toggleTask" data-id="${esc(t.id)}" role="checkbox" aria-checked="${!!t.done}" aria-label="${esc(t.title)}"></button></div></li>`;
      lastEnd = Math.max(lastEnd ?? 0, m + (t.dur || 30));
    }
  }
  if (!nowShown) html += nowLine();
  const any = anytime.map((x) => (x.k === 'task' ? taskRow(x, { showDate: false }) : eventRows(day).split('</li>').find((r) => r.includes(`data-id="${esc(x.id)}"`)) + '</li>')).join('');
  return `${any ? `<section class="card anytime"><header><h2>Anytime</h2><button class="plain" data-act="quickAdd" data-kind="task" data-date="${day}">Add</button></header><ul class="rows">${any}</ul></section>` : ''}
    <section class="card"><header><h2>Timeline</h2><button class="plain" data-act="quickAdd" data-kind="event" data-date="${day}">Add</button></header>
    ${timed.some((x) => x.kind !== 'zman') || anytime.length ? '' : '<p class="empty">Nothing planned. Tap + to add something.</p>'}<ol class="timeline">${html}</ol></section>`;
}

function habits(day, today) {
  const all = store.all('habit').sort((a, b) => a.made - b.made);
  const on = all.filter((h) => h.days.includes(D.dow(day)));
  const rows = on.map((h) => {
    const did = !!store.get(hid(h.id, day)), n = streak(h, day);
    return `<li class="hab ${did ? 'did' : ''}"><button class="habbtn" data-act="toggleHabit" data-id="${esc(h.id)}" data-day="${day}" aria-pressed="${did}" aria-label="${esc(h.title)}"><span class="bubble">${emojiOf({ ...h, k: 'habit' })}</span></button>
      <button class="habname" data-act="editHabit" data-id="${esc(h.id)}"><span class="t">${esc(h.title)}</span><span class="meta">${n > 0 ? `${glyph('flame', 'g s')}${n} in a row` : 'Tap the circle when done'}</span></button></li>`;
  }).join('');
  const rest = all.length - on.length;
  return `<section class="card habits"><header><h2>Habits</h2><button class="plain" data-act="editHabit">Add</button></header>${rows ? `<ul class="habs">${rows}</ul>` : `<p class="empty">${all.length ? 'No habits on this day.' : 'Things you want to do regularly. Tick them off here each day.'}</p>`}${rows && rest ? `<p class="hint pad-s">${rest} more on other days</p>` : ''}</section>`;
}

export function zmanimPage(day) {
  const z = J.zmanim(day);
  const now = Date.now();
  const next = z?.find((x) => x.at > now);
  return `<header class="bar"><div class="crumb"><a class="roundbtn" href="#/today" aria-label="Back">${icon('left')}</a><div><h1>Zmanim</h1><p class="hint">${esc(D.friendly(day))} · <span lang="he">${esc(J.day(day).full)}</span></p></div></div></header>
    ${z ? `<section class="card"><ul class="rows zlist">${z.map((x) => `<li class="${x.at < now ? 'past' : x === next ? 'next' : ''}"><span>${esc(x.name)}</span><b>${esc(J.formatTime(x.at))}</b></li>`).join('')}</ul></section>` : '<p class="empty big">Set your location in Settings first.</p>'}`;
}

export function render(sub) {
  const today = D.iso();
  if (!st.day) st.day = today;
  const day = st.day;
  if (sub === 'zmanim') return zmanimPage(day);
  const heb = day === today ? J.hebrewNow() : { ...J.day(day), night: false };
  const items = J.day(day).items.filter((x) => x.kind !== 'parsha' && x.kind !== 'candles' && x.kind !== 'ends');
  const parsha = J.parshaFor(day);
  const hour = new Date().getHours();
  const hello = day !== today ? D.friendly(day, today) : hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const late = day === today ? store.all('task').filter((t) => !t.done && t.date && t.date < today).sort(taskSort) : [];
  // Tap the day's name or date to jump to any day; the arrows step a day back or forward.
  return `<div class="today"><header class="hero"><div class="daypick"><p class="eyebrow">${esc(hello)}</p><h1>${esc(D.weekday(day))} <span class="caret" aria-hidden="true">${icon('right')}</span></h1>
      <p class="sub">${esc(D.monthDay(day))} · <span lang="he" dir="rtl">${esc(heb.full)}</span>${heb.night ? ' · after sunset' : ''}</p>
      <input type="date" id="daypick" data-change="pickDate" value="${day}" aria-label="Pick a day"></div>
      <a class="roundbtn gear" href="#/settings" aria-label="Settings">${icon('settings')}</a></header>
    <div class="daynav"><button class="roundbtn" data-act="dayStep" data-n="-1" aria-label="Day before">${icon('left')}</button>${day !== today ? `<button class="pillbtn" data-act="pickToday" data-day="${today}">Back to today</button>` : `<span class="hint">Tap the date to pick a day</span>`}<button class="roundbtn" data-act="dayStep" data-n="1" aria-label="Day after">${icon('right')}</button></div>
    ${items.length || parsha ? `<div class="chips">${jewishChips(items)}${parsha ? `<span class="chip parsha">${esc(parsha)}</span>` : ''}</div>` : ''}
    ${glance(day, today)}
    ${day === today && new Date().getHours() < 11 && !store.get('plan:' + today) ? `<button class="ritual" data-act="planDay"><span class="bubble">${glyph('sun')}</span><span><b>Plan your day</b><span class="meta">Pick what today is for</span></span></button>` : ''}
    ${tefillin(day, today)}
    ${checklist.card(day, today)}
    ${late.length ? `<section class="card tasks late-card"><header><h2 class="late">Overdue</h2><button class="plain" data-act="rollOver">Move all to today</button></header><ul class="rows">${late.map((t) => taskRow(t)).join('')}</ul></section>` : ''}
    <div class="cols"><div>${timeline(day, today)}</div><div>
      ${habits(day, today)}
      <section class="card"><header><h2>Journal</h2><button class="plain" data-act="go" data-to="#/notes/journal">Past days</button></header>
      <textarea id="journal" class="paper" data-save="journal" data-day="${day}" dir="auto" aria-label="Journal for ${esc(D.friendly(day, today))}" placeholder="${day === today ? 'How was today?' : 'Notes for this day'}">${esc(store.get('j:' + day)?.body)}</textarea></section>
    </div></div></div>`;
}
