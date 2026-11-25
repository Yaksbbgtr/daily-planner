// The daily checklist: things that repeat every day, in four parts of the day, plus checklists of your own
// (Workout, Shabbos prep...). Each day starts fresh.
import * as D from './dates.js';
import * as store from './store.js';
import { emojiOf, glyph, iconName } from './emoji.js';
import { esc, sheet, toast, $ } from './ui.js';
import { PICKS } from './emoji.js';

export const PARTS = [['morning', 'Morning', 'sunrise'], ['afternoon', 'Afternoon', 'sun'], ['evening', 'Evening', 'sunset'], ['night', 'Night', 'moon']];
export const st = { part: null, day: null };
// Your own checklists sit after the four parts of the day; their key is their id.
export const mine = () => store.all('cklist').sort((a, b) => a.made - b.made);
export const allParts = () => [...PARTS, ...mine().map((c) => [c.id, c.title, c.emoji || 'list-todo'])];
const partName = (k) => allParts().find((p) => p[0] === k)?.[1] || 'Checklist';
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'], DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const cid = (id, day) => `c:${id}:${day}`;
export const partNow = (h = new Date().getHours()) => (h >= 4 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night');
const itemsOn = (day) => store.all('routine').filter((r) => (r.days || [0, 1, 2, 3, 4, 5, 6]).includes(D.dow(day))).sort((a, b) => (a.order ?? a.made) - (b.order ?? b.made));

export function card(day, today) {
  // A new day, or a new part of today, brings its own part forward.
  if (st.day !== day) { st.day = day; st.part = null; }
  let part = st.part || (day === today ? partNow() : 'morning');
  if (!allParts().some((p) => p[0] === part)) part = st.part = day === today ? partNow() : 'morning';
  const all = itemsOn(day);
  if (!store.all('routine').length) return `<section class="card checklist"><header><h2>Daily checklist</h2></header><p class="empty">Things you do every day, sorted into morning, afternoon, evening and night. They come back fresh each day.</p><div class="links pad-s"><button class="primary" data-act="editRoutine" data-part="${part}">Add the first one</button><button class="plain" data-act="sampleRoutine">Start with a sample</button></div></section>`;
  const done = all.filter((r) => store.get(cid(r.id, day))).length;
  const seg = allParts().map(([k, n, e]) => {
    const l = all.filter((r) => r.part === k), d = l.filter((r) => store.get(cid(r.id, day))).length;
    return `<button data-act="checkPart" data-part="${k}" aria-pressed="${k === part}" aria-label="${esc(n)}${l.length ? `, ${d} of ${l.length} done` : ''}" class="${l.length && d === l.length ? 'full' : ''}"><span class="pe">${glyph(e)}</span><span class="pn" dir="auto">${esc(n)}</span><span class="pc">${l.length && d === l.length ? `${glyph('check', 'g s')} Done` : l.length ? `${d}/${l.length}` : '–'}</span></button>`;
  }).join('');
  const here = all.filter((r) => r.part === part);
  const rows = here.map((r) => {
    const on = !!store.get(cid(r.id, day));
    // The whole bar ticks it off; the pencil edits it.
    return `<li class="${on ? 'on' : ''}"><button class="ck" data-act="toggleRoutine" data-id="${esc(r.id)}" data-day="${day}" role="checkbox" aria-checked="${on}"><span class="bubble" aria-hidden="true">${on ? glyph('check') : emojiOf({ ...r, k: 'routine' })}</span><span class="ckname" dir="auto">${esc(r.title)}</span></button><button class="editbtn" data-act="editRoutine" data-id="${esc(r.id)}" aria-label="Edit ${esc(r.title)}">${glyph('pencil')}</button></li>`;
  }).join('');
  const own = store.get(part)?.k === 'cklist';
  const name = own ? partName(part) : partName(part).toLowerCase();
  return `<section class="card checklist"><header><h2>Daily checklist</h2><span class="hint">${done}/${all.length}</span></header>
    <div class="parts" role="group" aria-label="Checklists">${seg}</div>
    ${rows ? `<ul class="cklist">${rows}</ul>` : `<p class="empty">Nothing ${own ? `in ${esc(name)}` : `for the ${name}`} yet.</p>`}
    <div class="pad-s links"><button class="plain" data-act="editRoutine" data-part="${esc(part)}">+ Add to ${esc(name)}</button></div></section>`;
}

export function toggle(id, day) {
  const key = cid(id, day);
  store.change(() => (store.get(key) ? store.remove(key) : store.put({ id: key, k: 'clog' })));
}

export function edit(r, part) {
  const isNew = !r;
  r ||= { id: store.uid(), k: 'routine', made: Date.now(), title: '', part: part || partNow(), days: [0, 1, 2, 3, 4, 5, 6] };
  const days = r.days || [0, 1, 2, 3, 4, 5, 6];
  sheet(isNew ? 'Add to checklist' : 'Checklist item', `<label>What <input name="title" ${isNew ? 'autofocus' : ''} value="${esc(r.title)}" placeholder="Make the bed"></label>
    <fieldset><legend>Which checklist</legend><div class="seg wide" role="radiogroup">${allParts().map(([k, n, e]) => `<label><input type="radio" name="part" value="${esc(k)}" ${r.part === k ? 'checked' : ''}><span>${glyph(e)} ${esc(n)}</span></label>`).join('')}</div></fieldset>
    <fieldset><legend>Days</legend><div class="days" role="group" aria-label="Days">${DAYS.map((d, i) => `<label><input type="checkbox" name="wd" value="${i}" ${days.includes(i) ? 'checked' : ''} aria-label="${DAYNAMES[i]}"><span>${d}</span></label>`).join('')}</div></fieldset>
    <fieldset><legend>Icon</legend><div class="emojis" role="radiogroup" aria-label="Icon"><label class="auto"><input type="radio" name="emoji" value="" ${r.emoji ? '' : 'checked'}><span>Auto</span></label>${PICKS.map((e) => `<label><input type="radio" name="emoji" value="${e}" ${iconName(r) === e && r.emoji ? 'checked' : ''} aria-label="${e.replace(/-/g, ' ')}"><span>${glyph(e)}</span></label>`).join('')}</div></fieldset>
    <p class="err" role="alert" hidden></p>`, {
    del: isNew ? null : 'Delete',
    on: {
      save: (f) => {
        const title = f.title.value.trim(), wd = [...f.querySelectorAll('[name=wd]:checked')].map((x) => +x.value);
        const err = (m) => { $('.err', f).textContent = m; $('.err', f).hidden = false; return false; };
        if (!title) return err('Give it a name.');
        if (!wd.length) return err('Pick at least one day.');
        const p = f.part.value || r.part;
        st.part = p;
        store.change(() => store.put({ ...r, title, part: p, days: wd, emoji: f.emoji.value || null }));
      },
      del: () => toast('Removed from the checklist', store.change(() => store.remove(r.id))),
    },
  });
}

// A checklist of your own: a name and an icon. Deleting it takes its items with it (Undo brings them back).
export function editList(c) {
  const isNew = !c;
  c ||= { id: store.uid(), k: 'cklist', made: Date.now(), title: '', emoji: null };
  sheet(isNew ? 'New checklist' : 'Checklist', `<label>Name <input name="title" ${isNew ? 'autofocus' : ''} value="${esc(c.title)}" placeholder="Workout"></label>
    <fieldset><legend>Icon</legend><div class="emojis" role="radiogroup" aria-label="Icon">${PICKS.map((e) => `<label><input type="radio" name="emoji" value="${e}" ${(c.emoji || 'list-todo') === e ? 'checked' : ''} aria-label="${e.replace(/-/g, ' ')}"><span>${glyph(e)}</span></label>`).join('')}</div></fieldset>
    <p class="err" role="alert" hidden></p>`, {
    del: isNew ? null : 'Delete checklist',
    on: {
      save: (f) => {
        const title = f.title.value.trim();
        if (!title) { $('.err', f).textContent = 'Give it a name.'; $('.err', f).hidden = false; return false; }
        st.part = c.id;
        store.change(() => store.put({ ...c, title: title.slice(0, 40), emoji: f.emoji?.value || c.emoji || 'list-todo' }));
      },
      del: () => {
        if (st.part === c.id) st.part = null;
        toast(`“${c.title}” deleted`, store.change(() => { store.all('routine').filter((r) => r.part === c.id).forEach((r) => store.remove(r.id)); store.remove(c.id); }));
      },
    },
  });
}

export function sample() {
  const S = { morning: [['Modeh Ani', 'hand-heart'], ['Make the bed', 'bed'], ['Shacharis', 'hand-heart'], ['Breakfast', 'chef-hat'], ['Vitamins', 'pill']], afternoon: [['Mincha', 'hand-heart'], ['Lunch', 'utensils'], ['Drink water', 'droplet'], ['Clear the inbox', 'mail']], evening: [['Supper', 'utensils'], ['Maariv', 'hand-heart'], ['Tidy up', 'sparkles'], ['Learn', 'book-open']], night: [['Plan tomorrow', 'folder-kanban'], ['Phone away', 'smartphone'], ['Krias Shema', 'moon'], ['Lights out', 'bed']] };
  let n = 0;
  const undo = store.change(() => { for (const [part, l] of Object.entries(S)) for (const [title, emoji] of l) store.put({ id: store.uid(), k: 'routine', made: Date.now() + n, order: n++, title, part, emoji, days: [0, 1, 2, 3, 4, 5, 6] }); });
  toast('Sample checklist added. Tap the pencil on any item to change it.', undo);
}
