/**
 * Travian Rank Tracker 5.0 — "Now" view.
 *
 * Renders the average-rank hero and the metrics table (weekly Top 10 rows and
 * general ranking rows) with change columns: since last open, 1h, 3h, 1d, 7d.
 * `renderUI` stays a global function declaration: utils.js `processHtmlData`
 * calls it after an on-page scrape.
 */

/** Ranks shown in the in-game general table; only these feed the average. */
const NOW_GEN_RANK_KEYS = ["rankPop", "rankProd", "rankCp", "rankOff", "rankDef"];

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

/** Average of the general-table ranks in a snapshot, or null. */
function calcAvgRank(obj) {
	if (!obj) return null;
	const vals = NOW_GEN_RANK_KEYS.map((k) => obj[k]).filter((r) => Number.isFinite(r) && r > 0);
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
			const old = calcAvgRank(ref);
			const chip = h("span", "chip");
			chip.append(h("span", "chip-tag", NOW_DELTA_TAGS[i]), deltaSpan("d-rank", describeDelta(old == null ? null : avg - old, true)));
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
	const deltaCells = (currRank, currVal, readRank, readVal, isTop10, label) =>
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
					const totals = counterTotals(samples, (point) => top10Value(point, label));
					diff = totals[0] == null || totals[totals.length - 1] == null
						? null : totals[totals.length - 1] - totals[0];
				}
			}
			return { rank, val: describeDelta(diff, false) };
		});

	renderHero(data, generalRefs);
	renderWeekly(data, deltaCells);
	renderGeneral(data, deltaCells);

	const playersEl = document.getElementById("players");
	if (playersEl) playersEl.textContent = data.totalPlayers != null ? data.totalPlayers.toLocaleString() : "";

	if (data.timestamp) setStatus(`Updated ${clockTime(data.timestamp)}`, "ok");
}

/** Weekly Top 10 rows. */
function renderWeekly(data, deltaCells) {
	const body = document.getElementById("weekly-body");
	if (!body) return;
	const items = data.top10 || [];
	const meta = data.weeklyTimestamp ? `Observed ${clockDate(data.weeklyTimestamp)}` : "";
	const title = data.weeklyTimestamp ? `Weekly data observed: ${new Date(data.weeklyTimestamp).toLocaleString()}` : "";
	const rows = [groupRow("Weekly", meta, title)];

	// Raw animal-kill count and raided resources for the derived values.
	const pveItem = items.find((i) => i.label === "PvE of the week");
	const robItem = items.find((i) => i.label === "Robbers of the week");
	const pveKills = pveItem ? cleanSmartNum(pveItem.val) : null;
	const robRaw = robItem ? cleanSmartNum(robItem.val) : null;
	const pveResources = pveKills != null ? pveKills * 160 : null;
	const robExcludingPve = robRaw != null && pveResources != null ? robRaw - pveResources : null;

	if (items.length === 0) rows.push(stateRow("empty", "No weekly data yet."));
	for (const item of items) {
		const valClean = cleanSmartNum(item.val);
		let main = item.val ? item.val.toLocaleString() : "0";
		let sub = "";
		let valueTitle = "";
		if (item.label === "PvE of the week" && pveResources != null) {
			main = fmtNum(valClean);
			sub = `${fmtNum(pveResources)} res`;
			valueTitle = "Animals killed / resources";
		}
		if (item.label === "Robbers of the week" && robExcludingPve != null && robRaw != null) {
			main = fmtNum(robExcludingPve);
			sub = `of ${fmtNum(robRaw)}`;
			valueTitle = "Raided excluding PvE / raided";
		}
		rows.push(metricRow({
			name: NOW_WEEKLY_NAMES[item.label] || item.label,
			rank: item.rank,
			totalPlayers: data.totalPlayers,
			main,
			sub,
			valueTitle,
			cells: deltaCells(
				item.rank,
				valClean,
				(s) => s?.top10?.find((entry) => entry.label === item.label)?.rank,
				(s) => top10Value(s, item.label),
				true,
				item.label,
			),
		}));
	}
	body.replaceChildren(...rows);
}

/** General ranking rows. */
function renderGeneral(data, deltaCells) {
	const body = document.getElementById("general-body");
	if (!body) return;
	const rows = [groupRow("General")];
	const add = (name, keyRank, keyVal, display) => {
		const rank = data[keyRank];
		const points = data[keyVal];
		rows.push(metricRow({
			name,
			rank,
			totalPlayers: data.totalPlayers,
			main: display?.main ?? (points != null ? fmtNum(points) : "—"),
			sub: display?.sub,
			valueTitle: display?.title,
			cells: deltaCells(rank, points, (s) => s?.[keyRank], (s) => s?.[keyVal], false, ""),
		}));
	};

	add("Population", "rankPop", "valPop");
	add("Prod / Hour", "rankProd", "valProd");
	add("Prod So Far", "rankProdSoFar", "valProdSoFar",
		data.valBounty != null && data.valProdSoFar != null
			? { main: fmtNum(data.valBounty), sub: `${fmtNum(data.valProdSoFar)} prod`, title: "Bounty / production so far" }
			: null);
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
