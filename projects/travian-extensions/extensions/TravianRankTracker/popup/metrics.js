/**
 * Rank Tracker 5.0 — chart metric definitions and history transforms.
 *
 * Dataset labels are storage keys for `graphPrefs` and `customGroups`; they
 * must stay byte-identical across versions. Colours are free to change.
 */

/**
 * One entry per chart line. `axis` "y" = rank (solid line), "y1" = value
 * (dashed line). `group` maps the metric into the picker.
 */
const DATASETS_CONFIG = [
	{ key: "pointsOff", label: "Offensive Strength", color: "#ff9a9a", dash: [2, 2], axis: "y1", defHidden: true, ceil: true, group: "military" },
	{ key: "pointsDef", label: "Defensive Strength", color: "#9de8a0", dash: [2, 2], axis: "y1", defHidden: true, ceil: true, group: "military" },
	{ key: "rankPvp", label: "Attacker of the week", color: "#ff6b6b", dash: null, axis: "y", defHidden: false, group: "weekly" },
	{ key: "rankDefTop", label: "Defenders of the week", color: "#5fd38d", dash: null, axis: "y", defHidden: false, group: "weekly" },
	{ key: "valRob", label: "Res Raided This Week", color: "#62c6e8", dash: [5, 5], axis: "y1", defHidden: false, group: "raids" },
	{ key: "rankRob", label: "Robbers of the week", color: "#5b9cff", dash: null, axis: "y", defHidden: true, group: "weekly" },
	{ key: "valPve", label: "Animals Killed", color: "#e8b45c", dash: [5, 5], axis: "y1", defHidden: true, group: "raids" },
	{ key: "valPveResources", label: "Res from Animal Kills", color: "#ffd88a", dash: [5, 5], axis: "y1", defHidden: true, group: "raids" },
	{ key: "valRobExcludingPve", label: "Res Raided (excl. PvE)", color: "#3fa7c9", dash: [5, 5], axis: "y1", defHidden: true, group: "raids" },
	{ key: "valRaidHourly", label: "Avg Raiding / Hour (with animals)", color: "#62c6e8", dash: [2, 2], axis: "y1", defHidden: true, perHour: true, group: "raids" },
	{ key: "valRaidHourlyExcludingPve", label: "Avg Raiding / Hour (without animals)", color: "#3fa7c9", dash: [4, 2], axis: "y1", defHidden: true, perHour: true, group: "raids" },
	{ key: "rankPve", label: "PvE of the week", color: "#f2a541", dash: null, axis: "y", defHidden: false, group: "weekly" },
	{ key: "rankPop", label: "Pop Rank", color: "#c9ced6", dash: null, axis: "y", defHidden: false, group: "population" },
	{ key: "valPop", label: "Population", color: "#f1efe9", dash: [2, 2], axis: "y1", defHidden: true, group: "population" },
	{ key: "rankProd", label: "Prod/Day Rank", color: "#e7c24a", dash: null, axis: "y", defHidden: true, group: "production" },
	{ key: "valProd", label: "Production per Hour", color: "#4fe0d2", dash: [2, 2], axis: "y1", defHidden: false, group: "production" },
	{ key: "rankProdSoFar", label: "Prod So Far Rank", color: "#b8952c", dash: null, axis: "y", defHidden: true, group: "production" },
	{ key: "valProdSoFar", label: "Total Production", color: "#2fb5a8", dash: [4, 2], axis: "y1", defHidden: false, group: "production" },
	{ key: "valBounty", label: "Bounty (Raid Gained)", color: "#ff8f4d", dash: [4, 2], axis: "y1", defHidden: false, group: "raids" },
	{ key: "rankCp", label: "CP/Day Rank", color: "#a98bff", dash: null, axis: "y", defHidden: true, group: "culture" },
	{ key: "cpProd", label: "CP per Day", color: "#7ee08f", dash: [2, 2], axis: "y1", defHidden: true, group: "culture" },
	{ key: "rankCpSoFar", label: "CP So Far Rank", color: "#7c5fd6", dash: null, axis: "y", defHidden: true, group: "culture" },
	{ key: "valCpSoFar", label: "Total CP", color: "#3fc46a", dash: [4, 2], axis: "y1", defHidden: true, group: "culture" },
];

/** Picker sections in display order; `keys` lists DATASETS_CONFIG keys. */
const METRIC_GROUPS = [
	{ id: "weekly", title: "Weekly", keys: ["rankPvp", "rankDefTop", "rankRob", "rankPve"] },
	{ id: "raids", title: "Raids", keys: ["valRob", "valRobExcludingPve", "valRaidHourly", "valRaidHourlyExcludingPve", "valPve", "valPveResources", "valBounty"] },
	{ id: "population", title: "Population", keys: ["rankPop", "valPop"] },
	{ id: "production", title: "Production", keys: ["rankProd", "valProd", "rankProdSoFar", "valProdSoFar"] },
	{ id: "culture", title: "Culture", keys: ["rankCp", "cpProd", "rankCpSoFar", "valCpSoFar"] },
	{ id: "military", title: "Military", keys: ["pointsOff", "pointsDef"] },
];

/** Picker labels inside a section; the full dataset label stays the storage key and tooltip. */
const METRIC_SHORT_LABELS = {
	rankPvp: "Attack rank", rankDefTop: "Defense rank", rankRob: "Robbers rank", rankPve: "PvE rank",
	valRob: "Raided", valRobExcludingPve: "Raided excl. PvE", valPve: "Animals killed", valPveResources: "Animal resources", valBounty: "Bounty",
	valRaidHourly: "Avg/h with animals", valRaidHourlyExcludingPve: "Avg/h without animals",
	rankPop: "Rank", valPop: "Population",
	rankProd: "Rank", valProd: "Per hour", rankProdSoFar: "Total rank", valProdSoFar: "Total",
	rankCp: "Rank", cpProd: "Per day", rankCpSoFar: "Total rank", valCpSoFar: "Total",
	pointsOff: "Offense", pointsDef: "Defense",
};

/** Weekly counters that reset; compared via their unwrapped `*Total` keys. */
const RESET_VALUE_KEYS = ["valRob", "valPve", "valPveResources", "valRobExcludingPve", "valBounty"];

/** Value keys where the daily peak is the maximum. */
const VALUE_KEYS = [
	"pointsOff",
	"pointsDef",
	"valRob",
	"valPve",
	"valPveResources",
	"valRobExcludingPve",
	"valPop",
	"valProd",
	"cpProd",
	"valProdSoFar",
	"valCpSoFar",
	"valBounty",
];

/** Rank keys where the daily peak is the minimum (rank 1 > rank 10). */
const RANK_KEYS = [
	"rankPvp",
	"rankDefTop",
	"rankRob",
	"rankPve",
	"rankPop",
	"rankProd",
	"rankCp",
	"rankProdSoFar",
	"rankCpSoFar",
];

/**
 * Copy stored history, sanitise stale fields, add derived resource fields and
 * unwrap reset counters into `*Total` keys. The stored objects are not mutated.
 *
 * @param {Array<Object>} hist - Stored history points.
 * @returns {Array<Object>} New sorted points.
 */
function prepareHistory(hist) {
	const points = (hist || []).map((item) => {
		const point = { ...item };
		if (point.valProd != null || point.pointsProd != null) point.valProd = grossProdOf(point);
		if (point.valRob > 100_000_000_000) point.valRob = null;
		if (point.valRob == null && point.valRes != null) point.valRob = point.valRes;
		if (point.valPve != null) point.valPveResources = point.valPve * 160;
		if (point.valRob != null && point.valPveResources != null) {
			point.valRobExcludingPve = point.valRob - point.valPveResources;
		}
		return point;
	});

	// Unwrap counters before aggregation/interpolation so reset drops never
	// become negative rates or comparison deltas. Keep absolute charts raw.
	points.sort((a, b) => a.timestamp - b.timestamp);
	for (const key of ["valRob", "valPve", "valBounty"]) {
		const totals = counterTotals(points, (point) => point[key]);
		points.forEach((point, i) => { point[`${key}Total`] = totals[i]; });
	}
	for (const point of points) {
		point.valPveResourcesTotal = point.valPveTotal == null ? null : point.valPveTotal * 160;
		point.valRobExcludingPveTotal = point.valRobTotal == null || point.valPveResourcesTotal == null
			? null : point.valRobTotal - point.valPveResourcesTotal;
	}
	return points;
}

/**
 * Collapse raw history into one data-point per day, keeping the best
 * rank (min) and the highest value (max) for each field.
 *
 * @param {Array<Object>} rawData
 * @returns {Array<Object>}
 */
function aggregateDaily(rawData) {
	const groups = {};

	for (const pt of rawData) {
		const d = new Date(pt.timestamp);
		const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

		if (!groups[dateKey]) {
			groups[dateKey] = JSON.parse(JSON.stringify(pt));
			const noon = new Date(pt.timestamp);
			noon.setHours(12, 0, 0, 0);
			groups[dateKey].timestamp = noon.getTime();
			continue;
		}

		const g = groups[dateKey];
		for (const k of VALUE_KEYS) {
			if (pt[k] != null) g[k] = g[k] != null ? Math.max(g[k], pt[k]) : pt[k];
		}
		// Carry the final cumulative observation through a daily bucket.
		for (const key of RESET_VALUE_KEYS) {
			const totalKey = `${key}Total`;
			if (pt[totalKey] != null) g[totalKey] = pt[totalKey];
		}
		for (const k of RANK_KEYS) {
			if (pt[k] != null) g[k] = g[k] != null ? Math.min(g[k], pt[k]) : pt[k];
		}
	}

	return Object.values(groups).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fill large time-gaps between consecutive data points with linearly
 * interpolated "ghost" entries so the graph line stays smooth.
 *
 * @param {Array<Object>} rawData
 * @returns {Array<Object>}
 */
function interpolateGaps(rawData) {
	if (rawData.length === 0) return [];
	const STEP_MS = 30 * 60 * 1000; // 30 min
	const result = [rawData[0]];

	for (let i = 1; i < rawData.length; i++) {
		const prev = rawData[i - 1];
		const curr = rawData[i];
		const gap = curr.timestamp - prev.timestamp;

		if (gap > STEP_MS * 1.5 && gap <= 7 * 24 * 60 * 60 * 1000) {
			const steps = Math.floor(gap / STEP_MS);
			for (let s = 1; s < steps && result.length < MAX_HISTORY_LEN; s++) {
				const fakeTs = prev.timestamp + s * STEP_MS;
				const ratio = (fakeTs - prev.timestamp) / gap;
				const fakePoint = { timestamp: fakeTs };

				for (const key of Object.keys(curr)) {
					if (key === "timestamp" || typeof curr[key] !== "number") continue;
					fakePoint[key] =
						prev[key] != null && curr[key] != null
							? Math.round(prev[key] + (curr[key] - prev[key]) * ratio)
							: null;
				}
				result.push(fakePoint);
			}
		}
		result.push(curr);
	}
	return result;
}

/**
 * Convert points to per-hour change. Reset counters use their `*Total` keys.
 *
 * @param {Array<Object>} data - Prepared (and aggregated/interpolated) points.
 * @returns {Array<Object>} Points holding hourly deltas per dataset key.
 */
function toVelocity(data) {
	const previous = new Map();
	return data.map((point) => {
		const delta = { timestamp: point.timestamp };
		for (const { key } of DATASETS_CONFIG) {
			const valueKey = RESET_VALUE_KEYS.includes(key) ? `${key}Total` : key;
			const value = point[valueKey];
			const prev = previous.get(key);
			const hours = prev ? (point.timestamp - prev.timestamp) / 3_600_000 : 0;
			delta[key] = Number.isFinite(value) && prev && hours > 0
				? Math.round(((value - prev.value) / hours) * 10) / 10 : null;
			if (Number.isFinite(value)) previous.set(key, { value, timestamp: point.timestamp });
		}
		return delta;
	});
}

/** Trailing window for raid counters in rate mode. */
const ROLLING_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * Linear value of a cumulative series at `time`, clamped to the last sample.
 *
 * @param {Array<{timestamp: number, value: number}>} samples - Sorted samples.
 * @param {number} time
 * @returns {number|null} Null before the first sample.
 */
function cumulativeAt(samples, time) {
	if (!samples.length || time < samples[0].timestamp) return null;
	const last = samples[samples.length - 1];
	if (time >= last.timestamp) return last.value;
	let lo = 0;
	let hi = samples.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (samples[mid].timestamp <= time) lo = mid;
		else hi = mid;
	}
	const a = samples[lo];
	const b = samples[hi];
	const span = b.timestamp - a.timestamp;
	return span > 0 ? a.value + (b.value - a.value) * ((time - a.timestamp) / span) : b.value;
}

/**
 * Gain of a cumulative series in the window ending at each timestamp.
 *
 * @param {Array<{timestamp: number, value: number}>} samples - Sorted samples.
 * @param {Array<number>} timestamps - Evaluation times.
 * @param {number} [windowMs]
 * @returns {Array<number|null>} Null where the window starts before the first sample.
 */
function rollingWindowGain(samples, timestamps, windowMs = ROLLING_WINDOW_MS) {
	return timestamps.map((time) => {
		const end = cumulativeAt(samples, time);
		const start = cumulativeAt(samples, time - windowMs);
		return end == null || start == null ? null : Math.round(Math.max(0, end - start));
	});
}

/**
 * Replace reset-counter rates with the trailing 3h gain from the raw history.
 *
 * @param {Array<Object>} velocity - Output of toVelocity.
 * @param {Array<Object>} prepared - Output of prepareHistory (raw, sorted).
 * @returns {Array<Object>} New points.
 */
function withRolling3h(velocity, prepared) {
	const timestamps = velocity.map((point) => point.timestamp);
	const gains = {};
	for (const key of RESET_VALUE_KEYS) {
		const samples = prepared
			.filter((point) => Number.isFinite(point[`${key}Total`]))
			.map((point) => ({ timestamp: point.timestamp, value: point[`${key}Total`] }));
		gains[key] = rollingWindowGain(samples, timestamps);
	}
	return velocity.map((point, i) => {
		const next = { ...point };
		for (const key of RESET_VALUE_KEYS) next[key] = gains[key][i];
		return next;
	});
}

/** Hourly raid averages from raw, reset-safe totals, in either graph mode. */
function withRaidHourly(data, prepared) {
	const timestamps = data.map((point) => point.timestamp);
	const rates = {};
	for (const [key, source] of [["valRaidHourly", "valRobTotal"], ["valRaidHourlyExcludingPve", "valRobExcludingPveTotal"]]) {
		const samples = prepared.filter((point) => Number.isFinite(point[source]))
			.map((point) => ({ timestamp: point.timestamp, value: point[source] }));
		rates[key] = rollingWindowGain(samples, timestamps).map((gain) => gain == null ? null : Math.round(gain / 3));
	}
	return data.map((point, i) => ({ ...point, valRaidHourly: rates.valRaidHourly[i], valRaidHourlyExcludingPve: rates.valRaidHourlyExcludingPve[i] }));
}

/**
 * Values at the edges of a drag selection: the first non-null value from
 * `i1` forward and the last non-null value from `i2` back.
 *
 * @param {Array<number|null>} values
 * @param {number} i1 - Lower index.
 * @param {number} i2 - Upper index.
 * @returns {{start: number, end: number}|null} Null with fewer than two values.
 */
function compareEdgeValues(values, i1, i2) {
	let lo = i1;
	while (lo <= i2 && !Number.isFinite(values[lo])) lo++;
	let hi = i2;
	while (hi >= i1 && !Number.isFinite(values[hi])) hi--;
	return lo < hi ? { start: values[lo], end: values[hi] } : null;
}

/** Neighbours on each side averaged when smoothing per-hour lines. */
const RATE_SMOOTH_RADIUS = 2;

/**
 * Centred moving average over the non-null neighbours within `radius`.
 * Null points stay null so gaps are kept.
 *
 * @param {(number|null)[]} values
 * @param {number} radius
 * @returns {(number|null)[]}
 */
function smoothSeries(values, radius) {
	return values.map((v, i) => {
		if (v == null) return null;
		let sum = 0;
		let n = 0;
		for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
			if (values[j] != null) {
				sum += values[j];
				n++;
			}
		}
		return Math.round((sum / n) * 10) / 10;
	});
}

/**
 * Index window covering the last `hours` of `timestamps` (at least 2 points).
 *
 * @param {number[]} timestamps - Ascending.
 * @param {number} hours
 * @returns {{min:number, max:number}|null}
 */
function rangeWindow(timestamps, hours) {
	const total = timestamps.length;
	if (total < 2) return null;
	const cutoff = timestamps[total - 1] - hours * 3_600_000;
	let min = timestamps.findIndex((t) => t >= cutoff);
	if (min < 0) min = 0;
	return { min: Math.min(min, total - 2), max: total - 1 };
}

/* ── chart configuration ─────────────────────────────────────────────── */

/** Compact axis tick: 1.5k / 2.3M / 1.1B. */
function hvCompactTick(v) {
	const val = Math.abs(Number(v));
	const sign = Number(v) < 0 ? "-" : "";
	if (val >= 1e9) return sign + parseFloat((val / 1e9).toFixed(2)) + "B";
	if (val >= 1e6) return sign + parseFloat((val / 1e6).toFixed(2)) + "M";
	if (val >= 1e3) return sign + parseFloat((val / 1e3).toFixed(0)) + "k";
	return sign + val;
}

/** Drag-to-compare plugin: selection band plus compare box updates. */
function hvDragComparePlugin(timestamps, tokens) {
	let dragStartIdx = null;
	let dragEndIdx = null;
	let dragging = false;
	return {
		id: "dragCompare",
		beforeEvent(chart, args) {
			const { type, x, y } = args.event;
			if (!["mousedown", "mousemove", "mouseup", "mouseout"].includes(type)) return;
			const { top, bottom, left, right } = chart.chartArea;
			if (type === "mousedown" && (y < top || y > bottom)) return;
			const boundedX = Math.max(left, Math.min(right, x));
			let idx = Math.round(chart.scales.x.getValueForPixel(boundedX));
			idx = Math.max(0, Math.min(idx, chart.data.labels.length - 1));

			if (type === "mousedown") {
				dragging = true;
				dragStartIdx = dragEndIdx = idx;
				hvUpdateCompareBox(chart, dragStartIdx, dragEndIdx, timestamps);
				args.changed = true;
			} else if (type === "mousemove" && dragging && dragEndIdx !== idx) {
				dragEndIdx = idx;
				hvUpdateCompareBox(chart, dragStartIdx, dragEndIdx, timestamps);
				args.changed = true;
			} else if ((type === "mouseup" || type === "mouseout") && dragging) {
				dragging = false;
				if (dragStartIdx === dragEndIdx) {
					dragStartIdx = dragEndIdx = null;
					hvUpdateCompareBox(chart, null, null, timestamps);
				}
				args.changed = true;
			}
		},
		beforeDraw(chart) {
			if (dragStartIdx == null || dragEndIdx == null || dragStartIdx === dragEndIdx) return;
			const ctx = chart.ctx;
			const xAxis = chart.scales.x;
			const l = Math.min(xAxis.getPixelForValue(dragStartIdx), xAxis.getPixelForValue(dragEndIdx));
			const r = Math.max(xAxis.getPixelForValue(dragStartIdx), xAxis.getPixelForValue(dragEndIdx));
			const { top, bottom } = chart.chartArea;
			ctx.save();
			ctx.fillStyle = tokens.selectFill;
			ctx.fillRect(l, top, r - l, bottom - top);
			ctx.beginPath();
			ctx.strokeStyle = tokens.selectLine;
			ctx.lineWidth = 1;
			ctx.moveTo(l, top);
			ctx.lineTo(l, bottom);
			ctx.moveTo(r, top);
			ctx.lineTo(r, bottom);
			ctx.stroke();
			ctx.restore();
		},
	};
}

/** Tooltip label: value plus change from the previous non-null point. */
function hvTooltipLabel(context) {
	let lbl = context.dataset.label ? `${context.dataset.label}: ` : "";
	if (context.parsed.y !== null) lbl += context.parsed.y.toLocaleString();
	if (context.dataset.rolling3h) lbl += " / 3h";
	if (!popupState.isVelocityMode && context.dataIndex > 0) {
		const values = context.dataset.comparisonData || context.dataset.data;
		const curr = values[context.dataIndex];
		let prev = null;
		for (let i = context.dataIndex - 1; i >= 0; i--) {
			if (values[i] != null) {
				prev = values[i];
				break;
			}
		}
		if (prev != null && curr != null) {
			const d = curr - prev;
			if (d !== 0) lbl += ` (${d > 0 ? "+" : ""}${d.toLocaleString()})`;
		}
	}
	return lbl;
}

/** Point labels: "dd/mm" for daily, "dd/mm hh:mm" otherwise. */
function hvPointLabel(timestamp, filter) {
	const d = new Date(timestamp);
	const dd = String(d.getDate()).padStart(2, "0");
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	if (filter === "daily") return `${dd}/${mm}`;
	return `${dd}/${mm} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Chart.js options for the history chart. */
function hvChartOptions(tokens, savedZoom) {
	const velocity = popupState.isVelocityMode;
	const font = { family: tokens.fontNum, size: 11 };
	const axisTitle = (text) => ({ display: true, text, color: tokens.muted, font });
	return {
		events: ["mousemove", "mouseout", "click", "touchstart", "touchmove", "mousedown", "mouseup"],
		responsive: true,
		maintainAspectRatio: false,
		animation: reducedMotion() ? false : { duration: 220 },
		interaction: { mode: "index", intersect: false },
		plugins: {
			legend: { display: false },
			tooltip: {
				backgroundColor: tokens.tooltipBg,
				titleColor: tokens.text,
				bodyColor: tokens.text,
				borderColor: tokens.grid,
				borderWidth: 1,
				padding: 10,
				cornerRadius: 8,
				boxPadding: 4,
				usePointStyle: true,
				titleFont: { ...font, weight: "600" },
				bodyFont: font,
				callbacks: { label: hvTooltipLabel },
			},
		},
		scales: {
			y: {
				reverse: !velocity,
				position: "left",
				grid: { color: tokens.grid },
				border: { display: false },
				ticks: { color: tokens.tick, font },
				title: axisTitle(velocity ? "Rank Δ / h" : "Rank"),
			},
			y1: {
				reverse: false,
				position: "right",
				grid: { drawOnChartArea: false },
				border: { display: false },
				ticks: { color: tokens.tick, font, callback: hvCompactTick },
				title: axisTitle(velocity ? "Value Δ / h · raids / 3h" : "Value"),
			},
			x: {
				min: savedZoom.min,
				max: savedZoom.max,
				grid: { color: tokens.grid },
				border: { display: false },
				ticks: { maxTicksLimit: 8, maxRotation: 0, minRotation: 0, autoSkipPadding: 20, color: tokens.tick, font },
			},
		},
		elements: {
			point: { radius: 0, hoverRadius: 4, hoverBorderWidth: 2 },
			line: { borderWidth: 1.75, tension: 0.4, cubicInterpolationMode: "monotone" },
		},
	};
}
