# Public-source verification

This file records repeatable local checks for the public Aurora source. It intentionally contains no real account details or private test records.

Commands:

```powershell
npm ci
npm test
npm run build
npm exec electron -- . --smoke-test --capture
npm run pack
```

The desktop smoke test uses an isolated temporary data directory and offline sports transport. Captured populated views contain generated Sample events. It exercises startup, renderer isolation, close-to-tray lifetime, a background alarm, and snooze without connecting Google or iCloud.

Final publication check results will be recorded here after the source finish pass is merged. Live OAuth/iCloud operations, real sleep/resume behavior, Steam launch/update behavior, and third-party sports service availability are separate integration checks. No live provider credentials are distributed with this repository.

## Verified source update 12 November 2026

- Calendar finish pass: 133 tests pass; production build passes.
- Regressions cover malformed backup records and embedded calendars, email reminder origins, concurrent file imports and serialized sports refreshes.
- The recurrence cache retains exact dates, exceptions, current metadata and timezone behavior. It is bounded to 128 windows, 2048 rows per window and 64 KiB calendar inputs; unsupported external timezone dependencies bypass it.
- Same 25 synthetic daily series starting in 2020: repeated alarm checks decreased from about 1.8 seconds to 5.5–6.6 milliseconds. Cold expansion remains about 1.8 seconds. These are local benchmark samples, not a guarantee for every calendar.
- Run `node scripts/benchmark-recurrence.js` from the Aurora directory to measure the current checkout with synthetic data. No provider access is needed.

Live provider reconnection and Windows install/upgrade/uninstall have not been verified for this candidate. Successful tests and a build do not establish full release readiness.
