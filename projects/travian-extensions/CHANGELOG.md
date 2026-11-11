# Changelog

## TravAlarm 3.43 — 2026-11-11

- Stable alarms use a brown accent so they no longer look like the gold Hero alarms.

## Travian QoL 1.3.3 — 2026-11-11

- Report statistics: the **Hero XP** row uses the scroll icon. 1.3.2 showed the bandage icon by mistake.

## Travian QoL 1.3.2 — 2026-11-11

- Report statistics: the **Hero XP** row shows the scroll item icon instead of the hero icon.

## TravAlarm 3.42 — 2026-11-11

- Training alarms (Stable, Great Stable, Workshop, Academy, Smithy, Hospital, Trapper and others) now show their own building icon instead of the Barracks icon. Settlers use the generic building icon.

## TravAlarm 3.41 — 2026-11-11

- Settlers and research countdowns now use the same timer text styling as all other active alarms. Category colors remain on names and accents.

## World Watch 1.3.0 — 2026-11-11

- Map: **Top 10** and **Top 100** checkboxes ring the largest accounts by population; Top 10 are labelled with rank and name and listed in the legend. The tooltip shows rank.
- Map: panning works in every direction at every zoom. Before, when the whole world fitted the window width, only up and down worked.

## World Watch 1.2.0 — 2026-11-11

- Map fills the free page area (minimum 543 × 401 px) and zooms out to the whole world.
- Lines mark the world edge at ±200; outside the world is dark when it is smaller than the window.

## World Watch 1.1.0 — 2026-11-11

- New **Map** tab: Travian-style map at 60 px per field (100 %), 543 × 401 px window, zoom down to 5 %. Shows the newest spawns, their distance band, and the top 10 alliances with labels at their centres. Hover for player, alliance and population.

## World Watch 1.0.0 — 2026-11-11

- New extension. Fetches a watched world's public `map.sql` on a timer, keeps a snapshot when it changes, and shows sign-up growth, spawn ring per quadrant, population gains per account and alliance centres, with CSV export.

## Rank Tracker 5.0.29 — 2026-11-11

- Graph: selectable average raiding per hour with and without animals, using a trailing 3-hour window in both graph modes.

## TravAlarm 3.38 — 2026-11-11

- New **Academy research** and **Smithy upgrade** alarms per village. They are set or updated when the Academy or Smithy page is opened.

## Travian QoL 1.3.1 — 2026-11-10

- Upgrade target values compare the built level with the next level. Before, queued upgrades shifted both numbers to the levels after the queue.

## Travian QoL 1.3.0 — 2026-11-10

- New **Upgrade target values** feature: building pages show culture points, population and construction time at the current and next level, e.g. 18 → 21 (+3).

## Travian QoL 1.2.4 / Night Mode 2.6.1 — 2026-11-10

- Report statistics: the **Hero XP** row shows the hero icon in the icon column.
- Night Mode: report statistics rows alternate shading, as in the vanilla theme.

## Next Settlement Calc 2.6.5 — 2026-11-10

- ETA history has an **8h** range.

## Next Settlement Calc 2.6.4 — 2026-11-10

- ETA history tooltip lists **No parties**, **With parties** and **Parties + growth**, in that order; the overlay buttons use the same names.
- Samples pinned to the chart edge no longer draw dots.

## TravAlarm 3.37 — 2026-11-10

- New alarms **Oasis respawn in 45 min** and **Beginner's protection ends**, timed from the world's starting beginner protection (base days for the world speed). An extended personal protection is not detected.

## Next Settlement Calc 2.6.3 — 2026-11-10

- ETA history: scroll over the chart to zoom the time axis, Shift+scroll to pan, double-click or **Reset zoom** to restore.
- The expand button opens the chart in its own resizable window.
- Smaller gap between the chart and the villages table.

## Next Settlement Calc 2.6.2 — 2026-11-10

- ETA history draws a smoothed curve instead of jagged steps. The tooltip still shows the raw values.

## Oasis Finder 70.4 — 2026-11-11

- Empty free oases are now recognised from the map. Their old garrison is cleared and they appear under **No animals** in **View DB**.

## Oasis Finder 70.3 — 2026-11-10

- **View DB**: the **Radius** box uses the same dark −/+ stepper as the main panel.

## Oasis Finder 70.2 — 2026-11-10

- **View DB**: removed the **Seen** column. The **Garrison** column is now **Oasis**, and the **Location** header no longer overlaps **Dist**.

## Oasis Finder 70.1 — 2026-11-10

- **View DB**: search and radius boxes keep the dark style on game pages, and column headers no longer run together.
- Removed the last-seen filter and the **Type unknown** option. Filters read **All oases**, **With animals** and **No animals**.
- The `x|y` box appears only when **From** is set to **Coordinate**.

## Travian QoL 1.2.3 — 2026-11-10

- Oasis raid reports: the defender's **Resources lost** and **Net resources** show 0, since animals cost nothing to replace.
- Oasis raid reports with the hero show a **Hero XP** row: 1 XP per crop upkeep of each animal killed.

## Next Settlement Calc 2.6.1 — 2026-11-10

- ETA history: outliers, such as the very late ETAs logged right after a server start, no longer flatten the chart. They are drawn as hollow dots on the chart edge, the axis label shows ≥ or ≤, and the trend and change ignore them.
- The tooltip no longer shows the extension version.

## Oasis Finder 70.0 — 2026-11-10

- **View DB**: search by coordinates or animal; filter by oasis type, garrison and last-seen age; choose a village or coordinate as origin and a radius; sort by any column.
- **Open N** opens the listed oases in background tabs: radius required, confirmation at 10 or more, 50 per click, tabs spaced 0.35–0.75 s apart. Tabs open only on the game world you are on.
- Detail density shows hero **xp** in place of loss and hides the XP badge beside **Send**. The badge has a "Hero XP" label in the other densities.
- Hero/Troops tabs are announced as tabs, keyboard focus stays in the open DB window, footer buttons are 28 px, and distance/time text has higher contrast.

## Next Settlement Calc 2.6.0 — 2026-11-10

- ETA history chart: **24h / 7d / 30d / All** ranges and an **ETA** or **CP/d** series. Settings are saved.
- Optional **Baseline** and **Growth** forecast overlays, hover tooltip with the sample's ETAs, CP, CP/d and version, and a dotted line at each extension version change.
- Drag across the chart to show the change and time between two samples. A least-squares trend line and per-day trend appear with at least three samples over six hours.

## TravAlarm 3.36 — 2026-11-10

- A building alarm is cleared when the build finishes early, e.g. with gold **Finish now** or a cancel. Open the village or resource view after finishing to clear it.

## TravAlarm 3.35 — 2026-11-07

- The panel shows an **Oasis respawn** countdown until the world's starting beginner protection ends (5, 3, 3, 2 or 1 days on 1x, 2x, 3x, 5x and 10x worlds). The world start date comes from the public game world calendar and is cached per world. Hover the row for the end date.
- A finished building alarm is no longer deleted when you open the game while the next level of the same building is queued (e.g. Cranny lvl 5 done, lvl 6 building). Finished alarms are only cleared after you acknowledge them.

## TravAlarm 3.33 — 2026-11-07

- Two same-named builds finishing within seconds of each other (e.g. two Cranny lvl 1) keep separate alarms. The build still running is matched to the alarm closest to its finish time, so the other alarm is no longer deleted.

## Rank Tracker 5.0.2 — 2026-11-07

- Robbers shows total raided on top and raiding excluding PvE below, labelled "raiding".
- Prod So Far puts the label before the number: "fields 17,419".

## TravAlarm 3.32 — 2026-11-07

- Sound Settings has an **All sounds** switch. It mutes every alarm sound and keeps the per-category choices for when sound is turned back on.

## TravAlarm 3.31 — 2026-11-07

- Master builder entries waiting for resources ("Start of construction in …") no longer set a building alarm.

## Rank Tracker 5.0.1 — 2026-11-07

- Prod So Far shows total production on top and field production (total minus bounty) below.

## Rank Tracker 5.0.0 — 2026-11-07

New popup, rebuilt from scratch. Data collection, history, storage and backups are unchanged; saved data, metric visibility and groups carry over.

- Each view fits the 800 × 600 popup with no scrolling. The Now and History tabs sit in the top bar.
- **Now:** average rank on a flip-digit board with tier, percentile and changes; all weekly and general rankings in one table with rank and value changes per column.
- **History:** metrics grouped by section in a sidebar beside the chart; segmented Raw / Daily peaks and Absolute / Per hour controls; Save group stores the visible metrics.
- New icon.

## Design and accessibility pass — 2026-11-05

Oasis Finder 69.6, TravAlarm 3.30, Travian QoL 1.2.2, NPC AutoMerchant 3.1.3 and Night Mode 2.6 fix contrast, keyboard access and motion in the panels they add to game pages. Layout and colours stay the same apart from the contrast fixes.

- **All five:** text that was below WCAG AA contrast is darker or lighter as needed, keyboard focus shows a visible outline, and animations and transitions stop when the system asks for reduced motion.
- **Oasis Finder:** the DB and Errors window is a labelled dialog that closes with Escape and returns focus. Icon buttons, steppers and inputs have names, small controls are 24 px, footer text is at least 10 px, and the panel stays on screen in narrow windows.
- **TravAlarm:** section headers, rings, alarm cards and sound switches work from the keyboard. Card actions also appear on keyboard focus, text is at least 10 px, buttons are 24 px, the alarm flash stays readable, and the widget fits short screens.
- **Travian QoL:** the village resource total uses the game's text colour, so it is readable in the light theme. The selected farm-list row highlight works in both themes. Loot Calculator's settings and close icons are real buttons, and its window closes with Escape. To-do actions appear on keyboard focus and its buttons are 24 px.
- **NPC AutoMerchant:** buttons, labels, the resource indicator and "needed" amounts meet contrast. Selects, copy buttons, the lock button and steppers have names. Preview amounts use thousands separators, and the pull progress message is announced.
- **Night Mode:** link, input-border and button colours meet contrast. Rules that never applied because of typos (missing class dots, `tr:`, an undefined colour, a selector list cut by a comment) now work.

## Travian QoL 1.2.1 — 2026-10-22

- **Loot Calculator** finds the lost-resources row on reports in any language, so net resources work outside English.
- Loot Calculator settings no longer lose a change to an older pending save, report tooltips show no unit count while **Show on Reports** is off, and switching to a unit with the same capacity redraws the badges.
- **Adventure sort** waits for rows that load late, sorts distances written with a decimal comma, and keeps rows that aren't adventures in place.

## NPC AutoMerchant 3.1.2 — 2026-10-21

- A hero pull started from the calculator is dropped if the hero inventory isn't reached within 30 seconds, so an abandoned pull no longer clicks Transfer the next time you open the inventory.
- **Send to Indicator** now also saves the total shortfall, so **Pull ÷4** on the marketplace works for troop calculations.
- **Pull ÷4** is hidden when the resource pool already covers the need.
- Opening another NPC dialog no longer replaces the saved amounts. An empty reading never overwrites them, and the game's or helper's own field updates can't replace amounts sent with **Send to Indicator**. Typing in the desired fields still saves.

## Rank Tracker 4.8.5 — 2026-10-21

- The 1h, 3h, D and W changes now show "-" when no saved point lies within half that window, instead of comparing against the current value or a much older point.
- Background updates no longer record the last known population as a new reading, so the population graph has gaps instead of flat lines between popup openings.

## Rank Tracker 4.8.4 — 2026-10-20

- Restoring a backup now asks first when it would delete saved data that isn't in the backup, such as another server's history. Cancel keeps everything as it was.
- Removed the unused `cookies` permission and the web-accessible `chart.js` entry; the popup still loads the chart locally.

## NPC AutoMerchant 3.1.1 — 2026-10-20

- **Pull exact amounts** and **Pull ÷4** on the marketplace indicator now open the hero transfer with the amounts shown. Previously the game subtracted the village's stock a second time, so the transfer was pre-filled too low or with 0.
- The indicator shows the saved village name as plain text.
- After a transfer from the hero inventory, the helper only returns to a page on the same game server.
- Tribe detection no longer fails on pages with SVG icons.

## Rank Tracker 4.8.3 — 2026-10-20

- An unreadable production total no longer overwrites Prod / Hour with an empty value; the value from the statistics data is kept.
- Statistics read from the page are stored only when they are numbers, so unexpected page text can't end up in history or the popup.
- A failed backup download now shows "Error: Backup failed" instead of failing silently.

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

- Skip Ads: removed the ad queue, which started queued ads later without a click. Clicking a video-ad button while another ad plays now goes straight to the game, and any queue saved by an older version is deleted.
- Skip Ads: removed the legacy `media.oadts.com` path, which jumped to the end of the ad video. The extension no longer has access to that site. Ads always play in full at normal speed.
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
- Background refreshes and village switches during multi-village checks are spread further apart (village switches 1–2.3 s instead of 1.5 s), so tabs no longer send requests in bursts.

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
