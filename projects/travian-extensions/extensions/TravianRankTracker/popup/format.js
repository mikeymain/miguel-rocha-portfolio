/**
 * Travian Rank Tracker 5.0 — shared popup helpers.
 *
 * Loaded after utils.js and before every other popup script. Defines only the
 * shared globals listed in the popup contract; no DOM work runs at load time.
 */

/** Chrome extension API namespace. */
const api = chrome;

/** Mutable popup session state shared by the popup scripts. */
const popupState = {
	activeServerOrigin: null,
	baselineSnapshot: null,
	baselineExpired: false,
	isVelocityMode: false,
};

/** Cooldown before the "since last open" baseline re-captures. */
const BASELINE_COOLDOWN_MS = 5 * 60 * 1000;

/** Opening the popup skips the refresh when the last one is newer than this. */
const OPEN_REFRESH_SKIP_MS = 10 * 1000;

/**
 * Create an element with an optional class name and text content.
 *
 * @param {string} tag
 * @param {string} [className]
 * @param {string|number} [text]
 * @returns {HTMLElement}
 */
function h(tag, className, text) {
	const el = document.createElement(tag);
	if (className) el.className = className;
	if (text != null) el.textContent = String(text);
	return el;
}

/**
 * Format a number with locale grouping. Negative values use U+2212.
 *
 * @param {number} n
 * @returns {string}
 */
function fmtNum(n) {
	if (!Number.isFinite(n)) return "—";
	const text = Math.abs(n).toLocaleString();
	return n < 0 ? `−${text}` : text;
}

/**
 * Format a number compactly (1.2k / 3.4M / 1.1B). Values under 10,000 stay
 * exact. Negative values use U+2212; positive values carry no sign.
 *
 * @param {number} n
 * @returns {string}
 */
function fmtCompact(n) {
	if (!Number.isFinite(n)) return "—";
	const abs = Math.abs(n);
	const sign = n < 0 ? "−" : "";
	const trim = (value, digits) => String(parseFloat(value.toFixed(digits)));
	if (abs < 10_000) return sign + abs.toLocaleString();
	if (abs < 1e6) return `${sign}${trim(abs / 1e3, abs < 1e5 ? 1 : 0)}k`;
	if (abs < 1e9) return `${sign}${trim(abs / 1e6, abs < 1e8 ? 2 : 1)}M`;
	return `${sign}${trim(abs / 1e9, 2)}B`;
}

/** Counters that can drop on a weekly reset; never interpolated across a drop. */
const INTERPOLATION_RESET_KEYS = new Set(["valRob", "valPve", "valPveResources", "valRobExcludingPve", "valBounty"]);

/** Linear value between `a` and `b`, or null when either is missing. */
function lerp(a, b, ratio) {
	return Number.isFinite(a) && Number.isFinite(b) ? Math.round(a + (b - a) * ratio) : null;
}

/** Interpolate weekly Top 10 rows by label; a dropped value counts as a reset. */
function interpolateTop10(before, after, ratio) {
	if (!before?.top10?.length || !after?.top10?.length) return undefined;
	const rows = [];
	for (const item of before.top10) {
		const next = after.top10.find((entry) => entry.label === item.label);
		if (!next) continue;
		const rank = lerp(item.rank, next.rank, ratio);
		const from = top10Value(before, item.label);
		const to = top10Value(after, item.label);
		const val = Number.isFinite(from) && Number.isFinite(to) && to >= from ? lerp(from, to, ratio) : null;
		rows.push({ ...item, rank, val: val == null ? null : String(val) });
	}
	return rows.length ? rows : undefined;
}

/**
 * Simulate a snapshot at `targetTime` from the saved points either side of it.
 * Numeric fields are linear; reset counters that dropped are left out.
 */
function interpolateSnapshot(before, after, targetTime) {
	const ratio = (targetTime - before.timestamp) / (after.timestamp - before.timestamp);
	const point = { timestamp: targetTime, simulated: true };
	for (const key of Object.keys(before)) {
		if (key === "timestamp" || typeof before[key] !== "number") continue;
		if (INTERPOLATION_RESET_KEYS.has(key) && after[key] < before[key]) continue;
		const value = lerp(before[key], after[key], ratio);
		if (value != null) point[key] = value;
	}
	const top10 = interpolateTop10(before, after, ratio);
	if (top10) point.top10 = top10;
	return point;
}

/**
 * Find the history entry closest to `targetTime` within half the comparison
 * window (so "1h" never compares against now or a day ago). When no saved
 * point lies in that window, simulate one from the points either side of it.
 */
function getHistoryPoint(history, targetTime, now = Date.now()) {
	if (!history?.length || targetTime < history.reduce((oldest, point) => Math.min(oldest, point.timestamp), Infinity)) return null;
	let closest = null;
	let before = null;
	let after = null;
	let minDiff = (now - targetTime) / 2;
	for (const item of history) {
		const diff = Math.abs(item.timestamp - targetTime);
		if (diff <= minDiff) {
			minDiff = diff;
			closest = item;
		}
		if (item.timestamp <= targetTime && (!before || item.timestamp > before.timestamp)) before = item;
		if (item.timestamp > targetTime && (!after || item.timestamp < after.timestamp)) after = item;
	}
	if (closest) return closest;
	return before && after ? interpolateSnapshot(before, after, targetTime) : null;
}

/**
 * Show a status message in the top bar.
 *
 * @param {string} text
 * @param {"idle"|"busy"|"ok"|"error"} [state="idle"]
 */
function setStatus(text, state = "idle") {
	const textEl = document.getElementById("status-text");
	if (textEl) textEl.textContent = text;
	const statusEl = document.getElementById("status");
	if (statusEl) statusEl.dataset.state = state;
}

/**
 * Whether the user asked for reduced motion.
 *
 * @returns {boolean}
 */
function reducedMotion() {
	try {
		return typeof window !== "undefined" && typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	} catch {
		return false;
	}
}

/**
 * Rank tier plus the rank's share of the player pool.
 *
 * @param {number} rank
 * @param {number} totalPlayers
 * @returns {{color: string, tier: string, isTop10: boolean, isImmortal: boolean, pct: number|null}}
 */
function tierInfo(rank, totalPlayers) {
	const tier = getRankTier(rank, totalPlayers);
	const pct = Number.isFinite(rank) && rank > 0 && Number.isFinite(totalPlayers) && totalPlayers > 0
		? rank / totalPlayers : null;
	return { ...tier, pct };
}

/**
 * Apply tier data, colour and emphasis classes to an element.
 *
 * @param {HTMLElement} el
 * @param {{color: string, tier: string, isTop10: boolean, isImmortal: boolean}} tier
 */
function applyTier(el, tier) {
	if (!el || !tier) return;
	el.dataset.tier = tier.tier;
	el.style.setProperty("--tier", tier.color);
	el.classList.toggle("is-top10", !!tier.isTop10);
	el.classList.toggle("is-immortal", !!tier.isImmortal);
}
