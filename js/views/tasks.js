import * as D from '../dates.js';
import * as store from '../store.js';
import { taskSort } from '../agenda.js';
import { taskRow } from '../editors.js';
import { emojiOf } from '../emoji.js';
import { color, esc, icon, ring } from '../ui.js';

export const st = { tag: null };
const head = (tab, extra = '') => `<header class="bar"><h1>Tasks</h1><div class="tools"><div class="seg" role="group" aria-label="View"><button data-act="go" data-to="#/tasks" aria-pressed="${tab === 'tasks'}">Tasks</button><button data-act="go" data-to="#/tasks/projects" aria-pressed="${tab === 'projects'}">Projects</button></div>${extra}</div></header>`;
export const tasksOf = (pid) => store.all('task').filter((t) => t.proj === pid);

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
  return head('projects', '<button class="primary" data-act="editProject">New project</button>') + (all.length ? `<div class="tiles">${all.map(tile).join('')}</div>` : '<p class="empty big">A project holds the tasks for something bigger: a move, a simcha, a trip. Each task can have its own subtasks.</p>');
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
    ${done.length ? `<section class="card"><details id="pdone-${esc(pid)}"><summary>${done.length} done</summary><ul class="rows">${done.map(row).join('')}</ul></details></section>` : ''}</div>`;
}
