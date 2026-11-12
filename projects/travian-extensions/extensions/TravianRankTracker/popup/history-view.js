/**
 * Rank Tracker 5.0 — History view: chart, metric picker, groups, compare box,
 * wheel zoom and the toolbar controls.
 */

/** Incremented per loadGraph call; stale async loads bail out. */
let graphLoadVersion = 0;

/** Saved metric groups `{name: [datasetLabels]}` for the current chart. */
let hvGroups = {};

/** Whether initHistoryControls has wired its handlers. */
let hvControlsReady = false;

/* ── helpers ───────────────────────────────────────────────────────────── */

/** Read chart colours and fonts from the CSS tokens on :root. */
function hvTokens() {
	const css = getComputedStyle(document.documentElement);
	const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
	return {
		grid: read("--chart-grid", "rgba(255,255,255,0.06)"),
		tick: read("--chart-tick", "#8b9097"),
		selectFill: read("--chart-select-fill", "rgba(224,179,84,0.12)"),
		selectLine: read("--chart-select-line", "rgba(224,179,84,0.8)"),
		tooltipBg: read("--chart-tooltip-bg", "rgba(16,18,20,0.96)"),
		fontNum: read("--font-num", "Bahnschrift, 'Segoe UI', sans-serif"),
		text: read("--text", "#e8e6e1"),
		muted: read("--muted", "#8b9097"),
	};
}

/** History storage key for the active server, or null. */
function hvStorageKey() {
	return popupState.activeServerOrigin ? `history_${popupState.activeServerOrigin}` : null;
}

/** Set aria-pressed on every button of a segmented group. */
function hvSetPressed(groupId, match) {
	document.querySelectorAll(`#${groupId} .seg-btn`).forEach((btn) => {
		btn.setAttribute("aria-pressed", String(match(btn)));
	});
}

/** Persist dataset visibility as `graphPrefs` (true = hidden). */
async function hvPersistPrefs(chart) {
	const r = await api.storage.local.get(["graphPrefs"]);
	const newPrefs = { ...(r.graphPrefs || {}) };
	chart.data.datasets.forEach((d, i) => {
		newPrefs[d.label] = !chart.isDatasetVisible(i);
	});
	await api.storage.local.set({ graphPrefs: newPrefs });
}

/** Close the compare box. */
function hvCloseCompare() {
	const box = document.getElementById("compare-box");
	if (box) box.dataset.open = "false";
}

/* ── compare box ───────────────────────────────────────────────────────── */

/**
 * Render deltas and the average plotted value over the selected time range.
 */
function hvUpdateCompareBox(chart, startIdx, endIdx, timestamps) {
	const box = document.getElementById("compare-box");
	if (!box) return;
	if (startIdx === null || endIdx === null || startIdx === endIdx) {
		box.dataset.open = "false";
		return;
	}

	const i1 = Math.min(startIdx, endIdx);
	const i2 = Math.max(startIdx, endIdx);
	const timeDiffHours = Number.isFinite(timestamps?.[i1]) && Number.isFinite(timestamps?.[i2])
		? Math.abs(timestamps[i2] - timestamps[i1]) / 3_600_000 : 0;
	const velocity = popupState.isVelocityMode;
	const labels = chart.data.labels;

	const head = h("div", "cmp-head");
	head.append(h("span", "cmp-range", `${labels[i1]} → ${labels[i2]}`));
	if (timeDiffHours > 0 && !velocity) {
		head.append(h("span", "cmp-span", `${Math.round(timeDiffHours * 10) / 10}h`));
	}

	const list = h("ul", "cmp-list");
	chart.data.datasets.forEach((ds, dsIndex) => {
		if (!chart.isDatasetVisible(dsIndex)) return;
		const edges = compareEdgeValues(ds.comparisonData || ds.data, i1, i2);
		if (!edges) return;
		const diff = edges.end - edges.start;

		const isRank = ds.yAxisID === "y";
		const good = diff === 0 ? null : isRank ? diff < 0 : diff > 0;
		const sign = diff > 0 ? "+" : "";
		const item = h("li", "cmp-item");
		const swatch = h("span", "swatch");
		swatch.style.setProperty("--c", ds.borderColor);
		const cls = good == null ? "d--flat" : good ? "d--up" : "d--down";
		const val = h("span", `cmp-val ${cls}`, `${sign}${fmtCompact(diff)}`);
		val.title = `${sign}${fmtNum(diff)}`;
		let rate = "";
		if (ds.perHour) {
			rate = "/h";
		} else if (!velocity && timeDiffHours > 0) {
			const hourly = Math.round((diff / timeDiffHours) * 10) / 10;
			rate = `${sign}${fmtCompact(hourly)}/h`;
		} else if (velocity) {
			rate = ds.rolling3h ? "/3h" : "/h";
		}
		item.append(swatch, h("span", "cmp-label", ds.label), val, h("span", "cmp-rate", rate));
		const average = compareRangeAverage(ds.data, timestamps, i1, i2);
		if (average != null) {
			const unit = ds.perHour || (velocity && !ds.rolling3h) ? " /h" : ds.rolling3h ? " /3h" : "";
			const avg = h("span", "cmp-average", `Avg ${fmtCompact(average)}${unit}`);
			avg.title = `Time-weighted average: ${average.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit}`;
			item.append(avg);
		}
		list.append(item);
	});

	box.replaceChildren(head, list.children.length ? list : h("p", "cmp-empty", "No data in range for visible metrics"));
	box.dataset.open = "true";
}

/* ── picker & groups ───────────────────────────────────────────────────── */

/** Reflect dataset visibility into the picker chips. */
function hvSyncPicker(chart) {
	document.querySelectorAll("#metric-picker .chip-metric").forEach((btn) => {
		const index = Number(btn.dataset.index);
		btn.setAttribute("aria-pressed", String(chart.isDatasetVisible(index)));
	});
}

/** Render METRIC_GROUPS into #metric-picker as toggle chips. */
function hvRenderPicker(chart) {
	const picker = document.getElementById("metric-picker");
	if (!picker) return;
	const sections = METRIC_GROUPS.map((group) => {
		const section = h("div", "picker-group");
		const chips = h("div", "picker-chips");
		for (const key of group.keys) {
			const index = DATASETS_CONFIG.findIndex((cfg) => cfg.key === key);
			if (index < 0) continue;
			const cfg = DATASETS_CONFIG[index];
			const btn = h("button", "chip-metric");
			btn.type = "button";
			btn.dataset.index = String(index);
			if (cfg.dash) btn.dataset.dash = "1";
			btn.style.setProperty("--c", cfg.color);
			btn.setAttribute("aria-pressed", String(chart.isDatasetVisible(index)));
			btn.title = cfg.label;
			btn.append(h("span", "swatch"), h("span", "chip-label", METRIC_SHORT_LABELS[cfg.key] || cfg.label));
			btn.addEventListener("click", async () => {
				if (chart !== window.myChart) return;
				chart.setDatasetVisibility(index, !chart.isDatasetVisible(index));
				chart.update("none");
				btn.setAttribute("aria-pressed", String(chart.isDatasetVisible(index)));
				hvCloseCompare();
				await hvPersistPrefs(chart);
			});
			chips.append(btn);
		}
		section.append(h("span", "picker-title", group.title), chips);
		return section;
	});
	picker.replaceChildren(...sections);
}

/** Render saved groups into #group-list. */
function hvRenderGroups(chart) {
	const list = document.getElementById("group-list");
	if (!list) return;
	const chips = Object.entries(hvGroups).map(([groupName, groupLabels]) => {
		const chip = h("span", "group-chip");
		const name = h("button", "group-chip-name", groupName);
		name.type = "button";
		name.addEventListener("click", async () => {
			if (chart !== window.myChart) return;
			// If ANY in group are hidden → show all; else → hide all
			const anyHidden = chart.data.datasets.some(
				(ds, i) => groupLabels.includes(ds.label) && !chart.isDatasetVisible(i),
			);
			chart.data.datasets.forEach((ds, i) => {
				if (groupLabels.includes(ds.label)) chart.setDatasetVisibility(i, anyHidden);
			});
			chart.update("none");
			hvSyncPicker(chart);
			hvCloseCompare();
			await hvPersistPrefs(chart);
		});
		const del = h("button", "group-chip-x", "×");
		del.type = "button";
		del.setAttribute("aria-label", `Delete group ${groupName}`);
		del.addEventListener("click", async () => {
			const next = { ...hvGroups };
			delete next[groupName];
			hvGroups = next;
			await api.storage.local.set({ customGroups: next });
			if (chart === window.myChart) hvRenderGroups(chart);
		});
		chip.append(name, del);
		return chip;
	});
	list.replaceChildren(...chips);
}

/* ── zoom / pan ────────────────────────────────────────────────────────── */

/** Wheel zoom (mouse-centred) and Shift+wheel pan on the chart canvas. */
function hvInitChartZoom(canvas) {
	let updating = false;
	canvas.addEventListener("wheel", (e) => {
		e.preventDefault();
		const chart = window.myChart;
		if (!chart || updating) return;
		updating = true;
		requestAnimationFrame(() => {
			const total = chart.data.labels.length;
			let min = chart.options.scales.x.min ?? 0;
			let max = chart.options.scales.x.max ?? total - 1;
			const range = max - min;

			if (e.shiftKey) {
				let pan = Math.ceil(range * 0.05) * Math.sign(e.deltaY) || Math.sign(e.deltaY);
				if (min + pan < 0) pan = -min;
				if (max + pan >= total) pan = total - 1 - max;
				min += pan;
				max += pan;
			} else {
				const appZoom = parseFloat(document.body.style.zoom) || 1.0;
				const rect = canvas.getBoundingClientRect();
				const offsetX = (e.clientX - rect.left) / appZoom;
				const { left, right } = chart.chartArea;
				const ratio = Math.max(0, Math.min(1,
					(Math.max(left, Math.min(right, offsetX)) - left) / (right - left))) || 0.5;
				const amount = Math.max(2, Math.ceil(range * 0.15));

				if (e.deltaY < 0) {
					if (max - min <= 4) {
						updating = false;
						return;
					}
					min += amount * ratio;
					max -= amount * (1 - ratio);
				} else {
					min -= amount * ratio;
					max += amount * (1 - ratio);
				}
				min = Math.max(0, min);
				max = Math.min(total - 1, max);
			}

			chart.options.scales.x.min = min;
			chart.options.scales.x.max = max;
			api.storage.local.set({ graphZoom: { min, max } });
			api.storage.local.remove("graphRange");
			hvSetPressed("seg-range", () => false);
			chart.update("none");
			const resetBtn = document.getElementById("btn-zoom-reset");
			if (resetBtn) resetBtn.hidden = min <= 0 && max >= total - 1;
			updating = false;
		});
	}, { passive: false });
}

/* ── chart ─────────────────────────────────────────────────────────────── */

/** Show or hide the empty state and the canvas. */
function hvShowEmpty(empty) {
	const canvas = document.getElementById("rankChart");
	const msg = document.getElementById("chart-empty");
	if (canvas) canvas.hidden = empty;
	if (msg) msg.hidden = !empty;
}

/**
 * Load history from storage, process it, and render the Chart.js graph.
 *
 * @param {"all"|"daily"} filter - Raw points or daily peaks.
 * @param {string} storageKey    - `history_<origin>`.
 */
async function loadGraph(filter, storageKey) {
	if (!storageKey) return;
	const loadVersion = ++graphLoadVersion;

	const res = await api.storage.local.get([storageKey, "graphPrefs", "graphZoom", "graphRange"]);
	if (loadVersion !== graphLoadVersion) return;
	const hist = res[storageKey] || [];
	const prefs = res.graphPrefs || {};
	const savedZoom = { ...(res.graphZoom || {}) };
	const isHidden = (label, defaultHidden) => (prefs[label] !== undefined ? prefs[label] : defaultHidden);

	hvCloseCompare();
	const resetZoomBtn = document.getElementById("btn-zoom-reset");
	if (resetZoomBtn) resetZoomBtn.hidden = savedZoom.min === undefined && savedZoom.max === undefined;

	if (!hist.length) {
		window.myChart?.destroy();
		window.myChart = null;
		document.getElementById("metric-picker")?.replaceChildren();
		document.getElementById("group-list")?.replaceChildren();
		hvShowEmpty(true);
		return;
	}
	hvShowEmpty(false);

	const prepared = prepareHistory(hist);
	let data = filter === "daily" ? aggregateDaily(prepared) : interpolateGaps(prepared);
	if (!(savedZoom.min >= 0 && savedZoom.max > savedZoom.min && savedZoom.max < data.length)) {
		delete savedZoom.min;
		delete savedZoom.max;
		if (resetZoomBtn) resetZoomBtn.hidden = true;
	}
	if (popupState.isVelocityMode) data = withRolling3h(toVelocity(data), prepared);
	data = withRaidHourly(data, prepared);

	// A quick range (3h … 1w) always anchors to the newest point.
	const rangeHours = Number(res.graphRange) || 0;
	hvSetPressed("seg-range", (b) => Number(b.dataset.h) === rangeHours);
	const win = rangeHours ? rangeWindow(data.map((x) => x.timestamp), rangeHours) : null;
	if (win) {
		savedZoom.min = win.min;
		savedZoom.max = win.max;
		if (resetZoomBtn) resetZoomBtn.hidden = true;
	}

	// Refresh canvas (prevents stale wheel listeners)
	const oldCanvas = document.getElementById("rankChart");
	if (!oldCanvas) return;
	const canvas = oldCanvas.cloneNode(true);
	oldCanvas.parentNode.replaceChild(canvas, oldCanvas);

	window.myChart?.destroy();
	const tokens = hvTokens();
	Chart.defaults.color = tokens.tick;
	Chart.defaults.borderColor = tokens.grid;
	Chart.defaults.font.family = tokens.fontNum;

	const timestamps = data.map((x) => x.timestamp);
	const seriesFor = (cfg) => {
		const raw = data.map((x) => (cfg.ceil ? (x[cfg.key] != null ? Math.ceil(x[cfg.key]) : null) : x[cfg.key] ?? null));
		return popupState.isVelocityMode ? smoothSeries(raw, RATE_SMOOTH_RADIUS) : raw;
	};
	const datasets = DATASETS_CONFIG.map((cfg) => {
		const rolling3h = popupState.isVelocityMode && RESET_VALUE_KEYS.includes(cfg.key);
		return {
		label: cfg.label,
		perHour: !!cfg.perHour,
		rolling3h,
		...(rolling3h ? { cubicInterpolationMode: "monotone" } : {}),
		data: seriesFor(cfg),
		comparisonData: !popupState.isVelocityMode && RESET_VALUE_KEYS.includes(cfg.key)
			? data.map((point) => point[`${cfg.key}Total`] ?? null) : null,
		borderColor: cfg.color,
		backgroundColor: cfg.color,
		pointBackgroundColor: cfg.color,
		pointBorderColor: tokens.tooltipBg,
		borderDash: cfg.dash || [],
		yAxisID: cfg.axis,
		hidden: isHidden(cfg.label, cfg.defHidden),
		spanGaps: true,
		};
	});

	const chart = new Chart(canvas.getContext("2d"), {
		type: "line",
		data: { labels: data.map((x) => hvPointLabel(x.timestamp, filter)), datasets },
		options: hvChartOptions(tokens, savedZoom),
		plugins: [hvDragComparePlugin(timestamps, tokens)],
	});
	chart.$hvTimestamps = timestamps;
	window.myChart = chart;

	hvInitChartZoom(canvas);
	hvRenderPicker(chart);

	const groupsRes = await api.storage.local.get(["customGroups"]);
	if (chart !== window.myChart) return;
	hvGroups = groupsRes.customGroups || {};
	hvRenderGroups(chart);
}

/* ── controls ──────────────────────────────────────────────────────────── */

/** Reload the graph for the active server with the stored filter. */
async function hvReload() {
	const key = hvStorageKey();
	if (!key) return;
	const { graphFilter } = await api.storage.local.get(["graphFilter"]);
	loadGraph(graphFilter || "all", key);
}

/** Close the group form. */
function hvCloseGroupForm() {
	const form = document.getElementById("group-form");
	if (form) form.hidden = true;
}

/**
 * Wire the History toolbar: data filter, scale mode, zoom reset, clear,
 * and saved groups. Safe to call more than once.
 */
function initHistoryControls() {
	if (hvControlsReady) return;
	hvControlsReady = true;

	document.querySelectorAll("#seg-filter .seg-btn").forEach((btn) => {
		btn.addEventListener("click", async () => {
			const filter = btn.dataset.f;
			hvSetPressed("seg-filter", (b) => b.dataset.f === filter);
			await api.storage.local.remove("graphZoom");
			await api.storage.local.set({ graphFilter: filter });
			const key = hvStorageKey();
			if (key) loadGraph(filter, key);
		});
	});

	document.querySelectorAll("#seg-mode .seg-btn").forEach((btn) => {
		btn.addEventListener("click", async () => {
			const rate = btn.dataset.mode === "rate";
			if (rate === popupState.isVelocityMode) return;
			popupState.isVelocityMode = rate;
			hvSetPressed("seg-mode", (b) => (b.dataset.mode === "rate") === rate);
			await api.storage.local.set({ velocityMode: rate });
			await hvReload();
		});
	});

	document.getElementById("btn-zoom-reset")?.addEventListener("click", async (e) => {
		const chart = window.myChart;
		if (!chart) return;
		chart.options.scales.x.min = undefined;
		chart.options.scales.x.max = undefined;
		chart.update();
		e.currentTarget.hidden = true;
		hvSetPressed("seg-range", () => false);
		await api.storage.local.remove(["graphZoom", "graphRange"]);
	});

	document.querySelectorAll("#seg-range .seg-btn").forEach((btn) => {
		btn.addEventListener("click", async () => {
			// Clicking the active range again shows everything.
			const active = btn.getAttribute("aria-pressed") === "true";
			const hours = Number(btn.dataset.h);
			const chart = window.myChart;
			const win = chart && !active ? rangeWindow(chart.$hvTimestamps || [], hours) : null;
			hvSetPressed("seg-range", (b) => !active && b === btn);
			if (active) await api.storage.local.remove(["graphRange", "graphZoom"]);
			else {
				await api.storage.local.set({ graphRange: hours });
				await api.storage.local.remove("graphZoom");
			}
			const resetBtn = document.getElementById("btn-zoom-reset");
			if (resetBtn) resetBtn.hidden = true;
			if (!chart) return;
			chart.options.scales.x.min = win?.min;
			chart.options.scales.x.max = win?.max;
			chart.update();
			hvCloseCompare();
		});
	});

	document.getElementById("btn-group-none")?.addEventListener("click", async () => {
		const chart = window.myChart;
		if (!chart) return;
		const newPrefs = {};
		chart.data.datasets.forEach((ds, i) => {
			chart.setDatasetVisibility(i, false);
			newPrefs[ds.label] = true;
		});
		chart.update("none");
		hvSyncPicker(chart);
		hvCloseCompare();
		await api.storage.local.set({ graphPrefs: newPrefs });
	});

	const form = document.getElementById("group-form");
	const nameInput = document.getElementById("group-name");
	document.getElementById("btn-group-save")?.addEventListener("click", () => {
		if (!form || !nameInput) return;
		form.hidden = false;
		nameInput.value = "";
		nameInput.focus();
	});
	document.getElementById("btn-group-cancel")?.addEventListener("click", hvCloseGroupForm);
	form?.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			e.preventDefault();
			hvCloseGroupForm();
		}
	});
	form?.addEventListener("submit", async (e) => {
		e.preventDefault();
		const chart = window.myChart;
		const name = nameInput?.value.trim();
		if (!chart || !name) return;
		const visible = chart.data.datasets.filter((_, i) => chart.isDatasetVisible(i)).map((ds) => ds.label);
		if (visible.length === 0) return;
		if (name in hvGroups && !confirm(`Replace group "${name}"?`)) return;
		const next = { ...hvGroups, [name]: visible };
		hvGroups = next;
		await api.storage.local.set({ customGroups: next });
		hvCloseGroupForm();
		if (chart === window.myChart) hvRenderGroups(chart);
	});
}

/**
 * Reflect stored graphFilter / velocityMode into the toolbar and popupState.
 *
 * @returns {Promise<"all"|"daily">} The stored filter.
 */
async function syncHistoryControls() {
	const { graphFilter, velocityMode } = await api.storage.local.get(["graphFilter", "velocityMode"]);
	const filter = graphFilter === "daily" ? "daily" : "all";
	popupState.isVelocityMode = velocityMode === true;
	hvSetPressed("seg-filter", (b) => b.dataset.f === filter);
	hvSetPressed("seg-mode", (b) => (b.dataset.mode === "rate") === popupState.isVelocityMode);
	return filter;
}
