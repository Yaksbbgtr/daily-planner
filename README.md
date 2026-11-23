# Daily Planner

A personal calendar, task list, habit tracker, notes and Jewish calendar. Static web app, no build step, works offline.

**Open it:** https://yaksbbgtr.github.io/daily-planner/

- **Today**: Hebrew date, zmanim, schedule, tasks, habits, journal
- **Calendar**: month and upcoming views, holidays, parsha, candle lighting; events can repeat by Hebrew date (birthdays, yahrzeits)
- **Tasks**: due dates, repeats, stars, #tags
- **Lists** and **Notes**
- Quick add understands `Dentist tomorrow 3-4pm`, `Trash every mon and thu #home !`, `Pay bill nov 30`
- Keys: `N` adds, `1` to `6` switch sections, arrows move around the month

## Sync

Sign in with Google on each device (Settings > Sync) and changes reach the others within seconds. Data lives in a Supabase database where row level security lets each account reach only its own rows (`supabase/schema.sql`). Until `js/config.js` names a project, everything stays on the device.

Setting up a project: create it, run `supabase/schema.sql` in its SQL Editor, turn on the Google provider (with a Google OAuth client whose redirect URI is `https://<project>.supabase.co/auth/v1/callback`), set the Site URL to the app's address, and put the project URL and publishable key in `js/config.js`.

## Apple Calendar

`mac/install.sh` builds a small helper that sends events (title, time, place, calendar name) from Apple Calendar every 15 minutes while the Mac is awake, using a key made in Settings > Apple Calendar. It never changes a calendar. `mac/install.sh --remove` takes it off.

## Tests

    npm install && npm test
    node tests/browser.cjs <path to playwright> <screenshot folder>

## License

GPL-2.0-or-later, because it includes [@hebcal/core](https://github.com/hebcal/hebcal-es6) 6.16.1 (`vendor/hebcal.js`).
