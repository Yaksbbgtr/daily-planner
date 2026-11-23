export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Safe in a style attribute: anything that is not a plain hex color becomes the fallback.
export const color = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : 'var(--accent)');

const PATHS = {
  today: '<path d="M4 17h16M7.5 17a4.5 4.5 0 0 1 9 0M12 8.5V6M6 11 4.6 9.600M18 11l1.400-1.400M9 20.500h6"/>',
  calendar: '<rect x="4" y="5.500" width="16" height="14.500" rx="2.500"/><path d="M4 10h16M8.500 3.500v4M15.500 3.500v4"/>',
  tasks: '<circle cx="12" cy="12" r="8.500"/><path d="m8.500 12.200 2.500 2.500 4.800-5.200"/>',
  lists: '<path d="M9.500 6.500H20M9.500 12H20M9.500 17.500H20M4.500 6.500h.01M4.500 12h.01M4.500 17.500h.01"/>',
  notes: '<path d="M6 4h8.500L19 8.500V20H6zM14 4v5h5M9 13h7M9 16.500h5"/>',
  settings: '<path d="M4 7.500h9M17.500 7.500H20M4 16.500h2.500M11 16.500h9"/><circle cx="15.200" cy="7.500" r="2.200"/><circle cx="8.700" cy="16.500" r="2.200"/>',
  left: '<path d="m14.500 6-6 6 6 6"/>', right: '<path d="m9.500 6 6 6-6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  repeat: '<path d="M5 11V9.500A3.500 3.500 0 0 1 8.500 6H19l-3-3M19 13v1.500a3.500 3.500 0 0 1-3.500 3.500H5l3 3"/>',
};
export const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${PATHS[n]}</svg>`;

let toastTimer;
export function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button">${undo.label || 'Undo'}</button>` : ''}`;
  t.hidden = false;
  if (undo) $('button', t).onclick = () => { t.hidden = true; undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

// Opens the sheet. Handlers in `on` are called with the form element.
export function sheet(title, body, { on = {}, setup, save = 'Save', del, wide } = {}) {
  const d = $('#sheet');
  if (d.open) d.close();
  d.className = wide ? 'wide' : '';
  d.setAttribute('aria-label', title);
  d.innerHTML = `<form method="dialog" novalidate><span class="grabber" aria-hidden="true"></span><header>${on.save ? '<button type="button" class="txt" data-close>Cancel</button>' : '<span></span>'}<h2>${esc(title)}</h2>${on.save ? `<button class="primary" type="submit">${esc(save)}</button>` : '<button type="button" class="txt strong" data-close>Done</button>'}</header>
    <div class="body">${body}${del ? `<button type="button" class="danger wide" data-del>${esc(del)}</button>` : ''}</div></form>`;
  const form = $('form', d);
  form.onsubmit = (e) => { e.preventDefault(); if (on.save && on.save(form) !== false) d.close(); };
  d.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => d.close(); });
  if (del) $('[data-del]', d).onclick = () => { d.close(); on.del(); };
  // Close on a press that starts on the backdrop, not a drag that merely ends there.
  d.onpointerdown = (e) => { if (e.target === d) d.close(); };
  setup?.(form, d);
  d.showModal();
  (form.querySelector('[autofocus]') || form.querySelector('[data-close]')).focus();
  return d;
}
export const closeSheet = () => $('#sheet').close();

export function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
