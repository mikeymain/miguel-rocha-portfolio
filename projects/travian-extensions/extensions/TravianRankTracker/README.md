# Rank Tracker

Records player statistics and displays rankings, historical changes and comparison graphs.

**Version 5.0.35 · JavaScript · Manifest V3**

[Usage guide](../../docs/USAGE.md#rank-tracker) · [Installation](../../README.md#install-in-brave-chrome-or-edge) · [All extensions](../../README.md)

Load this directory with **Load unpacked** in a desktop Chromium browser. No build step is required. Refresh the game page after installation or updates.

## Graph layout

Graph controls wrap within the popup so the full chart and right-hand axis stay visible, including when Reset zoom appears.

## Data behaviour

- Weekly tables refresh when the popup opens; the Weekly header shows when they were observed. Background collection handles JSON-backed general statistics.
- Changes and rates account for observed weekly resets; daily bounty resets are handled in History. Absolute charts retain the original period totals.
- Average rank uses the seven General ranks (Population, Prod / Hour, Prod So Far, CP / Day, CP So Far, Offensive and Defensive Strength) plus weekly PvE and Robbers. Weekly Attack and Defense are excluded.
- Drag across the graph to compare two points and see the time-weighted average plotted value over that range. Averages keep the plotted units, including /3h for raid and PvE counters in Per hour mode.
- Now → Prod / Hour includes **Fields + raiding**, combining field production and trailing 3-hour raid income per hour.
- In Per hour mode, raid and PvE counters show the total gained in the trailing 3 hours.
- Cached weekly readings are omitted from new history. Activity during missing observations or unobserved resets cannot be reconstructed.
- Backup imports are validated before writing. Failed writes preserve existing data. Restore is available without a registered server.

See [audit findings and verification limits](../../docs/rank-tracker-audit.md).
