import * as D from '../dates.js';
import * as store from '../store.js';
import * as sync from '../sync.js';
import { CITIES } from '../jewish.js';
import { color, esc, icon } from '../ui.js';
import * as notify from '../notify.js';
import * as R from '../reminders.js';

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
const ACCENTS = [['#ff8a5c', 'Coral'], ['#ff5a5f', 'Red'], ['#ff7eb6', 'Pink'], ['#b69cff', 'Lavender'], ['#7c5cff', 'Violet'], ['#0088ff', 'Blue'], ['#4cc9f0', 'Sky'], ['#2ec4b6', 'Teal'], ['#5fd3a5', 'Mint'], ['#d9b44a', 'Gold'], ['#ffffff', 'White'], ['#111111', 'Black']];
const BGS = [['#000000', 'Black'], ['#121212', 'Charcoal'], ['#1c1c1e', 'Graphite'], ['#0f1724', 'Navy'], ['#0f1a14', 'Forest'], ['#1a1210', 'Espresso'], ['#f5f1eb', 'Cream'], ['#ffffff', 'White']];
const INKS = [['#ffffff', 'White'], ['#d6d6d6', 'Silver'], ['#8e8e93', 'Grey'], ['#e8d9a8', 'Champagne'], ['#d9b44a', 'Gold'], ['#ff5a5f', 'Red'], ['#0088ff', 'Blue'], ['#5fd3a5', 'Mint'], ['#b69cff', 'Lavender'], ['#111111', 'Black']];
const HLS = [['none', 'No highlight'], ['#ffffff', 'White'], ['#8e8e93', 'Grey'], ['#d9b44a', 'Gold'], ['#ff5a5f', 'Red'], ['#0088ff', 'Blue'], ['#5fd3a5', 'Mint'], ['#b69cff', 'Lavender'], ['#000000', 'Black']];
// A row of round swatches, plus one that opens the system color picker for any color at all.
const colorRow = (name, label, list, cur) => {
  const custom = cur && !list.some(([c]) => c === cur);
  return `<fieldset class="swatches"><legend>${label}</legend><div class="row">
    <label title="The look's own"><input type="radio" name="${name}" value="" data-change="${name}" ${cur ? '' : 'checked'} aria-label="The look's own ${label.toLowerCase()}"><span class="auto">Look</span></label>
    ${list.map(([c, n]) => `<label title="${n}"><input type="radio" name="${name}" value="${c}" data-change="${name}" ${cur === c ? 'checked' : ''} aria-label="${n}"><span style="background:${c === 'none' ? 'transparent' : c}" class="${c === 'none' ? 'nohl' : ''}"></span></label>`).join('')}
    <label class="pick" title="Any color"><input type="color" value="${esc(cur || ({ bg: '#000000', ink: '#ffffff', hl: '#8e8e93' }[name] || '#ff8a5c'))}" data-change="${name}" aria-label="Pick any ${label.toLowerCase()}"><span ${custom ? `style="background:${esc(cur)}" class="on"` : ''}>${custom ? '' : '+'}</span></label>
  </div></fieldset>`;
};
export function render() {
  const s = store.settings(), a = sync.apple(), on = !!sync.state.user;
  const opt = (v, t, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${t}</option>`;
  const custom = s.loc && !CITIES.includes(s.loc.name);
  const cals = a ? [...new Map(a.events.map((e) => [e.cal, e.color])).entries()].sort() : [];
  return `<header class="bar"><div class="crumb"><a class="roundbtn" href="#/today" aria-label="Back to Today">${icon('left')}</a><h1>Settings</h1></div></header><div class="narrow">
  <section class="card"><header><h2>Look</h2></header><div class="pad"><div class="themes" role="radiogroup" aria-label="Look">${[['dusk', 'Dusk', 'linear-gradient(135deg,#050505 50%,#ff8a5c 50%)'], ['daylight', 'Daylight', 'linear-gradient(135deg,#f5f1eb 50%,#ff6b3d 50%)'], ['gold', 'Gold', 'linear-gradient(135deg,#0a0a0a 50%,#d9b44a 50%)'], ['ocean', 'Ocean', 'linear-gradient(135deg,#13222e 50%,#4cc9f0 50%)']].map(([v, n, g]) => `<label><input type="radio" name="theme" value="${v}" data-change="theme" ${(document.documentElement.dataset.theme || 'dusk') === v ? 'checked' : ''}><span class="sw" style="background:${g}"></span>${n}</label>`).join('')}</div>
    ${colorRow('accent', 'Accent color', ACCENTS, s.accent)}
    ${colorRow('bg', 'Background', BGS, s.bg)}
    ${colorRow('ink', 'Button text', INKS, s.ink)}
    ${colorRow('hl', 'Button highlight', HLS, s.hl)}
    <p class="hint btnsample">Buttons like <span class="plain">Add</span> <span class="plain">Past days</span> and the tab you're on. The highlight follows the button text unless you pick one.</p>
    ${s.accent || s.bg || s.ink || s.hl ? '<button class="plain" data-act="resetColors">Use the look’s own colors</button>' : ''}</div></section>
  <section class="card"><header><h2>Jewish calendar</h2></header><div class="pad">
    <label>Location <select data-change="city">${opt('', 'Not set', s.loc ? 'x' : '')}${custom ? opt('keep', esc(s.loc.name), 'keep') : ''}${CITIES.map((c) => opt(c, c, s.loc?.name)).join('')}</select></label>
    <div class="links"><button class="plain" data-act="locate">Use this device’s location</button></div>
    <div class="row2"><label>Candle lighting <select data-change="candles">${[15, 18, 20, 22, 30, 40].map((n) => opt(n, `${n} min before`, s.candles)).join('')}</select></label>
    <label>Shabbos ends <select data-change="ends">${[['deg8.5', '8.5° (tzeis)'], ['deg7.083', '7.08°'], ['min42', '42 min'], ['min50', '50 min'], ['min60', '60 min'], ['min72', '72 min']].map(([v, t]) => opt(v, t, s.ends)).join('')}</select></label></div>
    <label>Spelling <select data-change="spelling">${opt('ashkenazi', 'Shabbos, Sukkos', s.spelling)}${opt('en', 'Shabbat, Sukkot', s.spelling)}</select></label></div></section>
  <section class="card"><header><h2>Sync</h2></header><div class="pad">${!sync.ready ? '<p>Syncing with Google is not switched on yet. Until it is, everything stays on this device.</p>' : on ? `<p>Signed in as <b>${esc(sync.state.user.email)}</b></p><p id="syncline" class="${sync.state.error ? 'late' : ''}">${esc(syncText())}</p><div class="links"><button class="plain" data-act="syncNow">Sync now</button><button class="plain" data-act="signOut">Sign out</button></div>`
    : `<p>Sign in on your phone and your computer with the same Google account. Changes show up on the other one within seconds.</p><button class="primary google" data-act="signIn">Sign in with Google</button><p id="syncmsg" class="late" role="alert"></p>`}</div></section>
  ${reminders(s, on)}
  <section class="card"><header><h2>Apple Calendar</h2></header><div class="pad">${a ? `<p>Updated ${esc(ago(Date.parse(a.updated)))}. ${a.events.length} events.</p>${cals.map(([c, k]) => `<label class="calrow"><span class="dot" style="background:${color(k)}"></span><span class="nm" dir="auto">${esc(c)}</span><input type="checkbox" class="switch" data-change="cal" value="${esc(c)}" ${s.hideCals.includes(c) ? '' : 'checked'} aria-label="Show ${esc(c)}"></label>`).join('')}` : `<p>${on ? 'Your Apple Calendar events can show up here too. Make a key for your Mac, then follow the steps it shows.' : 'Sign in first. Then your Mac can send your Apple Calendar events here.'}</p>`}${on ? `<div class="links"><button class="plain" data-act="macKey">${a ? 'Make a new Mac key' : 'Make a Mac key'}</button></div>` : ''}</div></section>
  <section class="card"><header><h2>Email to tasks</h2></header><div class="pad"><p>${s.mailOn ? `On since ${esc(D.friendly(new Date(s.mailOn).toISOString().slice(0, 10)))}. New emails that ask you to do something (assignments, due dates, quizzes, forms, \u201caction required\u201d) show up in Tasks under Inbox, tagged #email, within about 5 minutes. Codes, receipts, sales, newsletters, grade notices and chat stay in Gmail.` : 'New emails in your Gmail Primary inbox can show up as tasks by themselves. A small script runs in your own Google account to do it; nothing else reads your mail.'}</p>
    ${on ? `<button class="plain" data-act="mailSetup">${s.mailOn ? 'Add another Gmail account' : 'Set up email to tasks'}</button>` : '<p class="hint">Sign in with Google first (Sync, above).</p>'}</div></section>
  <section class="card"><header><h2>Phone widget</h2></header><div class="pad"><p>${s.widgetOn ? 'Your widget is set up. Making a new one gives that widget its own key; the old ones keep working.' : 'See today\'s schedule and tasks on your iPhone Home Screen or Lock Screen. It uses the free Scriptable app. Do this on your phone.'}</p>
    ${on ? `<button class="plain" data-act="widgetSetup">${s.widgetOn ? 'Set up another widget' : 'Set up the widget'}</button>` : '<p class="hint">Sign in with Google first (Sync, above).</p>'}</div></section>
  <section class="card"><header><h2>Backup</h2></header><div class="pad"><p>Everything in Daily Planner as one file. Restoring adds to what is here and keeps the newest version of each thing.</p><div class="links"><button class="plain" data-act="backup">Download backup</button><label class="plain filebtn">Restore backup<input type="file" accept=".json,application/json" data-change="restore"></label></div></div></section>
  <section class="card"><header><h2>App</h2></header><div class="pad"><p class="hint">Version ${esc(document.querySelector('meta[name=app-version]')?.content || '')}</p><div class="links"><button class="plain" data-act="forceUpdate">Get the latest version</button></div></div></section></div>`;
}

function reminders(s, on) {
  const st = notify.status();
  const opt = (v, t, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${t}</option>`;
  const ev = s.remEv ?? R.DEFAULTS.remEv, tk = s.remTask ?? R.DEFAULTS.remTask, dy = s.remDay ?? R.DEFAULTS.remDay;
  const leads = (cur) => opt(-1, 'Off', cur) + R.LEADS.map(([v, n]) => opt(v, n, cur)).join('');
  const msg = !notify.ready() ? 'Reminders are not switched on for this app yet.'
    : !on ? 'Sign in first (Sync, below). Then your phone and computer can remind you of tasks and events.'
    : st === 'install' ? 'On iPhone, add Daily Planner to your Home Screen first: in Safari tap Share, then <b>Add to Home Screen</b>. Open it from there and come back here.'
    : st === 'unsupported' ? 'This browser cannot show notifications. On iPhone, use the app from your Home Screen (iOS 16.4 or later).'
    : st === 'blocked' ? 'Notifications are blocked for Daily Planner. On iPhone: Settings > Notifications > Planner. On a computer: the site settings in your browser.'
    : st === 'on' ? 'On for this device. Each device you want reminders on needs this turned on once.'
    : 'Get a notification before events and timed tasks, and a morning note with the day’s to-dos. Turn it on on each device you want them on.';
  let soon = [];
  if (st === 'on') {
    const now = Date.now();
    try { soon = R.due({ recs: Object.values(store.everything()), apple: sync.apple(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, from: now, to: now + 36 * 3600e3 }).slice(0, 4); } catch { /* none */ }
  }
  const when = (ms) => new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return `<section class="card"><header><h2>Reminders</h2></header><div class="pad"><p>${msg}</p>
    ${notify.ready() && on && ['off', 'on'].includes(st) ? `<div class="links">${st === 'on' ? '<button class="plain" data-act="pushTest">Send a test</button><button class="plain" data-act="pushOff">Turn off here</button>' : '<button class="primary" data-act="pushOn">Turn on reminders</button>'}</div>` : ''}
    <div class="row2"><label>Events <select data-change="remEv">${leads(ev)}</select></label><label>Tasks with a time <select data-change="remTask">${leads(tk)}</select></label></div>
    <label>Morning note (all-day things and to-dos) <select data-change="remDay">${opt('', 'Off', dy)}${['06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '10:00'].map((t) => opt(t, D.time(t), dy)).join('')}</select></label>
    <p class="hint">Each task and event can have its own reminder too, in its Reminder setting.</p>
    ${soon.length ? `<p class="hint"><b>Coming up:</b> ${soon.map((x) => `${esc(when(x.at))} · ${esc(x.title)}`).join('; ')}</p>` : ''}</div></section>`;
}
