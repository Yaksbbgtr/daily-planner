// Morning planning and evening wrap-up, after Sunsama's daily rituals.
import * as D from './dates.js';
import * as store from './store.js';
import { emojiOf } from './emoji.js';
import { esc, sheet, toast, color } from './ui.js';

const row = (t, opts, pick) => `<li class="task"><div class="text" style="--c:${color(t.color)}"><span class="bubble" aria-hidden="true">${emojiOf(t)}</span><span class="tx"><span class="t">${esc(t.title)}</span>${t.date ? `<span class="meta">${esc(D.friendly(t.date))}</span>` : ''}</span></div>
  <div class="movebtns" role="group" aria-label="${esc(t.title)}">${opts.map(([v, n]) => `<button type="button" data-id="${esc(t.id)}" data-v="${v}" aria-pressed="${v === pick}">${n}</button>`).join('')}</div></li>`;

function choices(form) {
  form.addEventListener('click', (e) => {
    const b = e.target.closest('.movebtns button');
    if (!b) return;
    b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  });
  return () => Object.fromEntries([...form.querySelectorAll('.movebtns [aria-pressed=true]')].map((b) => [b.dataset.id, b.dataset.v]));
}

export function planDay() {
  const today = D.iso();
  const late = store.all('task').filter((t) => !t.done && t.date && t.date < today);
  const inbox = store.all('task').filter((t) => !t.done && !t.date).slice(0, 30);
  const due = store.all('task').filter((t) => !t.done && t.date === today);
  let read;
  sheet('Plan your day', `<p class="hint">${due.length ? `${due.length} task${due.length > 1 ? 's' : ''} already on today.` : 'Nothing on today yet.'} Choose what else today is for.</p>
    ${late.length ? `<h3>Left from before</h3><ul class="rows card ritual-list">${late.map((t) => row(t, [['today', 'Today'], ['later', 'Later'], ['done', 'Done']], 'today')).join('')}</ul>` : ''}
    ${inbox.length ? `<h3>From your inbox</h3><ul class="rows card ritual-list">${inbox.map((t) => row(t, [['today', 'Today'], ['skip', 'Not today']], 'skip')).join('')}</ul>` : ''}
    ${!late.length && !inbox.length ? '<p class="bigcount">☀️</p><p class="hint" style="text-align:center">You are all caught up.</p>' : ''}`, {
    save: 'Start my day',
    setup: (f) => { read = choices(f); },
    on: { save: () => {
      const pick = read();
      const undo = store.change(() => {
        for (const [id, v] of Object.entries(pick)) {
          const t = store.get(id);
          if (!t) continue;
          if (v === 'today') store.put({ ...t, date: today });
          else if (v === 'later') store.put({ ...t, date: null });
          else if (v === 'done') store.put({ ...t, done: Date.now() });
        }
        store.put({ id: 'plan:' + today, k: 'mark' });
      });
      toast('Your day is planned', undo);
    } },
  });
}

export function wrapDay() {
  const today = D.iso(), tomorrow = D.addDays(today, 1);
  const done = store.all('task').filter((t) => t.done && D.iso(new Date(t.done)) === today);
  const open = store.all('task').filter((t) => !t.done && t.date && t.date <= today);
  let read;
  sheet('Wrap up the day', `<p class="bigcount">${done.length ? `${done.length} 🎉` : '🌙'}</p><p class="hint" style="text-align:center">${done.length ? `You finished ${done.length} task${done.length > 1 ? 's' : ''} today.` : 'A quiet day. That counts too.'}</p>
    ${open.length ? `<h3>Still open</h3><ul class="rows card ritual-list">${open.map((t) => row(t, [['tomorrow', 'Tomorrow'], ['later', 'Later'], ['done', 'Done']], 'tomorrow')).join('')}</ul>` : ''}
    <label>A line for your journal <textarea name="j" rows="3" placeholder="What went well today?">${esc(store.get('j:' + today)?.body)}</textarea></label>`, {
    save: 'Close the day',
    setup: (f) => { read = choices(f); },
    on: { save: (f) => {
      const pick = read(), j = f.j.value;
      const undo = store.change(() => {
        for (const [id, v] of Object.entries(pick)) {
          const t = store.get(id);
          if (!t) continue;
          if (v === 'tomorrow') store.put({ ...t, date: tomorrow });
          else if (v === 'later') store.put({ ...t, date: null });
          else if (v === 'done') store.put({ ...t, done: Date.now() });
        }
        if (j.trim() && j !== store.get('j:' + today)?.body) store.put({ id: 'j:' + today, k: 'journal', body: j });
        store.put({ id: 'wrap:' + today, k: 'mark' });
      });
      toast('Good night', undo);
    } },
  });
}

export function rollOver() {
  const today = D.iso();
  const late = store.all('task').filter((t) => !t.done && t.date && t.date < today);
  toast(`Moved ${late.length} to today`, store.change(() => late.forEach((t) => store.put({ ...t, date: today }))));
}
