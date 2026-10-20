# Changelog

## 2026-10-15

- Removed InactiveSearch Map Opener from the published extensions.

## Oasis Finder 69.5 — 2026-10-20

- **Fetch Troops**: an error page or a redirect to the login page now shows **Failed** and keeps your stored troops. Previously it saved every unit as 0 and showed "Fetched ✓".
- A map tile that fails to analyse no longer stops the tiles before it from being saved and shown, and the error is logged instead of hidden.

## Night Mode 2.5 — 2026-10-20

- Turning Night Mode off restores the game's own theme. Previously it always switched to light, overriding a player who uses the game's built-in night theme.
- A saved toggle or button color now also reaches open tabs through storage, so tabs that missed the popup's message (still loading, or restored from the back/forward cache) update too.
- The night theme stays on if the page replaces its `<body>`.
- Invalid stored button colors fall back to the game's native buttons instead of breaking them, and the popup no longer shows black or an empty favorites strip when a saved value is unreadable.
- Typing an invalid hex in the popup no longer switches native buttons to a recolor you didn't choose.
- A failed settings read is logged instead of being hidden.

## TravianQoL 1.2.0 — 2026-10-16

- Skip Ads: removed the ad queue. Queued ads used to be fetched, checked every 30 s and started later in a hidden frame without a click. Clicking a video-ad button while another ad plays now goes straight to the game, and any queue saved by an older version is deleted.
- Skip Ads: removed the legacy `media.oadts.com` path, which skipped the ad video to its end. The extension no longer has access to that site. Ads always play at normal speed.
- Skip Ads settings: removed the unused "Min playtime" and "Video lookup poll" options. The remaining ad check interval has a minimum of 100 ms.

## TravianQoL 1.1.4 — 2026-10-16

- To-do list: saving now updates only the current village, so a second Travian tab can no longer wipe tasks you added in other villages. If saved tasks can't be read, nothing is written (previously the next add replaced every village's list). A task added right before leaving the page is no longer lost.
- Village resource totals subtract negative crop production instead of adding it.
- Village coordinates and counter-attack coordinates keep Travian's minus sign (−5 was read as 5).
- Loot calculator: one failed settings load no longer disables it until the page is reloaded.
- Skip Ads: turning the feature off now stops it from intercepting video-ad clicks and removes its "+ Queue" buttons.
- Bulk tab opening only opens Travian pages, and only for the extension's own features.

## TravAlarm 3.29 — 2026-10-16

- Background refresh cooldowns (training, warehouse, celebrations, hero, production, attack check) now persist across page loads and are shared by all tabs of a server. Moving between pages no longer fires a fresh burst of requests each time.
- Each background refresh is scheduled with a new random delay, so requests no longer follow a fixed rhythm.
- Village switches during multi-village checks are spaced 1–2.3 s apart at random instead of exactly 1.5 s.

## TravAlarm 3.28 — 2026-10-16

- Fixed: the rally-point check for villages with resource alarms stopped for the rest of the page's life after its first run found nothing to check.
- Fixed: a building-queue timer without a readable value created a false "finished" alarm about 2 seconds later. The row is now skipped and its existing alarm is kept.
- Server error pages (non-OK responses) are ignored instead of being parsed, so they can no longer clear storage, training, celebration or hero alarms.
- One malformed saved alarm no longer stops TravAlarm from loading all the others.
- Alarm names from game pages (such as an attacker's village name) are shown as plain text in the widget instead of being inserted as HTML.
- `alarm.mp3` and `attack.mp3` are no longer exposed to Travian pages.

## Next Settlement Calc 2.4.0 — 2026-10-16

- Fixed: the target-reached alarm made no sound unless you had clicked in the Travian tab, and none at all with no Travian tab open. The sound now plays from an offscreen document, which the browser's autoplay policy does not block. Adds the `offscreen` permission and requires Chrome/Brave 116 or later.
- The alarm sound resumes after a browser restart until you dismiss the notification.
- `alarm.mp3` is no longer exposed to Travian pages.

## Next Settlement Calc 2.3.3 — 2026-10-16

- Removed the five-minute background refresh. CP data now refreshes only when you open the popup or click **Refresh**, plus from game pages you open yourself, so the extension makes no requests on its own.

## Next Settlement Calc 2.3.2 — 2026-10-16

- A failed forecast-log write (for example full storage) no longer fails the CP save it records.
- A failed toolbar-badge update no longer leaves a refresh stuck until the browser restarts.
- The popup's countdowns keep running if loading a server fails.
- Unexpected content-script errors are logged to the console instead of being silently dropped.
- Alarm setup on browser start runs once instead of up to three times in parallel.

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
