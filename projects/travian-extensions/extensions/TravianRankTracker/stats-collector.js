/* global chrome, processHtmlData, saveToHistory, parseStatsRobust, mergeFields, WEEKLY_KEYS */
/**
 * Passive stats collector — runs as a content script on Travian statistics
 * pages. Replaces the alarm-driven background fetch with user-initiated
 * data collection: stats are recorded only when the player actually visits
 * a statistics page.
 */
(async function collectStats() {
	const origin = location.origin;
	const path = location.pathname;
	const storageKey = `history_${origin}`;
	const latestKey = `latest_${origin}`;
	const api = chrome;

	// Register this server so the popup knows about it
	const { serverUrls = [] } = await api.storage.local.get("serverUrls");
	if (!serverUrls.includes(origin)) {
		await api.storage.local.set({ serverUrls: [...serverUrls, origin] });
	}

	const html = document.documentElement.outerHTML;

	try {
		if (/\/statistics\/(general|player\/overview)/.test(path)) {
			const merged = await processHtmlData(
				html,
				api,
				origin,
				storageKey,
				true,       // returnOnly — no extra fetchTop10 request
				false,      // weekly = false for general/overview pages
			);
			if (merged) await saveToHistory(merged, api, storageKey);
		}

		if (/\/statistics\/player\/top10/.test(path)) {
			const existing = (await api.storage.local.get(latestKey))[latestKey] || {};
			const scannedData = parseStatsRobust(html, true);
			if (scannedData.foundTop10) {
				const merged = { ...existing, timestamp: Date.now() };
				for (const key of WEEKLY_KEYS) delete merged[key];
				merged.top10 = scannedData.top10List;
				merged.weeklyTimestamp = merged.timestamp;
				mergeFields(merged, scannedData, WEEKLY_KEYS);
				await saveToHistory(merged, api, storageKey);
			}
		}
	} catch (_) {
		// Page may not contain stats (logged out, wrong page variant)
	}
})();
