// The daily checklist: things that repeat every day, in four parts of the day. Each day starts fresh.
import * as D from './dates.js';
import * as store from './store.js';
import { emojiOf, glyph, iconName } from './emoji.js';
import { esc, sheet, toast, $ } from './ui.js';
import { PICKS } from './emoji.js';

export const PARTS = [['morning', 'Morning', 'sunrise'], ['afternoon', 'Afternoon', 'sun'], ['evening', 'Evening', 'sunset'], ['night', 'Night', 'moon']];
export const st = { part: null, day: null };
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'], DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const cid = (id, day) => `c:${id}:${day}`;
export const partNow = (h = new Date().getHours()) => (h >= 4 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night');
const itemsOn = (day) => store.all('routine').filter((r) => (r.days || [0, 1, 2, 3, 4, 5, 6]).includes(D.dow(day))).sort((a, b) => (a.order ?? a.made) - (b.order ?? b.made));

export function card(day, today) {
  // A new day, or a new part of today, brings its own part forward.
  if (st.day !== day) { st.day = day; st.part = null; }
  const part = st.part || (day === today ? partNow() : 'morning');
  const all = itemsOn(day);
  if (!store.all('routine').length) return `<section class="card checklist"><header><h2>Daily checklist</h2></header><p class="empty">Things you do every day, sorted into morning, afternoon, evening and night. They come back fresh each day.</p><div class="links pad-s"><button class="primary" data-act="editRoutine" data-part="${part}">Add the first one</button><button class="plain" data-act="sampleRoutine">Start with a sample</button></div></section>`;
  const done = all.filter((r) => store.get(cid(r.id, day))).length;
  const seg = PARTS.map(([k, n, e]) => {
    const l = all.filter((r) => r.part === k), d = l.filter((r) => store.get(cid(r.id, day))).length;
    return `<button data-act="checkPart" data-part="${k}" aria-pressed="${k === part}" class="${l.length && d === l.length ? 'full' : ''}"><span class="pe">${glyph(e)}</span><span class="pn">${n}</span><span class="pc">${l.length ? `${d}/${l.length}` : '–'}</span></button>`;
  }).join('');
  const mine = all.filter((r) => r.part === part);
  const rows = mine.map((r) => {
    const on = !!store.get(cid(r.id, day));
    return `<li class="${on ? 'on' : ''}"><button class="ck" data-act="toggleRoutine" data-id="${esc(r.id)}" data-day="${day}" role="checkbox" aria-checked="${on}" aria-label="${esc(r.title)}"><span class="bubble" aria-hidden="true">${on ? glyph('check') : emojiOf({ ...r, k: 'routine' })}</span></button><button class="ckname" data-act="editRoutine" data-id="${esc(r.id)}" dir="auto">${esc(r.title)}</button></li>`;
  }).join('');
  const name = PARTS.find((p) => p[0] === part)[1].toLowerCase();
  return `<section class="card checklist"><header><h2>Daily checklist</h2><span class="hint">${done}/${all.length}</span></header>
    <div class="parts" role="group" aria-label="Part of the day">${seg}</div>
    ${rows ? `<ul class="cklist">${rows}</ul>` : `<p class="empty">Nothing for the ${name} yet.</p>`}
    <div class="pad-s"><button class="plain" data-act="editRoutine" data-part="${part}">+ Add to ${name}</button></div></section>`;
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
    <fieldset><legend>When</legend><div class="seg wide" role="radiogroup">${PARTS.map(([k, n, e]) => `<label><input type="radio" name="part" value="${k}" ${r.part === k ? 'checked' : ''}><span>${glyph(e)} ${n}</span></label>`).join('')}</div></fieldset>
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

export function sample() {
  const S = { morning: [['Modeh Ani', 'hand-heart'], ['Make the bed', 'bed'], ['Shacharis', 'hand-heart'], ['Breakfast', 'chef-hat'], ['Vitamins', 'pill']], afternoon: [['Mincha', 'hand-heart'], ['Lunch', 'utensils'], ['Drink water', 'droplet'], ['Clear the inbox', 'mail']], evening: [['Supper', 'utensils'], ['Maariv', 'hand-heart'], ['Tidy up', 'sparkles'], ['Learn', 'book-open']], night: [['Plan tomorrow', 'folder-kanban'], ['Phone away', 'smartphone'], ['Krias Shema', 'moon'], ['Lights out', 'bed']] };
  let n = 0;
  const undo = store.change(() => { for (const [part, l] of Object.entries(S)) for (const [title, emoji] of l) store.put({ id: store.uid(), k: 'routine', made: Date.now() + n, order: n++, title, part, emoji, days: [0, 1, 2, 3, 4, 5, 6] }); });
  toast('Sample checklist added. Tap any item name to change it.', undo);
}
