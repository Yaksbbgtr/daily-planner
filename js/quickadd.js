// Turns "Dentist tomorrow 3-4pm #health !" into a structured entry.
import { addDays, dow, iso, isRealDate, startOfWeek, addMinutes } from './dates.js';

const DAY = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, shabbos: 6, shabbat: 6, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sun: 0, sat: 6 };
const LONG = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday|shabbos|shabbat';
const ABBR = 'mon|tues?|wed|thu(?:rs?)?|fri|sun|sat';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const p2 = (n) => String(n).padStart(2, '0');

function clock(h, m, ap, guess) {
  h = +h; m = +(m || 0);
  if (m > 59 || h > 23) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap[0].toLowerCase() === 'p' ? 12 : 0);
  } else if (guess && h >= 1 && h <= 6) h += 12;
  return `${p2(h)}:${p2(m)}`;
}

export function parse(text, today = iso()) {
  let s = ' ' + text.trim() + ' ';
  const out = { title: '', date: null, time: null, end: null, rule: null, star: false, tags: [] };
  // Runs fn on the first match; cuts the match out unless fn returns false.
  const take = (re, fn) => {
    const m = re.exec(s);
    if (!m || fn(m) === false) return false;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    return true;
  };

  while (take(/\s#([\p{L}\p{N}_-]+)(?=\s)/u, (m) => { const t = m[1].toLowerCase(); if (!out.tags.includes(t)) out.tags.push(t); }));
  take(/\s!+(?=\s)/, () => { out.star = true; });

  // Repeats
  const every = (f, n = 1, days) => { out.rule = { f, n, ...(days ? { days } : {}) }; };
  take(/\s(?:every\s*day|daily)(?=\s)/i, () => every('daily'))
    || take(/\severy\s+weekday(?=\s)/i, () => every('weekly', 1, [1, 2, 3, 4, 5]))
    || take(new RegExp(`\\severy\\s+((?:(?:${LONG}|${ABBR})(?:\\s*(?:,|and|&)\\s*|(?=\\s)))+)(?=\\s)`, 'i'), (m) => {
      const days = [...new Set((m[1].toLowerCase().match(/[a-z]+/g) || []).filter((w) => w in DAY).map((w) => DAY[w]))].sort();
      every('weekly', 1, days);
    })
    || take(/\severy\s+(other|\d{1,2})\s+(day|week|month|year)s?(?=\s)/i, (m) => {
      const n = m[1].toLowerCase() === 'other' ? 2 : +m[1];
      if (!n) return false;
      every({ day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[m[2].toLowerCase()], n);
    })
    || take(/\s(?:every\s+(week|month|year)|(weekly|monthly|yearly))(?=\s)/i, (m) => {
      every(m[2] ? m[2].toLowerCase() : m[1].toLowerCase() + 'ly');
    });

  // Numeric dates before times, so 11/30 and 2026-11-30 are not read as clock times.
  const setYmd = (y, m, d) => {
    let v = `${y}-${p2(m)}-${p2(d)}`;
    if (!isRealDate(v)) return false;
    out.date = v;
  };
  const year = (given, m, d) => {
    if (given) return given.length === 2 ? 2000 + +given : +given;
    const y = +today.slice(0, 4);
    return `${y}-${p2(m)}-${p2(d)}` < today ? y + 1 : y;
  };
  const dated = take(/\s(?:on\s+)?(\d{4})-(\d\d)-(\d\d)(?=\s)/i, (m) => setYmd(+m[1], +m[2], +m[3]))
    || take(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?=[\s,])/i, (m) => setYmd(year(m[3], m[1], m[2]), m[1], m[2]))
    || take(new RegExp(`\\s(?:on\\s+)?(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=[\\s,])`, 'i'), (m) => {
      const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
      return setYmd(year(m[3], mo, m[2]), mo, m[2]);
    })
    || take(new RegExp(`\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MON})(?:,?\\s+(\\d{4}))?(?=[\\s,])`, 'i'), (m) => {
      const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
      return setYmd(year(m[3], mo, m[1]), mo, m[1]);
    });

  if (!dated) {
    take(/\stoday(?=\s)/i, () => { out.date = today; })
      || take(/\s(?:tomorrow|tmrw)(?=\s)/i, () => { out.date = addDays(today, 1); })
      || take(/\sin\s+(\d{1,3}|a)\s+(day|week)s?(?=\s)/i, (m) => {
        const n = m[1].toLowerCase() === 'a' ? 1 : +m[1];
        out.date = addDays(today, n * (m[2].toLowerCase() === 'week' ? 7 : 1));
      })
      || take(/\snext\s+week(?=\s)/i, () => { out.date = addDays(today, 7); })
      // "next Friday" is the Friday of the following Sunday-to-Saturday week.
      || take(new RegExp(`\\snext\\s+(${LONG}|${ABBR})(?=\\s)`, 'i'), (m) => { out.date = addDays(startOfWeek(today), 7 + DAY[m[1].toLowerCase()]); })
      // A bare "sat" or "sun" is more often a word than a day, so those need "on" or "this".
      || take(new RegExp(`\\s(?:(?:on|this)\\s+(${LONG}|${ABBR})|(${LONG}|mon|tues?|wed|thu(?:rs?)?|fri))(?=\\s)`, 'i'), (m) => {
        const d = DAY[(m[1] || m[2]).toLowerCase()];
        out.date = addDays(today, (d - dow(today) + 7) % 7);
      });
  }

  const AP = '([ap]\\.?m?\\.?)';
  take(new RegExp(`\\s(?:from\\s+|at\\s+)?(\\d{1,2})(?::(\\d\\d))?\\s*${AP}?\\s*(?:-|–|to|until)\\s*(\\d{1,2})(?::(\\d\\d))?\\s*${AP}(?=\\s)`, 'i'), (m) => {
    const end = clock(m[4], m[5], m[6]);
    let start = clock(m[1], m[2], m[3] || m[6]);
    // "11-1pm" starts in the morning.
    if (!m[3] && start && end && start > end) start = clock(m[1], m[2], 'a');
    if (!start || !end || start >= end) return false;
    out.time = start; out.end = end;
  })
    || take(/\s(?:from\s+|at\s+)?(\d{1,2}):(\d\d)\s*(?:-|–|to|until)\s*(\d{1,2}):(\d\d)(?=\s)/i, (m) => {
      const a = clock(m[1], m[2], null, true), b = clock(m[3], m[4], null, true);
      if (!a || !b || a >= b) return false;
      out.time = a; out.end = b;
    })
    || take(new RegExp(`\\s(?:at\\s+|@\\s*)?(\\d{1,2})(?::(\\d\\d))?\\s*${AP}(?=\\s)`, 'i'), (m) => { const t = clock(m[1], m[2], m[3]); if (!t) return false; out.time = t; })
    || take(/\s(?:at\s+|@\s*)(\d{1,2})(?::(\d\d))?(?=\s)/i, (m) => { const t = clock(m[1], m[2], null, true); if (!t) return false; out.time = t; })
    || take(/\s(\d{1,2}):(\d\d)(?=\s)/, (m) => { const t = clock(m[1], m[2], null, true); if (!t) return false; out.time = t; })
    || take(/\s(?:at\s+)?(noon|midnight)(?=\s)/i, (m) => { out.time = m[1].toLowerCase() === 'noon' ? '12:00' : '00:00'; });

  if ((out.time || out.rule) && !out.date) out.date = today;
  // "every Monday" begins on the next Monday, not today.
  if (out.rule?.days && out.date) while (!out.rule.days.includes(dow(out.date))) out.date = addDays(out.date, 1);

  out.title = s.replace(/\s+([,.])/g, '$1').replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
  out.kind = out.time ? 'event' : 'task';
  if (out.time && !out.end) out.defaultEnd = addMinutes(out.time, 60);
  return out;
}
