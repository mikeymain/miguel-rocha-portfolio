/**
 * Travian Rank Tracker 5.0 — "Now" view.
 *
 * Renders the average-rank hero and the metrics table (weekly Top 10 rows and
 * general ranking rows) with change columns: since last open, 1h, 3h, 1d, 7d.
 * `renderUI` stays a global function declaration: utils.js `processHtmlData`
 * calls it after an on-page scrape.
 */

/** Ranks that feed the average: every General rank plus weekly PvE and Robbers. */
const NOW_GEN_RANK_KEYS = ["rankPop", "rankProd", "rankProdSoFar", "rankCp", "rankCpSoFar", "rankOff", "rankDef", "rankPve", "rankRob"];

/** Weekly rank keys and their Top 10 labels, for snapshots without the flat key. */
const NOW_WEEKLY_RANK_LABELS = { rankPve: "PvE of the week", rankRob: "Robbers of the week" };

/** Short display names for the weekly Top 10 labels stored in history. */
const NOW_WEEKLY_NAMES = {
	"PvP of the week": "Attack",
	"Defenders of the week": "Defense",
	"PvE of the week": "PvE",
	"Robbers of the week": "Robbers",
};

/** Column tags, in table order. */
const NOW_DELTA_TAGS = ["Open", "1h", "3h", "1d", "7d"];

/** Average rank shown by the previous renderUI call in this popup session. */
let lastHeroRank = null;

/** Resources credited per animal killed in the PvE weekly counter. */
const NOW_RES_PER_ANIMAL = 160;

/** localStorage key holding the expanded breakdown rows. */
const NOW_EXPANDED_KEY = "rankTracker.expandedRows";

/** Read the expanded breakdown keys; storage may be unavailable. */
function readExpanded() {
	try {
		const list = JSON.parse(localStorage.getItem(NOW_EXPANDED_KEY) || "[]");
		return new Set(Array.isArray(list) ? list.filter((k) => typeof k === "string") : []);
	} catch {
		return new Set();
	}
}

/** Persist the expanded breakdown keys. */
function writeExpanded(set) {
	try {
		localStorage.setItem(NOW_EXPANDED_KEY, JSON.stringify([...set]));
	} catch {
		// Storage unavailable: state lasts for this popup only.
	}
}

/**
 * Read the expanded keys and migrate the retired PvE breakdown: its Animals
 * row now sits under Robbers, so a saved open PvE row opens Robbers.
 */
function readExpandedMigrated() {
	const set = readExpanded();
	if (!set.has("PvE of the week")) return set;
	set.delete("PvE of the week");
	set.add("Robbers of the week");
	writeExpanded(set);
	return set;
}

/** Breakdown rows expanded by the user, kept across re-renders. */
const expandedRows = readExpandedMigrated();

/** Difference of two values, or null when either is missing. */
function subtractOrNull(a, b) {
	return Number.isFinite(a) && Number.isFinite(b) ? a - b : null;
}

/** PvE resources in a snapshot: animals killed × 160. */
function pveResourcesOf(snapshot) {
	const kills = top10Value(snapshot, "PvE of the week");
	return Number.isFinite(kills) ? kills * NOW_RES_PER_ANIMAL : null;
}

/** Robbers resources excluding PvE in a snapshot. */
function raidingOf(snapshot) {
	return subtractOrNull(top10Value(snapshot, "Robbers of the week"), pveResourcesOf(snapshot));
}

/** Field production so far in a snapshot: total minus bounty. */
function fieldsSoFarOf(snapshot) {
	return subtractOrNull(snapshot?.valProdSoFar, snapshot?.valBounty);
}

/** Bounty so far in a snapshot. */
function bountyOf(snapshot) {
	return Number.isFinite(snapshot?.valBounty) ? snapshot.valBounty : null;
}

/**
 * Breakdown rows for a metric, keyed by weekly label or general rank key.
 * Each part reads its value from any snapshot so deltas work per part.
 */
const NOW_BREAKDOWNS = {
	"Robbers of the week": [
		{ name: "Raiding", read: raidingOf },
		{ name: "Animals", read: pveResourcesOf },
	],
	rankProdSoFar: [
		{ name: "Fields", read: fieldsSoFarOf },
		{ name: "Bounty", read: bountyOf },
	],
};

/** Hours in the trailing window used for raid income per hour. */
const NOW_RAID_WINDOW_HOURS = 3;

/**
 * Raid income per hour at a snapshot's time: bounty gained in the trailing
 * 3h of saved history, divided by 3. Reset-safe via the unwrapped totals.
 *
 * @param {Array<Object>} history - Saved history points.
 * @param {Object} data - Latest snapshot.
 * @returns {(snapshot: Object) => number|null}
 */
function raidRateReader(history, data, valueKey = "valBountyTotal") {
	const points = prepareHistory([...history.filter((p) => p.timestamp !== data.timestamp), data]);
	const samples = points
		.filter((point) => Number.isFinite(point[valueKey]))
		.map((point) => ({ timestamp: point.timestamp, value: point[valueKey] }));
	return (snapshot) => {
		if (!Number.isFinite(snapshot?.timestamp)) return null;
		const gain = rollingWindowGain(samples, [snapshot.timestamp], NOW_RAID_WINDOW_HOURS * 3_600_000)[0];
		return gain == null ? null : Math.round(gain / NOW_RAID_WINDOW_HOURS);
	};
}

/** Production per hour plus raid income per hour; production alone without raid data. */
function incomeOf(snapshot, raidRate) {
	const prod = grossProdOf(snapshot);
	if (prod == null) return null;
	const raid = raidRate(snapshot);
	return prod + (Number.isFinite(raid) ? raid : 0);
}

/** Collapsible hourly income rows, including raiding without animal rewards. */
function incomeParts(raidRate, raidingRate) {
	return [
		{ name: "Fields + raiding", read: (s) => incomeOf(s, raidRate) },
		{ name: "Raids", read: (s) => { const raid = raidRate(s); return Number.isFinite(raid) ? raid : null; } },
		{ name: "Raids (no animals)", read: raidingRate },
	];
}

/**
 * Describe a change (current minus earlier) for one table cell.
 * Ranks improve when they decrease; values improve when they increase.
 *
 * @param {number|null} diff - Difference, or null when no reference exists.
 * @param {boolean} isRank
 * @returns {{cls: string, text: string, title: string}}
 */
function describeDelta(diff, isRank) {
	if (diff == null || !Number.isFinite(diff)) return { cls: "d--none", text: "—", title: "" };
	if (diff === 0) return { cls: "d--flat", text: "=", title: "0" };
	const plus = diff > 0 ? "+" : "";
	const title = plus + fmtNum(diff);
	if (isRank) {
		const improved = diff < 0;
		return {
			cls: improved ? "d--up" : "d--down",
			text: `${improved ? "▲" : "▼"}${Math.abs(diff).toLocaleString()}`,
			title,
		};
	}
	return { cls: diff > 0 ? "d--up" : "d--down", text: plus + fmtCompact(diff), title };
}

/**
 * Build a delta span.
 *
 * @param {string} base - "d-rank" or "d-val".
 * @param {{cls: string, text: string, title: string}} delta
 * @returns {HTMLElement}
 */
function deltaSpan(base, delta) {
	const span = h("span", `${base} ${delta.cls}`, delta.text);
	if (delta.title) span.title = delta.title;
	return span;
}

/** One rank used by the average, or null when missing. */
function avgRankOf(obj, key) {
	let rank = obj?.[key];
	if (rank == null && NOW_WEEKLY_RANK_LABELS[key]) {
		rank = obj?.top10?.find((entry) => entry.label === NOW_WEEKLY_RANK_LABELS[key])?.rank;
	}
	return Number.isFinite(rank) && rank > 0 ? rank : null;
}

/**
 * Change in average rank between two snapshots, over only the ranks both
 * hold: background snapshots drop weekly ranks, which would skew the change.
 */
function avgRankChange(now, ref) {
	if (!now || !ref) return null;
	const shared = NOW_GEN_RANK_KEYS.filter((k) => avgRankOf(now, k) != null && avgRankOf(ref, k) != null);
	if (shared.length === 0) return null;
	return calcAvgRank(now, shared) - calcAvgRank(ref, shared);
}

/** Average of the ranks in NOW_GEN_RANK_KEYS (or the given keys), or null. */
function calcAvgRank(obj, keys = NOW_GEN_RANK_KEYS) {
	if (!obj) return null;
	const vals = keys.map((k) => avgRankOf(obj, k)).filter((r) => r != null);
	return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

/** "HH:MM" for a timestamp. */
function clockTime(ts) {
	const d = new Date(ts);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "HH:MM DD/MM" for a timestamp. */
function clockDate(ts) {
	const d = new Date(ts);
	return `${clockTime(ts)} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Build the group header row for a tbody.
 *
 * @param {string} name
 * @param {string} [meta]
 * @param {string} [title]
 * @returns {HTMLTableRowElement}
 */
function groupRow(name, meta = "", title = "") {
	const tr = h("tr", "group-row");
	const th = h("th");
	th.colSpan = 8;
	th.scope = "colgroup";
	th.append(h("span", "group-name", name), h("span", "group-meta", meta));
	tr.append(th);
	if (title) tr.title = title;
	return tr;
}

/**
 * Build one metric row.
 *
 * @param {object} spec
 * @param {string} spec.name
 * @param {number|null} spec.rank
 * @param {number|null} spec.totalPlayers
 * @param {string} spec.main - Main value text.
 * @param {string} [spec.sub] - Secondary value text.
 * @param {string} [spec.valueTitle]
 * @param {Array<{rank: object, val: object|null}>} spec.cells - Five delta cells.
 * @returns {HTMLTableRowElement}
 */
function metricRow({ name, rank, totalPlayers, main, sub, valueTitle, cells }) {
	const tr = h("tr", "row");
	const th = h("th", "metric");
	th.scope = "row";
	th.append(h("span", "metric-name", name));

	const rankTd = h("td", "rank");
	const badge = h("span", "rank-badge", Number.isFinite(rank) && rank > 0 ? `#${rank.toLocaleString()}` : "—");
	if (Number.isFinite(rank) && rank > 0) applyTier(badge, tierInfo(rank, totalPlayers));
	rankTd.append(badge);

	const valueTd = h("td", "value");
	valueTd.append(h("span", "value-main", main));
	if (sub) valueTd.append(h("span", "value-sub", sub));
	if (valueTitle) valueTd.title = valueTitle;

	tr.append(th, rankTd, valueTd);
	for (const cell of cells) {
		const td = h("td", "delta");
		td.append(deltaSpan("d-rank", cell.rank));
		if (cell.val) td.append(deltaSpan("d-val", cell.val));
		tr.append(td);
	}
	return tr;
}

/**
 * Build one breakdown row: no rank, value and value deltas only.
 *
 * @param {string} name
 * @param {number|null} value
 * @param {Array<{rank: object, val: object|null}>} cells
 * @returns {HTMLTableRowElement}
 */
function breakdownRow(name, value, cells) {
	const tr = h("tr", "row row--part");
	const th = h("th", "metric");
	th.scope = "row";
	th.append(h("span", "metric-name", name));
	const valueTd = h("td", "value");
	valueTd.append(h("span", "value-main", fmtNum(value)));
	tr.append(th, h("td", "rank"), valueTd);
	for (const cell of cells) {
		const td = h("td", "delta");
		td.append(deltaSpan("d-rank", cell.val || describeDelta(null, false)));
		tr.append(td);
	}
	return tr;
}

/**
 * Make a metric row collapsible over its breakdown rows.
 *
 * @param {HTMLTableRowElement} parent
 * @param {string} key - Breakdown key, stored when expanded.
 * @param {Array<HTMLTableRowElement>} parts
 * @returns {Array<HTMLTableRowElement>} Parent followed by its parts.
 */
/**
 * Switch the metrics table to dense rows when its rows overflow the panel,
 * so expanded breakdowns do not push the last rows out of view.
 */
function fitMetricsTable() {
	const table = document.getElementById("metrics-table");
	const wrap = table?.parentElement;
	if (!wrap) return;
	table.classList.remove("is-dense");
	if (wrap.scrollHeight > wrap.clientHeight) table.classList.add("is-dense");
}

function collapsible(parent, key, parts) {
	if (parts.length === 0) return [parent];
	const nameEl = parent.querySelector(".metric-name");
	const button = h("button", "metric-toggle");
	button.type = "button";
	button.append(h("span", "metric-caret"), h("span", "", nameEl.textContent));
	nameEl.replaceChildren(button);
	parent.classList.add("row--parent");

	const setOpen = (open) => {
		button.setAttribute("aria-expanded", String(open));
		for (const part of parts) part.hidden = !open;
		fitMetricsTable();
	};
	setOpen(expandedRows.has(key));
	// The whole row toggles; button clicks (mouse or keyboard) bubble here.
	parent.addEventListener("click", () => {
		const open = button.getAttribute("aria-expanded") !== "true";
		if (open) expandedRows.add(key);
		else expandedRows.delete(key);
		writeExpanded(expandedRows);
		setOpen(open);
	});
	return [parent, ...parts];
}

/** A single message row spanning the table. */
function stateRow(kind, message) {
	const tr = h("tr", "state-row");
	const td = h("td");
	td.colSpan = 8;
	const p = h("p", "state-msg", message);
	p.dataset.kind = kind;
	td.append(p);
	tr.append(td);
	return tr;
}

/**
 * Render '#rank' as split-flap characters. Characters that changed since the
 * previous render flip, unless reduced motion is requested.
 */
function renderHeroRank(container, avg) {
	const text = `#${avg.toLocaleString()}`;
	const prevText = lastHeroRank == null ? null : `#${lastHeroRank.toLocaleString()}`;
	const animate = prevText != null && lastHeroRank !== avg && !reducedMotion();
	const flaps = [...text].map((ch, i) => {
		const flap = h("span", "flap", ch);
		flap.style.setProperty("--i", String(i));
		// Compare right-aligned so units digits line up with units digits.
		const prevCh = prevText ? prevText[prevText.length - (text.length - i)] : undefined;
		if (animate && prevCh !== ch) {
			flap.classList.add("is-flipping");
			flap.addEventListener("animationend", () => flap.classList.remove("is-flipping"), { once: true });
		}
		return flap;
	});
	container.replaceChildren(...flaps);
	lastHeroRank = avg;
}

/** Empty the hero and mark it as having no average. */
function clearHero() {
	const hero = document.getElementById("hero");
	if (hero) hero.dataset.empty = "true";
	for (const id of ["hero-rank", "hero-tier", "hero-pct", "hero-deltas"]) {
		document.getElementById(id)?.replaceChildren();
	}
}

/**
 * Render the hero: average rank, tier, percentile and five change chips.
 */
function renderHero(data, refs) {
	const avg = calcAvgRank(data);
	const hero = document.getElementById("hero");
	if (avg == null) {
		clearHero();
		return;
	}
	if (hero) delete hero.dataset.empty;

	const rankEl = document.getElementById("hero-rank");
	if (rankEl) renderHeroRank(rankEl, avg);

	const tier = tierInfo(avg, data.totalPlayers);
	const tierEl = document.getElementById("hero-tier");
	if (tierEl) {
		const name = tier.isTop10 ? "Top 10" : tier.tier === "unknown" ? "" : tier.tier[0].toUpperCase() + tier.tier.slice(1);
		tierEl.textContent = name;
		applyTier(tierEl, tier);
	}
	const pctEl = document.getElementById("hero-pct");
	if (pctEl) {
		const pct = tier.pct == null ? null : tier.pct * 100;
		pctEl.textContent = pct == null ? "" : `Top ${pct.toFixed(pct < 10 ? 2 : 1)}%`;
	}

	const deltasEl = document.getElementById("hero-deltas");
	if (deltasEl) {
		const chips = refs.map((ref, i) => {
			const diff = avgRankChange(data, ref);
			const chip = h("span", "chip");
			chip.append(h("span", "chip-tag", NOW_DELTA_TAGS[i]), deltaSpan("d-rank", describeDelta(diff, true)));
			return chip;
		});
		deltasEl.replaceChildren(...chips);
	}
}

/**
 * Render the "Now" view with live stats and change comparisons.
 *
 * @param {object} data - Latest snapshot.
 * @param {Array<object>} history - Saved history points.
 */
function renderUI(data, history) {
	if (!data) return;
	history = history || [];

	const now = Date.now();
	const offsets = [
		now - 1 * 60 * 60 * 1000,
		now - 3 * 60 * 60 * 1000,
		now - 24 * 60 * 60 * 1000,
		now - 7 * 24 * 60 * 60 * 1000,
	];
	const baseline = popupState.baselineSnapshot;
	const generalRefs = [baseline, ...offsets.map((t) => getHistoryPoint(history, t))];
	const weeklyHistory = history.filter((point) => point.top10?.length);
	const weeklyRefs = [baseline, ...offsets.map((t) => getHistoryPoint(weeklyHistory, t))];

	/** Five cells of rank/value deltas for one metric. */
	const deltaCells = (currRank, currVal, readRank, readVal, isTop10) =>
		(isTop10 ? weeklyRefs : generalRefs).map((snapshot) => {
			const oldRank = readRank(snapshot);
			const rank = describeDelta(currRank == null || oldRank == null ? null : currRank - oldRank, true);
			if (currVal == null) return { rank, val: null };

			const oldVal = readVal(snapshot);
			let diff = oldVal == null ? null : currVal - oldVal;
			if (diff != null && isTop10) {
				// Weekly counters reset: sum observed gains between the two points.
				const start = snapshot;
				if (!Number.isFinite(start?.timestamp) || !Number.isFinite(data.timestamp) || start.timestamp > data.timestamp) {
					diff = null;
				} else {
					const samples = [start, ...history
						.filter((point) => point.timestamp > start.timestamp && point.timestamp < data.timestamp)
						.sort((a, b) => a.timestamp - b.timestamp), data];
					const totals = counterTotals(samples, readVal);
					diff = totals[0] == null || totals[totals.length - 1] == null
						? null : totals[totals.length - 1] - totals[0];
				}
			}
			return { rank, val: describeDelta(diff, false) };
		});

	renderHero(data, generalRefs);
	renderWeekly(data, deltaCells);
	renderGeneral(data, deltaCells, history);
	fitMetricsTable();

	const playersEl = document.getElementById("players");
	if (playersEl) playersEl.textContent = data.totalPlayers != null ? `Total players: ${data.totalPlayers.toLocaleString()}` : "";

	// Show the refresh from before this popup opened, so the gap since then is visible.
	const shownAt = popupState.previousRefreshAt || data.timestamp;
	if (shownAt) setStatus(`Last refresh ${clockTime(shownAt)} · ${formatDuration(Date.now() - shownAt)} ago`, "ok");
}

/** Weekly Top 10 rows. */
function renderWeekly(data, deltaCells) {
	const body = document.getElementById("weekly-body");
	if (!body) return;
	const items = data.top10 || [];
	const meta = data.weeklyTimestamp ? `Observed ${clockDate(data.weeklyTimestamp)}` : "";
	const title = data.weeklyTimestamp ? `Weekly data observed: ${new Date(data.weeklyTimestamp).toLocaleString()}` : "";
	const rows = [groupRow("Weekly", meta, title)];

	if (items.length === 0) rows.push(stateRow("empty", "No weekly data yet."));
	for (const item of items) {
		const valClean = cleanSmartNum(item.val);
		const parent = metricRow({
			name: NOW_WEEKLY_NAMES[item.label] || item.label,
			rank: item.rank,
			totalPlayers: data.totalPlayers,
			main: Number.isFinite(valClean) ? fmtNum(valClean) : (item.val || "0"),
			cells: deltaCells(
				item.rank,
				valClean,
				(s) => s?.top10?.find((entry) => entry.label === item.label)?.rank,
				(s) => top10Value(s, item.label),
				true,
			),
		});
		rows.push(...collapsible(parent, item.label, breakdownRows(data, item.label, deltaCells, true)));
	}
	body.replaceChildren(...rows);
}

/**
 * Breakdown rows for one metric; parts without a current value are skipped.
 *
 * @param {object} data - Latest snapshot.
 * @param {string} key - NOW_BREAKDOWNS key.
 * @param {Function} deltaCells
 * @param {boolean} isTop10
 * @returns {Array<HTMLTableRowElement>}
 */
function breakdownRows(data, key, deltaCells, isTop10, parts = NOW_BREAKDOWNS[key]) {
	return (parts || [])
		.map((part) => ({ part, value: part.read(data) }))
		.filter(({ value }) => value != null)
		.map(({ part, value }) => breakdownRow(part.name, value, deltaCells(null, value, () => null, part.read, isTop10)));
}

/** General ranking rows. */
function renderGeneral(data, deltaCells, history) {
	const body = document.getElementById("general-body");
	if (!body) return;
	const rows = [groupRow("General")];
	const raidRate = raidRateReader(history, data);
	const raidingRate = raidRateReader(history, data, "valRobExcludingPveTotal");
	const add = (name, keyRank, keyVal, readVal = (s) => s?.[keyVal], parts = undefined) => {
		const rank = data[keyRank];
		const points = readVal(data);
		const parent = metricRow({
			name,
			rank,
			totalPlayers: data.totalPlayers,
			main: points != null ? fmtNum(points) : "—",
			cells: deltaCells(rank, points, (s) => s?.[keyRank], readVal, false),
		});
		rows.push(...collapsible(parent, keyRank, breakdownRows(data, keyRank, deltaCells, false, parts)));
	};

	add("Population", "rankPop", "valPop");
	add("Prod / Hour", "rankProd", "valProd", grossProdOf, incomeParts(raidRate, raidingRate));
	add("Prod So Far", "rankProdSoFar", "valProdSoFar");
	add("CP / Day", "rankCp", "cpProd");
	add("CP So Far", "rankCpSoFar", "valCpSoFar");
	add("Offensive Strength", "rankOff", "pointsOff");
	add("Defensive Strength", "rankDef", "pointsDef");
	body.replaceChildren(...rows);
}

/**
 * Show a loading, empty or error state in the table and clear the hero.
 *
 * @param {"loading"|"empty"|"error"} kind
 * @param {string} [message]
 */
function renderNowState(kind, message = "") {
	const weekly = document.getElementById("weekly-body");
	const general = document.getElementById("general-body");
	clearHero();
	if (kind === "loading") {
		const skeletons = (count) => Array.from({ length: count }, () => {
			const tr = h("tr", "row is-skeleton");
			for (let i = 0; i < 8; i++) {
				const td = h("td");
				td.append(h("span", "skeleton"));
				tr.append(td);
			}
			return tr;
		});
		weekly?.replaceChildren(groupRow("Weekly"), ...skeletons(4));
		general?.replaceChildren(groupRow("General"), ...skeletons(7));
		return;
	}
	weekly?.replaceChildren(stateRow(kind, message));
	general?.replaceChildren();
}
