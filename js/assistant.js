// Ask Claude: a conversation about your whole planner. Claude answers, and when you ask for changes it proposes
// them; nothing changes until you tap Apply, and one Undo takes all of it back.
import * as D from './dates.js';
import * as store from './store.js';
import * as ai from './ai.js';
import { $, esc, sheet, toast } from './ui.js';

const SUGGEST = {
  any: ['Plan my day', 'What’s on this week?', 'What should I do next?', 'Find a good time for my overdue tasks'],
  note: ['Make tasks from this note', 'Summarize this note', 'What did I decide here?'],
  project: ['What are the next steps?', 'Plan this project out with dates', 'What is left to do?'],
  task: ['Break this into steps', 'When should I do this?'],
};

const when = (a) => [a.date ? D.friendly(a.date) : '', a.time ? D.time(a.time) + (a.end ? ' – ' + D.time(a.end) : '') : ''].filter(Boolean).join(', ');
export function describe(a) {
  const name = (a.title || store.get(a.id)?.title || '').trim();
  if (a.op === 'done') return `Check off “${name}”`;
  if (a.op === 'add') return `Add ${a.kind === 'event' ? 'event' : 'task'} “${name}”${when(a) ? ' · ' + when(a) : ''}${a.steps?.length ? ` · ${a.steps.length} steps` : ''}`;
  const cur = store.get(a.id), bits = [];
  if (a.title && a.title !== cur.title) bits.push(`rename to “${a.title}”`);
  if (a.date || a.time) bits.push(`move to ${when(a) || when({ ...cur, ...a })}`);
  if (a.dur) bits.push(`${a.dur} min`);
  if (a.star !== null && a.star !== !!cur.star) bits.push(a.star ? 'star it' : 'unstar it');
  if (a.steps?.length) bits.push(`add ${a.steps.length} steps`);
  if (a.notes) bits.push('add notes');
  if (a.proj) bits.push(`put in ${store.get(a.proj)?.title || 'a project'}`);
  return `“${cur.title}”: ${bits.join(', ') || 'update'}`;
}

const say = (t) => esc(t).replace(/\n/g, '<br>');

export function open({ focus = null, prompt = '', send = false } = {}) {
  const f = focus && store.get(focus);
  const kind = f?.k === 'note' || f?.k === 'project' || f?.k === 'task' ? f.k : 'any';
  const history = [];
  sheet(f ? `Ask Claude · ${f.title || 'Untitled'}` : 'Ask Claude', `<div class="chat" aria-live="polite"><p class="hint">${f ? 'Claude can see this and the rest of your planner.' : 'Ask about your plans, or tell Claude what to change. You approve every change.'}</p></div>
    <div class="asks">${SUGGEST[kind].map((q) => `<button type="button" class="pillbtn" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div class="askrow"><textarea id="askq" rows="1" autofocus dir="auto" placeholder="Ask anything" aria-label="Ask Claude" enterkeyhint="send">${esc(prompt)}</textarea><button type="submit" class="primary">Ask</button></div>`, {
    wide: true,
    setup: (form) => {
      const chat = $('.chat', form), q = form.querySelector('#askq');
      const bottom = () => chat.lastElementChild?.scrollIntoView({ block: 'nearest' });
      const ask = async (text) => {
        text = text.trim();
        if (!text || form.dataset.busy) return;
        form.dataset.busy = 1;
        q.value = '';
        chat.insertAdjacentHTML('beforeend', `<p class="msg me" dir="auto">${say(text)}</p><p class="msg claude wait">Thinking…</p>`);
        bottom();
        const wait = chat.lastElementChild;
        try {
          const { reply, actions } = await ai.assist(text, { history, focus });
          history.push({ role: 'user', text }, { role: 'assistant', text: [reply, ...actions.map((a) => '(proposed) ' + describe(a))].join('\n') });
          wait.classList.remove('wait');
          wait.innerHTML = say(reply || (actions.length ? 'Here is what I suggest:' : 'Done.'));
          if (actions.length) wait.after(card(actions));
        } catch (e) {
          wait.classList.remove('wait'); wait.classList.add('err');
          wait.textContent = e.message;
        }
        delete form.dataset.busy;
        bottom();
      };
      form.onsubmit = (e) => { e.preventDefault(); ask(q.value); };
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q.value); } });
      form.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => ask(b.dataset.q); });
      if (send && prompt) ask(prompt);
    },
  });
}

// The proposed changes, each with a tick, and one Apply.
function card(actions) {
  const box = document.createElement('div');
  box.className = 'proposal';
  box.innerHTML = `<ul>${actions.map((a, i) => `<li><label class="check"><input type="checkbox" checked data-i="${i}"> <span dir="auto">${esc(describe(a))}</span></label></li>`).join('')}</ul>
    <button type="button" class="primary">Apply ${actions.length === 1 ? 'this' : 'these'}</button>`;
  const btn = $('button', box);
  btn.onclick = () => {
    const picked = [...box.querySelectorAll('[data-i]:checked')].map((x) => actions[+x.dataset.i]);
    if (!picked.length) return;
    const recs = picked.map((a) => ai.apply(a));
    const undo = store.change(() => recs.forEach((r) => store.put(r)));
    box.querySelectorAll('input').forEach((x) => { x.disabled = true; });
    btn.disabled = true;
    btn.textContent = `Applied ${picked.length}`;
    toast(`Claude made ${picked.length} change${picked.length === 1 ? '' : 's'}`, undo);
  };
  return box;
}
