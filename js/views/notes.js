import * as D from '../dates.js';
import { glyph } from '../emoji.js';
import * as store from '../store.js';
import * as J from '../jewish.js';
import { esc, icon } from '../ui.js';
import { ready as aiReady } from '../ai.js';

export const st = { q: '', folder: null };
export const notesIn = (fid) => store.all('note').filter((n) => n.folder === fid);
const head = (tab) => `<header class="bar"><h1>Notes</h1><div class="tools"><div class="seg" role="group" aria-label="View"><button data-act="go" data-to="#/notes" aria-pressed="${tab === 'notes'}">Notes</button><button data-act="go" data-to="#/notes/journal" aria-pressed="${tab === 'journal'}">Journal</button></div>${tab === 'notes' ? `<button class="primary" data-act="newNote" ${st.folder ? `data-folder="${esc(st.folder)}"` : ''}>New note</button>` : ''}</div></header>`;
const search = `<input id="notesearch" type="search" data-live="noteSearch" placeholder="Search" aria-label="Search">`;

export function render(id, day) {
  if (id === 'journal') {
    if (day && D.isRealDate(day)) return `<header class="bar"><div class="crumb"><a class="roundbtn" href="#/notes/journal" aria-label="All journal days">${icon('left')}</a><div><h1>${esc(D.shortDayYear(day))}</h1><p class="hint" lang="he">${esc(J.day(day).full)}</p></div></div></header><div class="narrow"><textarea id="journal" class="paper tall" data-save="journal" data-day="${day}" dir="auto" aria-label="Journal">${esc(store.get('j:' + day)?.body)}</textarea></div>`;
    const days = store.all('journal').filter((j) => match(j.body)).sort((a, b) => (a.id < b.id ? 1 : -1));
    return head('journal') + `<div class="narrow"><div class="inline">${search}<label class="pickday">Open a day <input type="date" data-change="openJournal" max="${D.iso()}" aria-label="Open a day"></label></div>${days.length ? `<section class="card"><ul class="rows">${days.map((j) => { const d = j.id.slice(2); return `<li><a class="note" href="#/notes/journal/${d}"><span class="t">${esc(D.shortDayYear(d))}</span><span class="meta" dir="auto">${esc(j.body.slice(0, 140))}</span></a></li>`; }).join('')}</ul></section>` : `<p class="empty big">${st.q ? 'Nothing matches that search.' : 'Write in the journal on Today and past days collect here.'}</p>`}</div>`;
  }
  const n = id && store.get(id);
  if (n?.k === 'note') return `<header class="bar"><div class="crumb"><a class="roundbtn" href="#/notes" aria-label="All notes">${icon('left')}</a><input id="notetitle" class="title" data-save="noteTitle" data-id="${esc(id)}" dir="auto" value="${esc(n.title)}" placeholder="Title" aria-label="Title"></div><div class="tools">${aiReady() ? `<button class="plain" data-act="askClaude" data-id="${esc(id)}">✨ Ask</button>` : ''}${folderPick(n)}<button class="plain" data-act="pinNote" data-id="${esc(id)}" aria-pressed="${!!n.pin}">${n.pin ? 'Unpin' : 'Pin'}</button><button class="plain danger" data-act="deleteNote" data-id="${esc(id)}">Delete</button></div></header><div class="narrow"><textarea id="notebody" class="paper tall" data-save="noteBody" data-id="${esc(id)}" dir="auto" aria-label="Note" placeholder="Write here">${esc(n.body)}</textarea></div>`;
  const folders = store.all('folder').sort((a, b) => a.title.localeCompare(b.title));
  if (st.folder && !folders.some((f) => f.id === st.folder)) st.folder = null;
  const notes = store.all('note').filter((x) => (!st.folder || x.folder === st.folder) && match(x.title + '\n' + x.body)).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.u - a.u);
  const fname = (id) => folders.find((f) => f.id === id)?.title;
  // Folders as a grid of tiles: All, each folder with its count, and one to make a new folder.
  const tile = (id, g, name, n, extra = '') => `<button class="ftile" data-act="noteFolder" data-id="${esc(id)}" aria-pressed="${(st.folder || '') === id}"${extra}><span class="fic" aria-hidden="true">${glyph(g)}</span><span class="fn" dir="auto">${esc(name)}</span><span class="fc">${n} note${n === 1 ? '' : 's'}</span></button>`;
  const chips = `<div class="fgrid folders">${tile('', 'folder-kanban', 'All notes', store.all('note').length)}${folders.map((f) => tile(f.id, 'folder', f.title, notesIn(f.id).length)).join('')}<button class="ftile add" data-act="editFolder"><span class="fic" aria-hidden="true">${icon('plus')}</span><span class="fn">New folder</span></button></div>${st.folder ? `<div class="frename"><button class="plain" data-act="editFolder" data-id="${esc(st.folder)}">Rename folder</button></div>` : ''}`;
  return head('notes') + `<div class="narrow">${search}${chips}${notes.length ? `<section class="card"><ul class="rows">${notes.map((x) => `<li><a class="note" href="#/notes/${esc(x.id)}"><span class="t" dir="auto">${x.pin ? `<span class="star" role="img" aria-label="Pinned">${glyph('star', 'g s')}</span>` : ''}${esc(x.title || 'Untitled')}</span><span class="meta" dir="auto">${[!st.folder && fname(x.folder) ? `${glyph('folder', 'g s')}${esc(fname(x.folder))}` : '', esc(x.body.slice(0, 140))].filter(Boolean).join(' · ')}</span></a></li>`).join('')}</ul></section>` : `<p class="empty big">${st.q ? 'Nothing matches that search.' : st.folder ? 'This folder is empty. New notes made here go in it.' : 'No notes yet.'}</p>`}</div>`;
}
const folderPick = (n) => {
  const fs = store.all('folder').sort((a, b) => a.title.localeCompare(b.title));
  return fs.length ? `<select class="pillselect" data-change="moveNote" data-id="${esc(n.id)}" aria-label="Folder"><option value="">No folder</option>${fs.map((f) => `<option value="${esc(f.id)}" ${n.folder === f.id ? 'selected' : ''}>${esc(f.title)}</option>`).join('')}</select>` : '';
};
const match = (s) => !st.q || s.toLowerCase().includes(st.q.toLowerCase());
