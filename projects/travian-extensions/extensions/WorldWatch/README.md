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
| Gold suspects | Population gain per account between two snapshots, gain per hour, Δ villages and distance to a point. Rows above the 99th percentile gain are highlighted. Only accounts present in both snapshots are compared. A Δ villages above 0 means part of the gain comes from a new or conquered village. |
| Alliances | Members, villages, population, population-weighted centre and main quadrant. |
| Map | Travian-style map: 60 px per field at 100 %, like the in-game map. The window fills the free page area (at least 543 × 401 px, the in-game size). Zoom from 100 % down to the whole world; drag to pan, mouse wheel to zoom. Lines mark the world edge at ±200. Newest spawns are highlighted and their distance band from 0\|0 is shaded; the top 10 alliances are coloured and labelled at their centre. Hover a field for player, alliance and population. |

Every table exports to CSV. Nature and Natar villages are ignored. Positive y is north. Distances wrap around the 401 × 401 map.

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
| `map-view.js` | Map canvas |
| `popup.*`, `dashboard.*` | UI |

Tests: `tests/worldwatch.test.cjs` (`cd tests && node --test worldwatch.test.cjs`).
