# Rank Tracker

Records player statistics and displays rankings, historical changes and comparison graphs.

**Version 4.8.5 · JavaScript · Manifest V3**

[Usage guide](../../docs/USAGE.md#rank-tracker) · [Installation](../../README.md#install-in-brave-chrome-or-edge) · [All extensions](../../README.md)

Load this directory with **Load unpacked** in a desktop Chromium browser. No build step is required. Refresh the game page after installation or updates.

## Data behaviour

- Weekly tables refresh when the popup opens; hover the weekly section for its observation time. Background collection handles JSON-backed general statistics.
- Changes and rates account for observed weekly resets; daily bounty resets are handled in History. Absolute charts retain the original period totals.
- Cached weekly readings are omitted from new history. Activity during missing observations or unobserved resets cannot be reconstructed.
- Backup imports are validated before writing. Failed writes preserve existing data. Restore is available without a registered server.

See [audit findings and verification limits](../../docs/rank-tracker-audit.md).
