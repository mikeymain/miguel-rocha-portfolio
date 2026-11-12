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
