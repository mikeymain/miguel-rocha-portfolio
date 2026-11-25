# Travian World Watch

Tracks a Travian Legends game world over time from its public `map.sql` dump. Use it to choose a spawn area and to spot accounts with unusual population growth.

## How it works

- The popup holds a watch list of world hosts, for example `ts4.x1.arabics.travian.com`.
- A `chrome.alarms` job (every 60 minutes by default, 15–1440 allowed) fetches `https://<host>/map.sql` for each host, one after another, 3 seconds apart.
- Requests send no cookies (`credentials: "omit"`). They are read-only and need no login.
- A snapshot is stored only when the SHA-256 of the dump changed. Travian appears to regenerate `map.sql` about once a day, so most hourly checks store nothing.
- Snapshots are kept in IndexedDB in columnar form (`x, y, tribe, vid, uid, aid, pop` plus player names and alliance tags). The newest 30 per host are kept.
- The dump has no generation time. A snapshot's time is the time of the first fetch that saw the new content, so it can be up to one interval late.

## Dashboard

| View | Content |
| --- | --- |
| Growth | Per snapshot: sign-ups (highest uid), Δ sign-ups, accounts, villages, population. |
| Spawn ring | Per quadrant (NE/NW/SE/SW): the newest N accounts by uid (default 40). Spawn village = lowest village id per account. Min, median and max distance from 0\|0 and the newest spawn coordinates. |
| Nearby | Every village within a radius of a centre (your selected village by default), nearest first, excluding your own. Status per account between Snapshot and Compare with: inactive (no pop growth), new (not in the older snapshot) or active; inactive rows are highlighted. The tab switches Compare with to the newest snapshot at least 24 h older. **Inactive only** filters the list. **Open all** opens the listed villages' game pages in background tabs, one at a time with random 1.5–4 s gaps, up to 100 tabs, with a Stop button. The radius is remembered. |
| Gold suspects | Population gain per account between two snapshots, gain per hour, Δ villages and distance to a point. Rows above the 99th percentile gain are highlighted. Only accounts present in both snapshots are compared. A Δ villages above 0 means part of the gain comes from a new or conquered village. |
| Alliances | Members, villages, population, population-weighted centre and main quadrant. |
| 15c Finder | Confirmed `1-1-1-15` tiles ranked by the best three observed crop bonuses in their centered 3 × 3 area. The table shows the potential, how much was free when observed, and how much of the area was checked. Click a coordinate to reopen the tile. |
| Map | Travian-style map: 60 px per field at 100 %, like the in-game map. The window fills the free page area (at least 543 × 401 px, the in-game size). Zoom from 100 % down to the whole world; drag to pan, mouse wheel to zoom. Lines mark the world edge at ±200. Newest spawns are highlighted and their distance band from 0\|0 is shaded; the top 10 alliances are coloured and labelled at their centre. **Top 10** and **Top 100** mark the largest accounts by population (red and white rings); Top 10 are labelled with rank and name at their largest village. Hover a field for player, alliance, population and rank. |

**Your village:** `own-village.js` reads your player name and village list (names and coordinates) from the game sidebar on any page you open in that world, and stores them per world. The dashboard then shows a **Your village** selector, fills **Point (x|y)** and **Centre (x|y)** with the selected village (the inputs stay editable; a typed value is not overwritten), and rings your villages blue on the map. In **Gold suspects**, your account is pinned to the top row (blue), regardless of radius or the p99 filter, so you can compare it with the other players.

Every table exports to CSV. Nature and Natar villages are ignored. Positive y is north. Distances wrap around the 401 × 401 map.

**Finding a 15c:** Open DevTools (`F12`) in the game tab, then open the map or reload it and pan normally. World Watch reads the game's completed map responses and saves confirmed `1-1-1-15` coordinates locally, even if the world is not on the watch list. Hover over a valley or open its details to save individual matches with DevTools closed. The finder does not track current occupancy. Check the tile in-game before settling. Collection is disabled on Europe 1 (`ts1.x1.europe.travian.com`).

**Mapping and comparing 15c tiles:** Pan at 100% zoom with DevTools open to collect nearby oasis bonuses. In World Watch, the **Map** tab shows teal diamonds for saved 15c tiles, including worlds without a snapshot. Hover a marker for the best observed bonuses and coverage. Crop potential can include occupied oases. **Free when seen** counts only oases that were unoccupied at their last observation. Both totals are limited to three oases and reflect the eight adjacent tiles in the finder’s 3 × 3 scoring area. Verify ownership and settlement availability in-game.

## Live mode

`WWCore.fetchLive(host)` in `lib/core.js` is the hook for a logged-in mode. With a session in that world, same-origin `POST /api/v1/graphql` answers; without one it returns 401. v1 does not use it.

## Files

| File | Role |
| --- | --- |
| `lib/mapsql.js` | `map.sql` parser and snapshot summary |
| `lib/analysis.js` | Spawn ring, gold suspects, alliances, growth, CSV |
| `lib/core.js` | Host validation, settings, poll and dedupe |
| `lib/db.js` | IndexedDB store |
| `background.js` | Alarm and messages |
| `map-capture.*`, `lib/croppers.js` | Read normal map responses in DevTools and identify 15c valleys |
| `cropper-collector.js` | Read 15c valley tooltips |
| `own-village.js` | Content script: your villages from the game sidebar |
| `map-view.js` | Map canvas |
| `popup.*`, `dashboard.*` | UI |

Tests: `tests/worldwatch.test.cjs` (`cd tests && node --test worldwatch.test.cjs`).
