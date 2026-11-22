# Luach

A personal calendar, task list, habit tracker, notes and Jewish calendar. Static web app, no build step, works offline.

**Open it:** https://yaksbbgtr.github.io/luach/

- **Today**: Hebrew date, zmanim, schedule, tasks, habits, journal
- **Calendar**: month and upcoming views, holidays, parsha, candle lighting; events can repeat by Hebrew date (birthdays, yahrzeits)
- **Tasks**: due dates, repeats, stars, #tags
- **Lists** and **Notes**
- Quick add understands `Dentist tomorrow 3-4pm`, `Trash every mon and thu #home !`, `Pay bill nov 30`
- Keys: `N` adds, `1` to `6` switch sections, arrows move around the month

## Data

Everything is stored on the device. With sync on, it is also kept in a secret gist on your own GitHub account (unlisted, not encrypted). Nothing personal is in this repo.

## Apple Calendar

`mac/install.sh` builds a small helper that copies events (title, time, place, calendar name) from Apple Calendar into the same gist every 15 minutes while the Mac is awake. It never changes a calendar. It needs `gh` signed in with the `gist` scope, and sync connected in the app first. `mac/install.sh --remove` takes it off.

## Tests

    npm test
    node tests/browser.cjs <path to playwright> <screenshot folder>

## License

GPL-2.0-or-later, because it includes [@hebcal/core](https://github.com/hebcal/hebcal-es6) 6.16.1 (`vendor/hebcal.js`).
