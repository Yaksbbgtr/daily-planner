// The Google Apps Script that turns new emails into Daily Planner tasks. It runs in your own Google
// account (script.google.com), so your mail never goes through anyone else's server.
// The app fills in the key and hands you a ready copy: Settings > Email to tasks.
export function mailScript({ url, anon, key }) {
  return `// Daily Planner: new emails become tasks. Runs every 5 minutes in your own Google account.
const PLANNER = ${JSON.stringify(url)};
const ANON = ${JSON.stringify(anon)};
const KEY = ${JSON.stringify(key)};
// Which emails become tasks, in Gmail search words. Some other choices:
//   'is:starred'            only emails you star
//   'label:planner'         only emails you give the label "planner"
//   'in:inbox'              everything in the inbox, promotions included
const WHICH = 'in:inbox category:primary';

// Run this once. It starts the 5-minute check; emails from before now are left alone.
function setup() {
  PropertiesService.getScriptProperties().setProperty('since', String(Date.now()));
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendNewEmails').timeBased().everyMinutes(5).create();
  sendNewEmails();
}

function sendNewEmails() {
  const props = PropertiesService.getScriptProperties();
  const since = Number(props.getProperty('since') || Date.now());
  const me = Session.getActiveUser().getEmail().toLowerCase();
  const mails = [];
  let newest = since;
  for (const thread of GmailApp.search(WHICH + ' newer_than:2d', 0, 50)) {
    for (const m of thread.getMessages()) {
      const at = m.getDate().getTime();
      if (at <= since || m.getFrom().toLowerCase().includes(me)) continue;
      const body = m.getPlainBody().replace(/\\s+\\n/g, '\\n').trim().slice(0, 1200);
      mails.push({ id: m.getId(), at, title: m.getSubject(), notes: 'From ' + m.getFrom() + '\\nTo ' + me + '\\n\\n' + body, link: 'https://mail.google.com/mail/u/?authuser=' + encodeURIComponent(me) + '#all/' + m.getId() });
      newest = Math.max(newest, at);
    }
  }
  for (let i = 0; i < mails.length; i += 100) {
    UrlFetchApp.fetch(PLANNER + '/rest/v1/rpc/add_mail', {
      method: 'post', contentType: 'application/json',
      headers: { apikey: ANON, Authorization: 'Bearer ' + ANON },
      payload: JSON.stringify({ key: KEY, mails: mails.slice(i, i + 100) }),
    });
  }
  props.setProperty('since', String(newest));
}
`;
}
