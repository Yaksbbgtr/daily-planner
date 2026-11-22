import * as D from '../dates.js';
import * as store from '../store.js';
import { taskSort } from '../agenda.js';
import { taskRow } from '../editors.js';
import { esc } from '../ui.js';

export const st = { tag: null };
export function render() {
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
    ['No date', open.filter((t) => !t.date)],
  ].filter(([, l]) => l.length);
  return `<header class="bar"><h1>Tasks</h1></header>
    <div class="narrow"><form class="inline" data-submit="addTask"><input id="newtask" name="t" autocomplete="off" enterkeyhint="done" placeholder="Call bank tomorrow #home" aria-label="Add a task"><button class="primary">Add</button></form>
    ${tags.length ? `<div class="chips tags"><button class="chip" data-act="tag" data-tag="" aria-pressed="${!st.tag}">All</button>${tags.map((t) => `<button class="chip" data-act="tag" data-tag="${esc(t)}" aria-pressed="${st.tag === t}">#${esc(t)}</button>`).join('')}</div>` : ''}
    ${groups.length ? groups.map(([n, l, c]) => `<section class="card"><header><h2 class="${c || ''}">${n}</h2><span class="hint">${l.length}</span></header><ul class="rows">${l.map((t) => taskRow(t, { showDate: n !== 'Today' })).join('')}</ul></section>`).join('') : '<p class="empty big">Nothing to do. Add a task above.</p>'}
    ${done.length ? `<section class="card"><details id="alldone"><summary>${done.length} done</summary><ul class="rows">${done.slice(0, 100).map((t) => taskRow(t)).join('')}</ul><button class="plain" data-act="clearDone">Delete all done tasks</button></details></section>` : ''}</div>`;
}
