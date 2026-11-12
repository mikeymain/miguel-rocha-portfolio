# Travian Extensions

[Portfolio](../../README.md) · [Usage guide](docs/USAGE.md) · [Releases](https://github.com/mikeymain/miguel-rocha-portfolio/releases)

Eight standalone browser extensions for Travian: forecasting, statistics history, event alerts and configurable interface tools.

**JavaScript · Manifest V3 · Chrome APIs · Service workers · Extension storage**

## Extensions

| Extension | Purpose | Version |
| --- | --- | --- |
| <a id="oasis-finder"></a>[Oasis Finder](extensions/OasisCalc/) | Oasis scoring and farm-list sorting | 70.4 |
| <a id="travalarm"></a>[TravAlarm](extensions/travAlarm/) | Game timers, custom reminders and notifications | 3.41 |
| <a id="travian-qol"></a>[Travian QoL](extensions/TravianQoL/) | Farm-list selection, reports and interface utilities | 1.3.1 |
| <a id="rank-tracker"></a>[Rank Tracker](extensions/TravianRankTracker/) | Rankings, statistics history and comparison graphs | 5.0.29 |
| <a id="next-settlement-calc"></a>[Next Settlement Calc](extensions/NextSettlementCalc/) | Culture-point forecasts and celebration planning | 2.6.5 |
| <a id="npc-automerchant"></a>[NPC AutoMerchant](extensions/automerchant/) | Troop resource calculations and hero-transfer assistance | 3.1.3 |
| <a id="night-mode"></a>[Night Mode](extensions/travian_night_mode/) | Persistent dark theme and button colours | 2.6.1 |
| <a id="world-watch"></a>[World Watch](extensions/WorldWatch/) | World snapshots from map.sql: spawn map, population gains, alliances | 1.4.0 |

## Install in Brave, Chrome, or Edge

1. Download and extract an extension from [Releases](https://github.com/mikeymain/miguel-rocha-portfolio/releases), or use its source directory under `extensions/`.
2. Open `brave://extensions`, `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the directory containing `manifest.json`.
4. Refresh Travian. Repeat for each extension you want to install.

No build step is required. To update, replace files in the same installed directory, reload the extension and refresh game tabs. Export Rank Tracker data before changing installations.

## Source guide

Each extension declares its entry points and permissions in `manifest.json`. See the [portfolio source guide](../../docs/REVIEWER-GUIDE.md) for implementation entry points. The [usage guide](docs/USAGE.md) covers controls, screenshots, data storage and troubleshooting.

## Validation and compatibility

Used in desktop Brave; Chrome and Edge compatibility requires feedback. Domain support varies by manifest. The portfolio does not run automated extension tests; live page compatibility, notifications and data accuracy require manual verification.

These are unofficial tools, unaffiliated with Travian Games. Travian's game rules restrict bots and automated actions, and some features act for you: NPC AutoMerchant's hero transfer clicks the game's transfer controls, and TravAlarm requests game pages in the background to refresh timers. Using them may break those rules and can lead to account penalties. See [data and permissions](docs/USAGE.md#data-and-permissions) before use.

## Attribution and feedback

Travian and game artwork belong to their respective owners. Third-party code retains its licence terms; [credits and copyright](docs/USAGE.md#copyright) are listed in the guide.

Report issues through [GitHub](https://github.com/mikeymain/miguel-rocha-portfolio/issues/new/choose) or Discord: `luckimikey`.
