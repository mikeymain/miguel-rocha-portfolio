# Rank Tracker changelog

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
