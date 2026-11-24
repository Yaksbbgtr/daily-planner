import * as D from '../dates.js';
import * as store from '../store.js';
import { taskSort } from '../agenda.js';
import { taskRow } from '../editors.js';
import { emojiOf } from '../emoji.js';
import { color, esc, icon, ring } from '../ui.js';
import * as files from '../files.js';
import { glyph } from '../emoji.js';

export const st = { tag: null };
const head = (tab, extra = '') => `<header class="bar"><h1>Tasks</h1><div class="tools"><div class="seg" role="group" aria-label="View"><button data-act="go" data-to="#/tasks" aria-pressed="${tab === 'tasks'}">Tasks</button><button data-act="go" data-to="#/tasks/projects" aria-pressed="${tab === 'projects'}">Projects</button></div>${extra}</div></header>`;
export const tasksOf = (pid) => store.all('task').filter((t) => t.proj === pid);
export const checklistsOf = (pid) => store.all('list').filter((l) => l.proj === pid).sort((a, b) => a.made - b.made);
export const after = (main) => files.hydrate(main);
const itemsOf = (id) => store.all('item').filter((x) => x.list === id).sort((a, b) => a.made - b.made);
const EXT = (f) => (f.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] || f.type.split('/')[1] || 'file').slice(0, 4).toUpperCase();
// A project's own checklists: tick things off right on the project page.
function checklistCard(l) {
  const items = itemsOf(l.id), done = items.filter((x) => x.on);
  const row = (x) => `<li class="task ${x.on ? 'done' : ''}"><button class="tick" data-act="toggleItem" data-id="${esc(x.id)}" role="checkbox" aria-checked="${!!x.on}" aria-label="${esc(x.title)}"></button><button class="text" data-act="toggleItem" data-id="${esc(x.id)}" aria-hidden="true" tabindex="-1"><span class="t" dir="auto">${esc(x.title)}</span></button><button class="icon faint" data-act="removeItem" data-id="${esc(x.id)}" aria-label="Remove ${esc(x.title)}">${icon('close')}</button></li>`;
  return `<section class="card pcheck"><header><h2 dir="auto">${glyph('list-todo', 'g s')} ${esc(l.title)}</h2><span class="hint">${items.length ? `${done.length}/${items.length}` : ''}</span><button class="plain" data-act="renameList" data-id="${esc(l.id)}">Edit</button></header>
    ${items.length ? `<ul class="rows">${items.filter((x) => !x.on).map(row).join('')}${done.map(row).join('')}</ul>` : ''}
    <form class="inline pad-s" data-submit="addItem" data-list="${esc(l.id)}"><input id="ck-${esc(l.id)}" name="t" autocomplete="off" enterkeyhint="done" placeholder="Add to ${esc(l.title)}" aria-label="Add to ${esc(l.title)}"><button class="primary">Add</button></form></section>`;
}
const fileInput = (pid) => `<input type="file" multiple data-change="addFiles" data-proj="${esc(pid)}" aria-label="Add files or photos">`;
function filesCard(pid) {
  const fs = files.filesOf(pid);
  if (!fs.length) return '';
  return `<section class="card pfiles"><header><h2>Files</h2><span class="hint">${fs.length}</span><label class="plain filebtn">Add${fileInput(pid)}</label></header><div class="thumbs">${fs.map((f) => files.isImage(f)
    ? `<button class="thumb" data-act="openFile" data-id="${esc(f.id)}" aria-label="${esc(f.name)}"><img data-file="${esc(f.id)}" alt=""><span class="ph">${glyph('image')}</span></button>`
    : `<button class="thumb doc" data-act="openFile" data-id="${esc(f.id)}"><span class="ext">${esc(EXT(f))}</span><span class="nm" dir="auto">${esc(f.name)}</span><span class="sz">${esc(files.size(f.size))}</span></button>`).join('')}</div></section>`;
}

export function render(sub, pid) {
  if (sub === 'projects') return pid ? projectPage(pid) : projectsPage();
  const today = D.iso(), week = D.addDays(today, 7);
  const everything = store.all('task');
  const tags = [...new Set(everything.filter((t) => !t.done).flatMap((t) => t.tags || []))].sort();
  if (st.tag && !tags.includes(st.tag)) st.tag = null;
  const tasks = st.tag ? everything.filter((t) => t.tags?.includes(st.tag)) : everything;
  const open = tasks.filter((t) => !t.done).sort(taskSort);
  const done = tasks.filter((t) => t.done).sort((a, b) => b.done - a.done);
  const groups = [
    ['Overdue', open.filter((t) => t.date && t.date < today), 'late'],
    ['Today', open.filter((t) => t.date === today)],
    ['Next 7 days', open.filter((t) => t.date > today && t.date <= week)],
    ['Later', open.filter((t) => t.date > week)],
    ['Inbox', open.filter((t) => !t.date && !t.proj)],
  ].filter(([, l]) => l.length);
  return `${head('tasks')}
    <div class="narrow"><form class="inline" data-submit="addTask"><input id="newtask" name="t" autocomplete="off" enterkeyhint="done" placeholder="Call bank tomorrow #home" aria-label="Add a task"><button class="primary">Add</button></form>
    ${tags.length ? `<div class="chips tags"><button class="chip" data-act="tag" data-tag="" aria-pressed="${!st.tag}">All</button>${tags.map((t) => `<button class="chip" data-act="tag" data-tag="${esc(t)}" aria-pressed="${st.tag === t}">#${esc(t)}</button>`).join('')}</div>` : ''}
    ${groups.length ? groups.map(([n, l, c]) => `<section class="card"><header><h2 class="${c || ''}">${n}</h2><span class="hint">${l.length}</span></header><ul class="rows">${l.map((t) => taskRow(t, { showDate: n !== 'Today' })).join('')}</ul></section>`).join('') : `<p class="empty big">Nothing to do. Add a task above.${store.all('project').length ? ' Undated project tasks are under Projects.' : ''}</p>`}
    ${done.length ? `<section class="card"><details id="alldone"><summary>${done.length} done</summary><ul class="rows">${done.slice(0, 100).map((t) => taskRow(t)).join('')}</ul><button class="plain" data-act="clearDone">Delete all done tasks</button></details></section>` : ''}</div>`;
}

// Big round tiles, each with a ring that fills as its tasks get done.
function projectsPage() {
  const all = store.all('project').sort((a, b) => !!a.done - !!b.done || a.made - b.made);
  const tile = (p) => {
    const ts = tasksOf(p.id), done = ts.filter((t) => t.done).length, left = ts.filter((t) => !t.done);
    return `<a class="card tile project ${p.done ? 'finished' : ''}" href="#/tasks/projects/${esc(p.id)}" style="--c:${color(p.color)}"><div class="ptop"><span class="bubble" aria-hidden="true">${emojiOf({ ...p, k: 'project' })}</span><div class="pring">${ring(done, ts.length)}<b>${ts.length ? Math.round((100 * done) / ts.length) + '%' : ''}</b></div></div>
      <h2 dir="auto">${esc(p.title)}</h2><p class="hint">${p.done ? 'Finished' : ts.length ? `${left.length} left of ${ts.length}` : 'No tasks yet'}${p.due && !p.done ? ` · due ${esc(D.friendly(p.due))}` : ''}</p></a>`;
  };
  return head('projects', '<button class="primary" data-act="editProject">New project</button>') + (all.length ? `<div class="tiles">${all.map(tile).join('')}</div>` : '<p class="empty big">A project holds the tasks for something bigger: a move, a simcha, a trip. Each one can have its own checklists, photos and documents too.</p>');
}

function projectPage(pid) {
  const p = store.get(pid);
  if (p?.k !== 'project') return `<p class="empty big">That project is gone. <a href="#/tasks/projects">All projects</a></p>`;
  const ts = tasksOf(pid), open = ts.filter((t) => !t.done).sort(taskSort), done = ts.filter((t) => t.done).sort((a, b) => b.done - a.done);
  const row = (t) => taskRow(t, { subs: true, noProj: true });
  return `<header class="bar"><div class="crumb"><a class="roundbtn" href="#/tasks/projects" aria-label="All projects">${icon('left')}</a><span class="bubble big" style="--c:${color(p.color)}" aria-hidden="true">${emojiOf({ ...p, k: 'project' })}</span><div><h1 dir="auto">${esc(p.title)}</h1><p class="hint">${ts.length ? `${done.length} of ${ts.length} done` : 'No tasks yet'}${p.due ? ` · due ${esc(D.friendly(p.due))}` : ''}</p></div></div><div class="tools"><button class="plain" data-act="editProject" data-id="${esc(pid)}">Edit</button></div></header>
    <div class="narrow">${ts.length ? `<div class="pbar" style="--c:${color(p.color)}"><i style="width:${Math.round((100 * done.length) / ts.length)}%"></i></div>` : ''}
    ${p.notes ? `<p class="pnotes" dir="auto">${esc(p.notes)}</p>` : ''}
    <form class="inline" data-submit="addTask" data-proj="${esc(pid)}"><input id="newtask" name="t" autocomplete="off" enterkeyhint="done" placeholder="Add a task to this project" aria-label="Add a task"><button class="primary">Add</button></form>
    ${open.length ? `<section class="card"><ul class="rows">${open.map(row).join('')}</ul></section>` : ts.length ? `<p class="empty big">Every task is done.${p.done ? '' : ` <button class="primary" data-act="finishProject" data-id="${esc(pid)}">Mark project finished</button>`}</p>` : '<p class="empty big">Add the first task above. Tap a task to give it subtasks.</p>'}
    ${done.length ? `<section class="card"><details id="pdone-${esc(pid)}"><summary>${done.length} done</summary><ul class="rows">${done.map(row).join('')}</ul></details></section>` : ''}
    ${checklistsOf(pid).map(checklistCard).join('')}
    ${filesCard(pid)}
    <div class="links padd"><button class="plain" data-act="renameList" data-proj="${esc(pid)}">${glyph('list-todo', 'g s')} Add a checklist</button><label class="plain filebtn">${glyph('image', 'g s')} Add photos or files${fileInput(pid)}</label></div></div>`;
}
