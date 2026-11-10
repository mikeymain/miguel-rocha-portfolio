# Rank Tracker

Records player statistics and displays rankings, historical changes and comparison graphs.

**Version 5.0.15 · JavaScript · Manifest V3**

[Usage guide](../../docs/USAGE.md#rank-tracker) · [Installation](../../README.md#install-in-brave-chrome-or-edge) · [All extensions](../../README.md)

Load this directory with **Load unpacked** in a desktop Chromium browser. No build step is required. Refresh the game page after installation or updates.

## Data behaviour

- Weekly tables refresh when the popup opens; the Weekly header shows when they were observed. Background collection handles JSON-backed general statistics.
- Changes and rates account for observed weekly resets; daily bounty resets are handled in History. Absolute charts retain the original period totals.
- Average rank uses Population, Production and CP ranks; attack and defense ranks are excluded.
- In Per hour mode, raid and PvE counters show the total gained in the trailing 3 hours.
- Cached weekly readings are omitted from new history. Activity during missing observations or unobserved resets cannot be reconstructed.
- Backup imports are validated before writing. Failed writes preserve existing data. Restore is available without a registered server.

See [audit findings and verification limits](../../docs/rank-tracker-audit.md).
