import * as D from '../dates.js';
import * as store from '../store.js';
import * as J from '../jewish.js';
import { esc, icon } from '../ui.js';

export const st = { q: '' };
const head = (tab) => `<header class="bar"><h1>Notes</h1><div class="tools"><div class="seg" role="group" aria-label="View"><button data-act="go" data-to="#/notes" aria-pressed="${tab === 'notes'}">Notes</button><button data-act="go" data-to="#/notes/journal" aria-pressed="${tab === 'journal'}">Journal</button></div>${tab === 'notes' ? '<button class="primary" data-act="newNote">New note</button>' : ''}</div></header>`;
const search = `<input id="notesearch" type="search" data-live="noteSearch" placeholder="Search" aria-label="Search">`;

export function render(id, day) {
  if (id === 'journal') {
    if (day && D.isRealDate(day)) return `<header class="bar"><div class="crumb"><a class="roundbtn" href="#/notes/journal" aria-label="All journal days">${icon('left')}</a><div><h1>${esc(D.shortDayYear(day))}</h1><p class="hint" lang="he">${esc(J.day(day).full)}</p></div></div></header><div class="narrow"><textarea id="journal" class="paper tall" data-save="journal" data-day="${day}" dir="auto" aria-label="Journal">${esc(store.get('j:' + day)?.body)}</textarea></div>`;
    const days = store.all('journal').filter((j) => match(j.body)).sort((a, b) => (a.id < b.id ? 1 : -1));
    return head('journal') + `<div class="narrow"><div class="inline">${search}<label class="pickday">Open a day <input type="date" data-change="openJournal" max="${D.iso()}" aria-label="Open a day"></label></div>${days.length ? `<section class="card"><ul class="rows">${days.map((j) => { const d = j.id.slice(2); return `<li><a class="note" href="#/notes/journal/${d}"><span class="t">${esc(D.shortDayYear(d))}</span><span class="meta" dir="auto">${esc(j.body.slice(0, 140))}</span></a></li>`; }).join('')}</ul></section>` : `<p class="empty big">${st.q ? 'Nothing matches that search.' : 'Write in the journal on Today and past days collect here.'}</p>`}</div>`;
  }
  const n = id && store.get(id);
  if (n?.k === 'note') return `<header class="bar"><div class="crumb"><a class="roundbtn" href="#/notes" aria-label="All notes">${icon('left')}</a><input id="notetitle" class="title" data-save="noteTitle" data-id="${esc(id)}" dir="auto" value="${esc(n.title)}" placeholder="Title" aria-label="Title"></div><div class="tools"><button class="plain" data-act="pinNote" data-id="${esc(id)}" aria-pressed="${!!n.pin}">${n.pin ? 'Unpin' : 'Pin'}</button><button class="plain danger" data-act="deleteNote" data-id="${esc(id)}">Delete</button></div></header><div class="narrow"><textarea id="notebody" class="paper tall" data-save="noteBody" data-id="${esc(id)}" dir="auto" aria-label="Note" placeholder="Write here">${esc(n.body)}</textarea></div>`;
  const notes = store.all('note').filter((x) => match(x.title + '\n' + x.body)).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.u - a.u);
  return head('notes') + `<div class="narrow">${search}${notes.length ? `<section class="card"><ul class="rows">${notes.map((x) => `<li><a class="note" href="#/notes/${esc(x.id)}"><span class="t" dir="auto">${x.pin ? '<span class="star" aria-label="Pinned">★</span> ' : ''}${esc(x.title || 'Untitled')}</span><span class="meta" dir="auto">${esc(x.body.slice(0, 140))}</span></a></li>`).join('')}</ul></section>` : `<p class="empty big">${st.q ? 'Nothing matches that search.' : 'No notes yet.'}</p>`}</div>`;
}
const match = (s) => !st.q || s.toLowerCase().includes(st.q.toLowerCase());
