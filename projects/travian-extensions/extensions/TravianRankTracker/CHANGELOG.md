# Rank Tracker changelog

## Rank Tracker 5.0.30 — 2026-11-11

- Graph: quick range buttons 3h, 6h, 12h, 24h, 48h, 72h and 1w crop to the latest points; click the active one again to show all.
- Graph: smoother lines; Per hour values use a 5-point moving average.

## Rank Tracker 5.0.29 — 2026-11-11

- Graph: selectable average raiding per hour with and without animals, calculated from the trailing 3 hours. Available in both graph modes; observed weekly resets are handled.

## Rank Tracker 5.0.28 — 2026-11-11

- Now: average rank uses all seven General ranks (Population, Prod / Hour, Prod So Far, CP / Day, CP So Far, Offensive and Defensive Strength) plus weekly PvE and Robbers. Weekly Attack and Defense do not count.
- Its 1H, 3H, 1D and 7D changes compare only the ranks both snapshots hold, since background snapshots do not store weekly ranks.

## Rank Tracker 5.0.27 — 2026-11-11

- Reverts 5.0.26: the rank column is back to the 5.0.25 position.

## Rank Tracker 5.0.26 — 2026-11-11

- Now: the rank column sits another 30 pixels further right; values stay in place.

## Rank Tracker 5.0.25 — 2026-11-11

- Now: the rank column sits 30 pixels further right; values stay in place.

## Rank Tracker 5.0.24 — 2026-11-11

- Reverts 5.0.23: the popup is 800 pixels wide again.

## Rank Tracker 5.0.23 — 2026-11-11

- Now: the popup is 760 pixels wide (was 800), at any zoom.

## Rank Tracker 5.0.22 — 2026-11-11

- Fix: popup scrollbars came from the popup zoom (Ctrl+wheel) making the page larger than 800×600. The body size is now divided by the zoom so the zoomed popup stays 800×600. Reverts the 5.0.21 change that shrank the popup to almost nothing.

## Rank Tracker 5.0.21 — 2026-11-11

- Fix: the popup no longer shows page scrollbars or cuts off the 7D column when Chrome gives it slightly less than 800×600 (zoom or display scaling). The layout shrinks to the window instead.

## Rank Tracker 5.0.20 — 2026-11-10

- Now: Prod / Hour is gross field production per hour (statistics production per day ÷ 24), the figure the production rank uses, before crop upkeep. The production page is no longer fetched. Older snapshots that stored the net page total are read from their production per day, so changes and the graph stay consistent.

## Rank Tracker 5.0.19 — 2026-11-10

- Now: Prod / Hour shows production per hour again, with its changes. Its collapsible rows are "With raiding" (production plus raid income per hour, trailing 3 hours ÷ 3) and "Raids".

## Rank Tracker 5.0.18 — 2026-11-10

- Fix: Prod / Hour Fields jumped by about 250/h between refreshes. Background refreshes stored the statistics daily production ÷ 24, popup refreshes the production page total. Both now store the production page total (parsed without DOMParser). Older history keeps the mixed values, so changes against snapshots taken before 5.0.18 can still be off.

## Rank Tracker 5.0.17 — 2026-11-10

- Now: the Raids part of Prod / Hour is the hourly average over the past 3 hours again (bounty gained in the trailing 3 hours ÷ 3).

## Rank Tracker 5.0.16 — 2026-11-10

- Now: the Raids part of Prod / Hour is the hourly average over the past 2 hours (bounty gained in the trailing 2 hours ÷ 2), was 3 hours.

## Rank Tracker 5.0.15 — 2026-11-10

- Now: Prod / Hour is collapsible; Fields and Raids are breakdown rows with their own changes, like the other breakdowns.

## Rank Tracker 5.0.14 — 2026-11-10

- Now: the PvE animal resources breakdown moves under Robbers, below Raiding, renamed "Animals". PvE is no longer collapsible. A saved open PvE row opens Robbers.

## Rank Tracker 5.0.13 — 2026-11-10

- Now: Prod / Hour shows production per hour plus raid income per hour (bounty gained in the trailing 3 hours ÷ 3), with "Fields … · Raids …" beneath. Its changes use the same sum; the rank stays the production rank.
- Replaces the 5.0.12 "Raided total" (cumulative bounty) under Prod / Hour.

## Rank Tracker 5.0.12 — 2026-11-10

- Now: average rank uses Population, Prod / Hour and CP / Day ranks only; attack and defense ranks no longer count.
- Now: PvE and Robbers are collapsible again, with Resources and Raiding as breakdown rows (reverts the 5.0.11 sub-line layout).
- History: drag-compare lists every visible metric. Series with missing samples at the selection edges (weekly ranks and population are not saved by background collection) use the nearest value inside the selection; unchanged metrics show 0.
- History: in Per hour mode, raid and PvE counters plot the total gained in the trailing 3 hours, interpolated from saved history, instead of per-sample rates.

## Rank Tracker 5.0.11 — 2026-11-07

- Now: PvE and Robbers are no longer collapsible. Their extra values show beneath the main value as "Resources: …" and "Raiding: …". Only Prod So Far keeps its breakdown.

## Rank Tracker 5.0.10 — 2026-11-07

- Now: when an expanded breakdown would push rows out of view, the table switches to denser rows so every metric stays visible.

## Rank Tracker 5.0.9 — 2026-11-07

- The 1h, 3h, D and W changes no longer show "-" after time with no saved points (browser closed or asleep). A snapshot for the missed time is simulated from the saved points either side of it. Weekly counters that reset in the gap are left out.

## Rank Tracker 5.0.8 — 2026-11-07

- Hovering the Server chip shows how long after the server start you joined.

## Rank Tracker 5.0.7 — 2026-11-07

- Header adds a "Server: …" chip with the time since the server started, read from the statistics page.

## Rank Tracker 5.0.6 — 2026-11-07

- Header chips read "Total players: …" and "Playtime: …"; breakdown labels drop the colon.
- "Avg rank" label is 2px smaller.
- Collapsible rows no longer show a box on hover; the row highlight stays.
- The metrics table fills the panel: rows share spare height when breakdowns are collapsed and the table scrolls when they do not fit.

## Rank Tracker 5.0.5 — 2026-11-07

- Header: History tab renamed to Graph; playtime chip reads "Playtime …"; brand text and server chip removed.

## Rank Tracker 5.0.4 — 2026-11-07

- Robbers breakdown shows Raiding only; the PvE part is removed.
- Clicking anywhere on a collapsible row expands or collapses it.
- Breakdown labels end with a colon: "Raiding:".

## Rank Tracker 5.0.3 — 2026-11-07

- PvE, Robbers and Prod So Far rows are collapsible. Expanded rows show a breakdown with its own change columns:
  PvE → Resources; Robbers → Raiding (excluding PvE) and PvE; Prod So Far → Fields and Bounty.
- Expanded rows are remembered between popup opens.

## Rank Tracker 5.0.2 — 2026-11-07

- Robbers shows total raided on top and raiding excluding PvE below, labelled "raiding".
- Prod So Far puts the label before the number: "fields 17,419".

## Rank Tracker 5.0.1 — 2026-11-07

- Prod So Far shows total production on top and field production (total minus bounty) below.

## Rank Tracker 5.0.0 — 2026-11-07

New popup, rebuilt from scratch. Data collection, history, storage and backups are unchanged; saved data, metric visibility and groups carry over.

- One 800 × 600 screen per view with no scrolling. The Now and History tabs sit in the top bar next to the server, player count, playtime and update status.
- Now: the average rank is shown on a flip-digit board with its tier, percentile and Open, 1h, 3h, 1d and 7d changes. All weekly and general rankings are in one table with rank and value changes in each column. The Weekly header shows when weekly data was observed.
- History: metrics are listed by section (Weekly, Raids, Population, Production, Culture, Military) in a sidebar beside the chart. **Raw / Daily peaks** and **Absolute / Per hour** are segmented controls. **Save group** stores the visible metrics under a name; **Clear** hides all.
- The comparison box, tooltips and chart colours were redrawn. Export, import and rank tier buttons use icons, and the tier list is built from the tier thresholds.
- New icon.

## Rank Tracker 4.8.5 — 2026-10-21

- The 1h, 3h, D and W changes now show "-" when no saved point lies within half that window, instead of comparing against the current value or a much older point.
- Background updates no longer record the last known population as a new reading, so the population graph has gaps instead of flat lines between popup openings.

## Rank Tracker 4.8.4 — 2026-10-20

- Restoring a backup now asks first when it would delete saved data that isn't in the backup, such as another server's history. Cancel keeps everything as it was.
- Removed the unused `cookies` permission and the web-accessible `chart.js` entry; the popup still loads the chart locally.

## Rank Tracker 4.8.3 — 2026-10-20

- An unreadable production total no longer overwrites Prod / Hour with an empty value; the value from the statistics data is kept.
- Statistics read from the page are stored only when they are numbers, so unexpected page text can't end up in history or the popup.
- A failed backup download now shows "Error: Backup failed" instead of failing silently.

## Rank Tracker 4.8.2 — 2026-10-05

- Preserve reset boundaries when opening the popup; save direct page observations to history.
- Separate fresh weekly observations from cached background values; rates skip missing observations.
- Serialize snapshot/restore writes; reject older completed fetches and pin each popup to its server.
- Validate backups before writing, retain existing storage if the write fails, sort imported history, and discard derived income caches. Restore is available before login or network collection.
- Fix accidental filter handlers, repeated group handlers, stale chart loads, invalid zoom ranges, and excessive interpolation across history gaps.
- Reject unrelated statistics tables as population/weekly data, prefer fresh fields over cached values, handle JSON string braces and signed numbers, and reject pages without usable statistics.
- Correct raid-income averages across missing values and resets; publish the observation timestamp rather than the current page-load time.
- Refresh hourly production from parsed daily production, display zero general values, correct rank-tier help, and avoid caching a false playtime anchor when the oldest inbox page fails.

## Rank Tracker 4.8.1 — 2026-10-05

- Fixed reset-related negative value changes in Current comparisons (including since last open) and History tooltip, selection, and velocity calculations.
- Detect counter drops from observations instead of relying on local Monday midnight; bridge multiple observed resets and skip missing samples. Daily bounty resets are handled in History.
- Preserve pre-reset history within the deduplication window and keep valid zero raid values instead of replacing them with legacy values.
- Existing history is handled on display; no data reset is required. Unobserved gains cannot be reconstructed.

## v4.8.0 — Playtime anchored to game start

- Playtime timer now starts from the received-time of the first Travian system
  message ("TG Support") in the inbox — i.e. when the account actually started
  on the server — instead of the first tracker snapshot.
- New `fetchGameStart()` in utils.js: fetches `/messages/inbox` (last page when
  paginated), takes the oldest `tr.support` row, parses its `td.dat` label
  ("today, 17:09" / "yesterday, …" / "dd.mm.yy, …") via `parseTravianDate()`.
- Fetched at most once per server; stored in a `gameStart_{origin}` key.
  Falls back to the old `firstSeen_{origin}` anchor, then oldest history entry.

---

## v4.7.0 — Rebalanced Rank Tiers

- Reworked `RANK_TIERS` so the elite tiers are genuinely rare and the middle is
  no longer a free ride. Old curve gave diamond to the entire top 10% and gold
  all the way down to the 40th percentile.
- **Denominator changed to active accounts.** Percentiles now divide by
  `villageStrength.totalPlayers` (players with ≥1 village, ~14.6k) instead of
  `activatedPlayers` (every avatar ever created, ~18.4k, incl. dead accounts).
  Falls back to the old avatars count if the field is missing.
- New percentile cutoffs (as a fraction of active accounts):
  immortal 0.45% · ascended 0.9% · diamond 2% · emerald 3% · platinum 6%
  · gold 14% · silver 20% · bronze 30% · iron rest.
- Net effect: a rank in the top ~12% of active players reads as **gold**, and
  iron covers the bottom ~70%.

---

## v4.6.0 — Playtime

- **New:** Header now shows playtime — elapsed time since the first recorded
  snapshot for the current server (e.g. `⏱ 4d 6h`).
- Anchored to a never-trimmed `firstSeen_{origin}` key written once in
  `saveToHistory`, so it stays correct past the ~41-day history cap.

---

## 🐛 Bug Fix: Data Gap During Sleep

### Root Cause
Two compounding issues caused the 3am→wake gap on the graph:

1. **Missing `onStartup` listener** — The periodic alarm was only registered inside
   `runtime.onInstalled`, which fires on install/update but **not** on browser restart.
   If Firefox restarted overnight, the alarm was never recreated, and background
   fetching silently stopped forever.

2. **Silent session-expiry discard** — When the Travian session cookie expired
   (inevitable overnight), `fetchForServer` detected the login page
   (`name="login"`) and executed a bare `return` — no logging, no diagnostic
   marker, nothing saved.  Every subsequent 30-minute alarm tick hit the same
   wall and discarded the result, producing the blank stretch on the graph.

### Fixes Applied
- Added `runtime.onStartup` — alarm is now guaranteed on every browser launch.
- Added `ensureAlarm()` — called on install, startup, AND on every alarm tick
  (belt-and-suspenders) to recover from any browser-level alarm loss.
- Every fetch now writes a diagnostic status to storage
  (`lastFetchStatus_{origin}`) so the popup can tell the user "Session expired —
  please log in" instead of silently showing stale data.

---

## 🔧 Refactoring Summary

### utils.js
- **New `fetchAllEndpoints()`** — single entry-point for the full 4-endpoint
  server scrape (general → overview → production → top10).  This eliminates
  the copy-paste between `background.js:fetchForServer` and `popup.js:fetchData`
  that previously existed.
- **New `mergeFields()` helper** — replaces the repetitive per-key if-null
  checks with a clean loop.
- **Extracted constants** — `DEDUP_WINDOW_MS`, `MAX_HISTORY_LEN`, `WEEKLY_KEYS`
  are now named and documented.
- **JSDoc comments** on every public function.
- **Table-index extraction** deduplicated — the "PvP / Defenders / PvE / Robbers"
  slot mapping was copy-pasted 3 times; now expressed once as a data-driven loop.

### background.js
- **`ensureAlarm()`** — idempotent; safe to call repeatedly, only creates
  alarm if missing.
- **`runtime.onStartup`** — ensures alarm survives browser restarts.
- **Removed all fetch logic** — delegates entirely to `fetchAllEndpoints()`.
- **Reduced from ~100 LOC to ~118 LOC** despite adding features (docs take space).

### popup.js
- **`fetchAndRender()`** replaces the old `fetchData()`** — wraps the shared
  `fetchAllEndpoints()` and maps status codes to user-facing error messages.
- **`DATASETS_CONFIG` array** — the 14-dataset chart configuration is now a
  declarative data structure instead of 14 inline object literals.
- **`aggregateDaily()` / `interpolateGaps()`** — the 60-line inline blocks
  in `loadGraph()` are now standalone, testable functions.
- **`initChartZoom()`** — the 70-line wheel listener is extracted into its
  own function with clearer variable names.
- **`setUpdateStatus()`** — small helper to avoid the repeated
  `document.getElementById('last-update')` pattern.
- **Section headers** with §-numbered JSDoc blocks for navigability.
- **Removed redundant `api` re-declarations** — the popup now declares `api`
  once at module scope.

### Unchanged files
- `popup.html`, `style.css`, `chart.js`, `icon128.png` — no changes.
- `manifest.json` — version bumped to 5.0.0, formatting cleaned up.
