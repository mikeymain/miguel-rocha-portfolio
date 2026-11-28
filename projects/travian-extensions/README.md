# Travian Extensions

[Portfolio](../../README.md) · [Usage guide](docs/USAGE.md) · [Releases](https://github.com/mikeymain/miguel-rocha-portfolio/releases)

Eight standalone browser extensions for Travian: forecasting, statistics history, event alerts and configurable interface tools.

**JavaScript · Manifest V3 · Chrome APIs · Service workers · Extension storage**

## Extensions

| Extension | Purpose | Version |
| --- | --- | --- |
| <a id="oasis-finder"></a>[Oasis Finder](extensions/OasisCalc/) | Oasis scoring, units needed, and farm-list defence sorting | 70.36 |
| <a id="travalarm"></a>[TravAlarm](extensions/travAlarm/) | Incoming attack alerts, game timers and custom reminders | 3.71 |
| <a id="travian-qol"></a>[Travian QoL](extensions/TravianQoL/) | Farm-list selection, reports and interface utilities | 1.7.14 |
| <a id="rank-tracker"></a>[Rank Tracker](extensions/TravianRankTracker/) | Rankings, statistics history and comparison graphs | 5.1.16 |
| <a id="next-settlement-calc"></a>[Next Settlement Calc](extensions/NextSettlementCalc/) | Culture-point forecasts and celebration planning | 2.6.25 |
| <a id="npc-automerchant"></a>[Travian NPC Calculator](extensions/automerchant/) | Maximum troop counts and resource splits for the NPC Merchant | 3.2.25 |
| <a id="night-mode"></a>[Travian Dark Mode](extensions/travian_night_mode/) | Dark theme, button colours, and optional night-time village and field assets | 2.7.4 |
| <a id="world-watch"></a>[World Watch](extensions/WorldWatch/) | World snapshots, spawn and settlement heat maps, alliances and 15c finder | 1.11.0 |

## Install in Brave, Chrome, or Edge

1. Download and extract an extension from [Releases](https://github.com/mikeymain/miguel-rocha-portfolio/releases), or use its source directory under `extensions/`.
2. Open `brave://extensions`, `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the directory containing `manifest.json`.
4. Refresh Travian. Repeat for each extension you want to install.

No build step is required. To update, replace files in the same installed directory, reload the extension and refresh game tabs. Export Rank Tracker data before changing installations.

### Install in Firefox

1. Download and extract the extension.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on** and choose the extension's `manifest.json`.
4. Refresh Travian. Repeat for each extension. Firefox removes temporary add-ons when it exits, so load them again after restarting.

## Source guide

Each extension declares its entry points and permissions in `manifest.json`. See the [portfolio source guide](../../docs/REVIEWER-GUIDE.md) for implementation entry points. The [usage guide](docs/USAGE.md) covers controls, screenshots, data storage and troubleshooting.

## Validation and compatibility

Domain support varies by manifest. Verify notifications and data accuracy on the game world you use.

These are unofficial tools, unaffiliated with Travian Games. Travian's game rules restrict bots and automated actions, and some features act for you: Travian NPC Calculator's hero transfer clicks the game's transfer controls, and TravAlarm requests game pages in the background to refresh timers. Using them may break those rules and can lead to account penalties. See [data and permissions](docs/USAGE.md#data-and-permissions) before use.

## Attribution and feedback

Travian and game artwork belong to their respective owners. Third-party code retains its licence terms; [credits and copyright](docs/USAGE.md#copyright) are listed in the guide.

Report issues through [GitHub](https://github.com/mikeymain/miguel-rocha-portfolio/issues/new/choose) or Discord: `luckimikey`.
