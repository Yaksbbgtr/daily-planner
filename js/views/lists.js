import * as store from '../store.js';
import { esc, icon } from '../ui.js';

export const itemsOf = (id) => store.all('item').filter((x) => x.list === id).sort((a, b) => a.made - b.made);
export function render(id) {
  const l = id && store.get(id);
  if (l?.k === 'list') {
    const items = itemsOf(id), done = items.filter((x) => x.on);
    const row = (x) => `<li class="task ${x.on ? 'done' : ''}"><button class="tick" data-act="toggleItem" data-id="${esc(x.id)}" role="checkbox" aria-checked="${!!x.on}" aria-label="${esc(x.title)}"></button><button class="text" data-act="toggleItem" data-id="${esc(x.id)}"><span class="t" dir="auto">${esc(x.title)}</span></button><button class="icon faint" data-act="removeItem" data-id="${esc(x.id)}" aria-label="Remove ${esc(x.title)}">${icon('close')}</button></li>`;
    return `<header class="bar"><div class="crumb"><a class="icon" href="#/lists" aria-label="All lists">${icon('left')}</a><h1 dir="auto">${esc(l.title)}</h1></div><div class="tools"><button class="plain" data-act="renameList" data-id="${esc(id)}">Edit</button></div></header>
      <div class="narrow"><form class="inline" data-submit="addItem" data-list="${esc(id)}"><input id="newitem" name="t" autocomplete="off" enterkeyhint="done" placeholder="Add an item" aria-label="Add an item"><button class="primary">Add</button></form>
      ${items.length ? `<section class="card"><ul class="rows">${items.filter((x) => !x.on).map(row).join('')}${done.map(row).join('')}</ul></section>` : '<p class="empty big">This list is empty.</p>'}
      ${done.length ? `<div class="links"><button class="plain" data-act="uncheckAll" data-id="${esc(id)}">Uncheck all</button><button class="plain" data-act="clearChecked" data-id="${esc(id)}">Remove checked</button></div>` : ''}</div>`;
  }
  const lists = store.all('list').sort((a, b) => a.made - b.made);
  return `<header class="bar"><h1>Lists</h1><div class="tools"><button class="primary" data-act="renameList">New list</button></div></header>
    ${lists.length ? `<div class="tiles">${lists.map((x) => { const it = itemsOf(x.id), left = it.filter((i) => !i.on); return `<a class="card tile" href="#/lists/${esc(x.id)}"><h2 dir="auto">${esc(x.title)}</h2><p class="hint">${left.length ? `${left.length} left` : it.length ? 'All checked' : 'Empty'}</p><p class="peek" dir="auto">${left.slice(0, 4).map((i) => esc(i.title)).join(', ')}</p></a>`; }).join('')}</div>` : '<p class="empty big">Shopping, packing, anything you check off and reuse.</p>'}`;
}
