if (typeof importScripts === "function") importScripts("utils.js");

// Minimal service worker — alarm-based fetching removed (v5.1).
// Stats are now collected passively by stats-collector.js content script
// when the user visits statistics pages.

// TravAlarm IDs: Chromium (fixed by its manifest "key") and Firefox.
const TRAVALARM_ID = chrome.runtime.getURL("").startsWith("moz-extension:")
	? "travalarm@travian-extensions.mikeymain"
	: "ebkjalailcfpfhddfnlapiadnllnncch";

// Forward the raid-income summary from raid-income-bridge.js to TravAlarm for
// its FNPC time. Fails silently when TravAlarm is not installed.
chrome.runtime.onMessage.addListener((msg, sender) => {
	if (msg?.type !== "RT_RAID_INCOME" || sender.id !== chrome.runtime.id || !sender.tab) return;
	chrome.runtime.sendMessage(TRAVALARM_ID, {
		type: "RAID_INCOME",
		origin: msg.origin,
		perHour: msg.perHour,
		updatedAt: msg.updatedAt,
	}).catch(() => {});
});
