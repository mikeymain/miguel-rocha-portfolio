if (typeof importScripts === "function") importScripts("utils.js");

// Minimal service worker — alarm-based fetching removed (v5.1).
// Stats are now collected passively by stats-collector.js content script
// when the user visits statistics pages.

// Raid income is no longer sent to TravAlarm (5.1.19): drop its cached summaries.
chrome.runtime.onInstalled.addListener(async () => {
	const all = await chrome.storage.local.get(null);
	const stale = Object.keys(all).filter((k) => k.startsWith("raidIncome_"));
	if (stale.length) await chrome.storage.local.remove(stale);
});
