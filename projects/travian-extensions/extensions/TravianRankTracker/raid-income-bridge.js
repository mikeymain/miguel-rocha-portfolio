/* global chrome */
/**
 * Publishes Rank Tracker's recent raid-income average to the current Travian
 * origin. Other installed helpers can read this passive summary without access
 * to Rank Tracker's private extension storage.
 */
var RankTrackerRaidIncome = {
	/** Trailing window, matching the popup's "Raids" row (NOW_RAID_WINDOW_HOURS). */
	WINDOW_HOURS: 3,

	/**
	 * Bounty per hour over the trailing 3h ending at the latest sample, so
	 * helpers see the same rate as the popup. Histories shorter than 3h use
	 * their whole span. Daily counter resets are unwrapped first.
	 */
	hourlyAverage(history) {
		if (!Array.isArray(history) || history.length < 2) return null;

		const sorted = history.filter((point) => Number.isFinite(point?.timestamp) &&
			Number.isFinite(point.valBounty) && point.valBounty >= 0)
			.sort((a, b) => a.timestamp - b.timestamp);
		if (sorted.length < 2) return null;

		const samples = [{ timestamp: sorted[0].timestamp, value: 0 }];
		for (let i = 1; i < sorted.length; i++) {
			const previous = sorted[i - 1];
			const current = sorted[i];
			const increase = current.valBounty < previous.valBounty
				? current.valBounty : current.valBounty - previous.valBounty;
			samples.push({ timestamp: current.timestamp, value: samples[i - 1].value + increase });
		}

		const first = samples[0];
		const last = samples[samples.length - 1];
		const start = Math.max(first.timestamp, last.timestamp - this.WINDOW_HOURS * 3_600_000);
		const hours = (last.timestamp - start) / 3_600_000;
		if (!(hours > 0)) return null;
		return (last.value - this.valueAt(samples, start)) / hours;
	},

	/** Linear value of a sorted cumulative series at `time` (within its span). */
	valueAt(samples, time) {
		let i = 1;
		while (i < samples.length - 1 && samples[i].timestamp <= time) i++;
		const a = samples[i - 1];
		const b = samples[i];
		const span = b.timestamp - a.timestamp;
		return span > 0 ? a.value + (b.value - a.value) * ((time - a.timestamp) / span) : b.value;
	},
};

// Runs on every page load, so it reads only the small cached summary. The
// full history (up to 2000 snapshots) is read just once after each history
// write, which clears the summary (see storeHistory in utils.js).
(async function publishRaidIncome() {
	const summaryKey = `raidIncome_${location.origin}`;
	const pageKey = "_rt_ri";

	let summary = (await chrome.storage.local.get(summaryKey))[summaryKey];
	if (!summary || !Number.isFinite(summary.updatedAt)) {
		const historyKey = `history_${location.origin}`;
		const history = (await chrome.storage.local.get(historyKey))[historyKey];
		summary = {
			perHour: RankTrackerRaidIncome.hourlyAverage(history),
			updatedAt: (Array.isArray(history) ? history : []).reduce((latest, point) =>
				Number.isFinite(point?.timestamp) && Number.isFinite(point.valBounty)
					? Math.max(latest, point.timestamp) : latest, 0),
		};
		await chrome.storage.local.set({ [summaryKey]: summary });
	}
	if (!Number.isFinite(summary.perHour) || summary.perHour < 0) {
		localStorage.removeItem(pageKey);
		return;
	}
	localStorage.setItem(
		pageKey,
		JSON.stringify({ perHour: summary.perHour, updatedAt: summary.updatedAt }),
	);
})();
