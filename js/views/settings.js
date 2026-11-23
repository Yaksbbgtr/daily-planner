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
  return s.busy ? 'Syncing…' : s.error ? s.error : s.last ? `Synced ${ago(s.last)}` : 'Signed in';
}
export function render() {
  const s = store.settings(), a = sync.apple(), on = !!sync.state.user;
  const opt = (v, t, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${t}</option>`;
  const custom = s.loc && !CITIES.includes(s.loc.name);
  const cals = a ? [...new Map(a.events.map((e) => [e.cal, e.color])).entries()].sort() : [];
  return `<header class="bar"><div class="crumb"><a class="roundbtn" href="#/today" aria-label="Back to Today">${icon('left')}</a><h1>Settings</h1></div></header><div class="narrow">
  <section class="card"><header><h2>Look</h2></header><div class="pad"><div class="themes" role="radiogroup" aria-label="Look">${[['dusk', 'Dusk', 'linear-gradient(135deg,#1d1d28 50%,#ff8a5c 50%)'], ['daylight', 'Daylight', 'linear-gradient(135deg,#f5f1eb 50%,#ff6b3d 50%)'], ['gold', 'Gold', 'linear-gradient(135deg,#0a0a0a 50%,#d9b44a 50%)'], ['ocean', 'Ocean', 'linear-gradient(135deg,#13222e 50%,#4cc9f0 50%)']].map(([v, n, g]) => `<label><input type="radio" name="theme" value="${v}" data-change="theme" ${(document.documentElement.dataset.theme || 'dusk') === v ? 'checked' : ''}><span class="sw" style="background:${g}"></span>${n}</label>`).join('')}</div></div></section>
  <section class="card"><header><h2>Jewish calendar</h2></header><div class="pad">
    <label>Location <select data-change="city">${opt('', 'Not set', s.loc ? 'x' : '')}${custom ? opt('keep', esc(s.loc.name), 'keep') : ''}${CITIES.map((c) => opt(c, c, s.loc?.name)).join('')}</select></label>
    <div class="links"><button class="plain" data-act="locate">Use this device’s location</button></div>
    <div class="row2"><label>Candle lighting <select data-change="candles">${[15, 18, 20, 22, 30, 40].map((n) => opt(n, `${n} min before`, s.candles)).join('')}</select></label>
    <label>Shabbos ends <select data-change="ends">${[['deg8.5', '8.5° (tzeis)'], ['deg7.083', '7.08°'], ['min42', '42 min'], ['min50', '50 min'], ['min60', '60 min'], ['min72', '72 min']].map(([v, t]) => opt(v, t, s.ends)).join('')}</select></label></div>
    <label>Spelling <select data-change="spelling">${opt('ashkenazi', 'Shabbos, Sukkos', s.spelling)}${opt('en', 'Shabbat, Sukkot', s.spelling)}</select></label></div></section>
  <section class="card"><header><h2>Sync</h2></header><div class="pad">${!sync.ready ? '<p>Syncing with Google is not switched on yet. Until it is, everything stays on this device.</p>' : on ? `<p>Signed in as <b>${esc(sync.state.user.email)}</b></p><p id="syncline" class="${sync.state.error ? 'late' : ''}">${esc(syncText())}</p><div class="links"><button class="plain" data-act="syncNow">Sync now</button><button class="plain" data-act="signOut">Sign out</button></div>`
    : `<p>Sign in on your phone and your computer with the same Google account. Changes show up on the other one within seconds.</p><button class="primary google" data-act="signIn">Sign in with Google</button><p id="syncmsg" class="late" role="alert"></p>`}</div></section>
  <section class="card"><header><h2>Apple Calendar</h2></header><div class="pad">${a ? `<p>Updated ${esc(ago(Date.parse(a.updated)))}. ${a.events.length} events.</p>${cals.map(([c, k]) => `<label class="check"><input type="checkbox" data-change="cal" value="${esc(c)}" ${s.hideCals.includes(c) ? '' : 'checked'}><span class="dot" style="background:${color(k)}"></span>${esc(c)}</label>`).join('')}` : `<p>${on ? 'Your Apple Calendar events can show up here too. Make a key for your Mac, then follow the steps it shows.' : 'Sign in first. Then your Mac can send your Apple Calendar events here.'}</p>`}${on ? `<div class="links"><button class="plain" data-act="macKey">${a ? 'Make a new Mac key' : 'Make a Mac key'}</button></div>` : ''}</div></section>
  <section class="card"><header><h2>Backup</h2></header><div class="pad"><p>Everything in Daily Planner as one file. Restoring adds to what is here and keeps the newest version of each thing.</p><div class="links"><button class="plain" data-act="backup">Download backup</button><label class="plain filebtn">Restore backup<input type="file" accept=".json,application/json" data-change="restore"></label></div></div></section></div>`;
}
