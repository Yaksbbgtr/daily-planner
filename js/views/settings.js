import * as store from '../store.js';
import * as sync from '../sync.js';
import { CITIES } from '../jewish.js';
import { color, esc, icon } from '../ui.js';

export function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString('en-US');
}
export function syncText() {
  if (store.status.saveFailed) return 'This device is out of storage, so changes are not being saved. Download a backup now.';
  const s = sync.state;
  return s.busy ? 'Syncing…' : s.error ? s.error : s.last ? `Synced ${ago(s.last)}` : 'Connected';
}
export function render() {
  const s = store.settings(), a = sync.apple(), on = !!sync.state.token;
  const opt = (v, t, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${t}</option>`;
  const custom = s.loc && !CITIES.includes(s.loc.name);
  const cals = a ? [...new Map(a.events.map((e) => [e.cal, e.color])).entries()].sort() : [];
  return `<header class="bar"><div class="crumb"><a class="icon" href="#/today" aria-label="Back to Today">${icon('left')}</a><h1>Settings</h1></div></header><div class="narrow">
  <section class="card"><header><h2>Jewish calendar</h2></header><div class="pad">
    <label>Location <select data-change="city">${opt('', 'Not set', s.loc ? 'x' : '')}${custom ? opt('keep', esc(s.loc.name), 'keep') : ''}${CITIES.map((c) => opt(c, c, s.loc?.name)).join('')}</select></label>
    <div class="links"><button class="plain" data-act="locate">Use this device’s location</button></div>
    <div class="row2"><label>Candle lighting <select data-change="candles">${[15, 18, 20, 22, 30, 40].map((n) => opt(n, `${n} min before`, s.candles)).join('')}</select></label>
    <label>Shabbos ends <select data-change="ends">${[['deg8.5', 'Sun 8.5° down'], ['deg7.083', 'Sun 7.08° down'], ['min42', '42 min'], ['min50', '50 min'], ['min60', '60 min'], ['min72', '72 min']].map(([v, t]) => opt(v, t, s.ends)).join('')}</select></label></div>
    <label>Spelling <select data-change="spelling">${opt('ashkenazi', 'Shabbos, Sukkos', s.spelling)}${opt('en', 'Shabbat, Sukkot', s.spelling)}</select></label></div></section>
  <section class="card"><header><h2>Sync</h2></header><div class="pad">${on ? `<p id="syncline" class="${sync.state.error ? 'late' : ''}">${esc(syncText())}</p><div class="links"><button class="plain" data-act="syncNow">Sync now</button><button class="plain" data-act="syncOff">Stop syncing here</button></div>`
    : `<p>Keep your phone and Mac in step through a secret gist on your GitHub account. Make a token with only the <b>gist</b> box ticked, then paste it on each device. The token from your Cosmeredle sync works too.</p>
    <p><a href="https://github.com/settings/tokens/new?scopes=gist&amp;description=Daily Planner" target="_blank" rel="noopener noreferrer">Make a token on GitHub</a></p>
    <form class="inline" data-submit="syncOn"><input id="token" name="t" type="password" autocomplete="off" placeholder="Paste token" aria-label="GitHub token"><button class="primary">Connect</button></form><p id="syncmsg" class="late" role="alert"></p>
    <p class="hint">A secret gist is unlisted, not locked: anyone who had its exact link could read it.</p>`}</div></section>
  <section class="card"><header><h2>Apple Calendar</h2></header><div class="pad">${a ? `<p>Updated ${esc(ago(Date.parse(a.updated)))}. ${a.events.length} events.</p>${cals.map(([c, k]) => `<label class="check"><input type="checkbox" data-change="cal" value="${esc(c)}" ${s.hideCals.includes(c) ? '' : 'checked'}><span class="dot" style="background:${color(k)}"></span>${esc(c)}</label>`).join('')}` : `<p>${on ? 'Run the helper on your Mac once and your Apple Calendar events appear here:' : 'Connect sync first, then run the helper on your Mac:'}</p><p><code>~/daily-planner/mac/install.sh</code></p>`}</div></section>
  <section class="card"><header><h2>Backup</h2></header><div class="pad"><p>Everything in Daily Planner as one file. Restoring adds to what is here and keeps the newest version of each thing.</p><div class="links"><button class="plain" data-act="backup">Download backup</button><label class="plain filebtn">Restore backup<input type="file" accept=".json,application/json" data-change="restore"></label></div></div></section></div>`;
}
