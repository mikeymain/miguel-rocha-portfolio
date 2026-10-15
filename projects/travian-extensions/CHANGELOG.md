# Changelog

## 2026-10-15

- Removed InactiveSearch Map Opener from the published extensions.

## Next Settlement Calc 2.3.1 — 2026-10-15

- Renamed from CP Predictor / CP Planner to Next Settlement Calc (extension name, toolbar title and popup header).
- With several servers, the popup header shows the server picker instead of the title so server names are readable.

## TravAlarm 3.27 — 2026-10-15

- Activity check uses any input on the computer instead of input in the Travian tab, so a visible tab on a second monitor keeps refreshing while you work elsewhere. Refreshes pause after 10 minutes without input or when the screen is locked. Adds the `idle` permission.

## TravAlarm 3.26 — 2026-10-15

- Background game-data refreshes run only while the Travian tab is visible and was used in the last 10 minutes. Hidden and idle tabs make no requests.
- Rally point and granary checks for several villages run one village at a time, 1.5 s apart, instead of all at once.

## Oasis Finder 69.4 — 2026-10-15

- **Fetch Troops** loads only the rally point and smithy pages; the extra village-overview load is gone.
- Requests use the browser's normal headers; removed custom referrer/language headers and artificial delays.

## TravianQoL 1.1.3 — 2026-10-15

- Skip Ads: queued ads now play in the bottom-right corner, like directly started ads. The **Ad queue** pill sits above whichever ad is playing.

## TravianQoL 1.1.2 — 2026-10-15

- Skip Ads: hide scrollbars in the corner preview of queued ads.

## TravianQoL 1.1.1 — 2026-10-15

- Skip Ads: queued adventure bonus ads (e.g. "Reduce adventure duration") were dropped as "no longer offered" because the adventure page renders its bonus boxes with JavaScript. The queue now loads the page and waits for the box before deciding.

## TravianQoL 1.1 — 2026-10-15

- Skip Ads: mute video-feature ads, park them in a corner, keep the page usable through a same-origin game frame, and announce when the ad finishes.
- Skip Ads: add an ad queue. Clicking **Construct 25% faster** while an ad plays or while the builder is busy now queues that ad instead of being ignored; bonus boxes get a **+ Queue** button.
- Options: show only the "On refresh" tag; drop the "Hot-toggle" tag.

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

## Night Mode 2.4 — 2026-10-04

- Darkened the alliance "Contribute resources" header and box outline.

## Night Mode 2.3 — 2026-10-04

- Darkened the alliance bonus section headers and the box outlines.

## Night Mode 2.2 — 2026-10-04

- Redrew the alliance bonus level markers as rings on the dark track for every state: unreached, reached, complete, inactive and upgrading. In 2.1 they still showed grey boxes.
- Dimmed the inactive bonus bar fill.

## Night Mode 2.1 — 2026-10-04

- Darkened the unreached level markers and bar outline on the alliance bonus page.
- Darkened your own row in the alliance bonus top-5 contributor tables.

## Travian QoL 1.0 — 2026-10-04

- Updated the manifest and documentation version from 0.1.0 to 1.0.

## Initial community beta — 2026-10-04

- Published the eight currently enabled extensions as independent unpacked packages.
- Added installation, feature guides, sample-data screenshots, issue templates, and Discord contact `luckimikey`.
- Included the recent TravAlarm village-navigation fix.
- Included oasis farm-list sorting by bonus type, then distance within the same type.
- Included QoL's right-click action to open selected farm targets in background tabs.

Version numbers are retained from the installed manifests. Future changes should identify which extension changed.
