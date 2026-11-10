/** ETA history: how the planned settle time moved across logged forecasts. */
"use strict";
Object.assign(
	TSP,
	(() => {
		const MAX_POINTS = 120;
		const SVG_NS = "http://www.w3.org/2000/svg";
		const WIDTH = 340,
			HEIGHT = 96,
			PAD_X = 4,
			PAD_Y = 8;
		const HOUR = 3600000,
			DAY = 24 * HOUR;
		/** Selectable sample windows, measured back from now. */
		const RANGES = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY, all: Infinity };
		/** Series the chart can plot. CP/d does not depend on the target. */
		const MODES = ["eta", "cpd"];
		const OVERLAYS = ["baseline", "growth"];
		/** A trend needs this many samples spread over at least this long. */
		const TREND_MIN_POINTS = 3,
			TREND_MIN_SPAN = 6 * HOUR;

		const finiteOrNull = (value) => (Number.isFinite(value) ? value : null);

		function downsample(points) {
			if (points.length <= MAX_POINTS) return points;
			const step = (points.length - 1) / (MAX_POINTS - 1);
			return Array.from(
				{ length: MAX_POINTS },
				(_, i) => points[Math.round(i * step)],
			);
		}

		/**
		 * Chart points for one target, oldest first. The range filter runs
		 * before downsampling so short windows keep their full resolution.
		 */
		function historyPoints(log, options = {}) {
			const { target, mode = "eta", range = Infinity, now = Date.now() } =
				options;
			const from = Number.isFinite(range) ? now - range : -Infinity;
			const points = (Array.isArray(log) ? log : [])
				.filter(
					(entry) =>
						Number.isFinite(entry?.t) &&
						entry.t >= from &&
						(mode === "cpd"
							? Number.isFinite(entry.daily)
							: entry.target === target &&
								Number.isFinite(entry.eta?.parties)),
				)
				.map((entry) => ({
					t: entry.t,
					value: mode === "cpd" ? entry.daily : entry.eta.parties,
					baseline: finiteOrNull(entry.eta?.baseline),
					growth: finiteOrNull(entry.eta?.growth),
					cp: finiteOrNull(entry.cp),
					daily: finiteOrNull(entry.daily),
					model: typeof entry.model === "string" ? entry.model : null,
				}))
				.sort((a, b) => a.t - b.t);
			return downsample(points);
		}

		/** [sampledAt, eta] pairs for one target, oldest first, downsampled. */
		const etaSeries = (log, target) =>
			historyPoints(log, { target }).map((p) => [p.t, p.value]);

		/** Least-squares fit of value over time; null when too sparse or short. */
		function trendFit(points) {
			if (points.length < TREND_MIN_POINTS) return null;
			const span = points.at(-1).t - points[0].t;
			if (span < TREND_MIN_SPAN) return null;
			const meanT = points.reduce((s, p) => s + p.t, 0) / points.length;
			const meanV = points.reduce((s, p) => s + p.value, 0) / points.length;
			let num = 0,
				den = 0;
			for (const p of points) {
				num += (p.t - meanT) * (p.value - meanV);
				den += (p.t - meanT) ** 2;
			}
			if (!den) return null;
			const slope = num / den;
			return { slope, at: (t) => meanV + slope * (t - meanT) };
		}

		/** Tukey fence width, in interquartile ranges, before values clip. */
		const FENCE_IQR = 1.5,
			FENCE_MIN_POINTS = 5;
		const quantile = (sorted, q) => {
			const pos = (sorted.length - 1) * q,
				low = Math.floor(pos);
			return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (pos - low);
		};
		/**
		 * Y bounds that ignore outliers, such as the huge ETAs logged while a
		 * new account's production is still tiny. Outliers clip to the edge.
		 */
		function robustBounds(values, minSpan) {
			let min = Math.min(...values),
				max = Math.max(...values);
			if (values.length >= FENCE_MIN_POINTS) {
				const sorted = [...values].sort((a, b) => a - b);
				const q1 = quantile(sorted, 0.25),
					q3 = quantile(sorted, 0.75);
				const iqr = Math.max(q3 - q1, minSpan);
				min = Math.max(min, q1 - FENCE_IQR * iqr);
				max = Math.min(max, q3 + FENCE_IQR * iqr);
			}
			if (max - min < minSpan) {
				min -= minSpan / 2;
				max += minSpan / 2;
			}
			return [min, max];
		}

		/** Index of the point closest in time to `t`. */
		function nearestIndex(points, t) {
			let best = 0;
			for (let i = 1; i < points.length; i++)
				if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
			return best;
		}

		const shortDate = (ms) =>
			new Date(ms).toLocaleString([], {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
		const oneDecimal = (n) => (Math.round(n * 10) / 10).toLocaleString();
		const sign = (n) => (n < 0 ? "−" : "+");

		function formatValue(mode, value) {
			return mode === "cpd" ? `${oneDecimal(value)} CP/d` : shortDate(value);
		}
		/** Signed change; null when too small to show. */
		function formatDelta(mode, delta) {
			if (mode === "cpd")
				return Math.abs(delta) < 0.05
					? null
					: `${sign(delta)}${oneDecimal(Math.abs(delta))} CP/d`;
			return Math.abs(delta) < 60000
				? null
				: `${sign(delta)}${TSP.formatDuration(Math.abs(delta) / 1000)}`;
		}
		function formatTrend(mode, slope) {
			const perDay = slope * DAY;
			return mode === "cpd"
				? `${sign(perDay)}${oneDecimal(Math.abs(perDay))} CP/d per day`
				: `${sign(perDay)}${TSP.formatDuration(Math.abs(perDay) / 1000)}/d`;
		}

		function svg(tag, attributes) {
			const element = document.createElementNS(SVG_NS, tag);
			for (const [name, value] of Object.entries(attributes))
				element.setAttribute(name, value);
			return element;
		}
		const polyline = (className, coords) =>
			svg("polyline", {
				class: className,
				points: coords
					.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
					.join(" "),
			});

		/**
		 * Draw the points into an <svg>. X is when the forecast was made, Y is
		 * the plotted value (later ETA = higher). Returns null under two points.
		 */
		function renderEtaChart(target, points, options = {}) {
			const overlays = options.overlays || [];
			target.replaceChildren();
			target.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
			if (points.length < 2) return null;
			const minT = points[0].t,
				maxT = points.at(-1).t;
			const values = points.map((p) => p.value);
			const plotted = [...values];
			for (const key of overlays)
				for (const p of points) if (p[key] !== null) plotted.push(p[key]);
			const [minV, maxV] = robustBounds(
				plotted,
				options.mode === "cpd" ? 1 : 60000,
			);
			const inside = (v) => v >= minV && v <= maxV;
			const x = (t) =>
				PAD_X + ((t - minT) / (maxT - minT || 1)) * (WIDTH - 2 * PAD_X);
			const y = (v) =>
				HEIGHT -
				PAD_Y -
				((Math.min(maxV, Math.max(minV, v)) - minV) / (maxV - minV)) *
					(HEIGHT - 2 * PAD_Y);
			for (const level of [minV, maxV])
				target.append(
					svg("line", {
						class: "eta-grid",
						x1: 0,
						x2: WIDTH,
						y1: y(level),
						y2: y(level),
					}),
				);
			points.forEach((p, i) => {
				if (i && p.model && points[i - 1].model && p.model !== points[i - 1].model)
					target.append(
						svg("line", {
							class: "eta-marker",
							x1: x(p.t),
							x2: x(p.t),
							y1: 0,
							y2: HEIGHT,
						}),
					);
			});
			for (const key of overlays) {
				const coords = points
					.filter((p) => p[key] !== null)
					.map((p) => [x(p.t), y(p[key])]);
				if (coords.length > 1)
					target.append(polyline(`eta-overlay-line ${key}`, coords));
			}
			const trend = trendFit(points.filter((p) => inside(p.value)));
			if (trend)
				target.append(
					polyline("eta-trendline", [
						[x(minT), y(trend.at(minT))],
						[x(maxT), y(trend.at(maxT))],
					]),
				);
			target.append(
				polyline(
					"eta-line",
					points.map((p) => [x(p.t), y(p.value)]),
				),
			);
			const dots = points.map((p, index) => {
				const last = index === points.length - 1;
				const dot = svg("circle", {
					class: `eta-dot${last ? " last" : ""}${inside(p.value) ? "" : " clipped"}`,
					cx: x(p.t).toFixed(1),
					cy: y(p.value).toFixed(1),
					r: last ? 3 : 2,
				});
				target.append(dot);
				return dot;
			});
			const layer = svg("g", { class: "eta-interaction" });
			target.append(layer);
			return {
				points,
				dots,
				layer,
				x,
				minT,
				maxT,
				trend,
				clippedHigh: plotted.some((v) => v > maxV),
				clippedLow: plotted.some((v) => v < minV),
				first: values.find(inside) ?? values[0],
				latest: values.at(-1),
				min: minV,
				max: maxV,
				firstSample: minT,
				lastSample: maxT,
			};
		}

		/** Pointer position as a 0–1 fraction of the element's width. */
		function pointerFraction(event, element) {
			const rect = element.getBoundingClientRect();
			if (!rect.width) return null;
			return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
		}
		/** The plot's x maps 0–1 onto [PAD_X, WIDTH - PAD_X]. */
		function fractionToTime(chart, fraction) {
			const px = fraction * WIDTH;
			const share = (px - PAD_X) / (WIDTH - 2 * PAD_X);
			return chart.minT + Math.min(1, Math.max(0, share)) * (chart.maxT - chart.minT);
		}

		/**
		 * Interactive chart controller: range, series and overlay chips, hover
		 * tooltip and drag-to-compare. Hover and drag never trigger a redraw.
		 */
		function createEtaHistory(dom, { onSettings } = {}) {
			const state = {
				mode: "eta",
				range: "all",
				overlays: new Set(),
				hover: null,
				selection: null,
				dragging: false,
			};
			let chart = null,
				signature = "",
				log = [],
				target = 0;

			const settings = () => ({
				range: state.range,
				mode: state.mode,
				overlays: [...state.overlays],
			});
			function applySettings(next = {}) {
				if (Object.hasOwn(RANGES, next.range)) state.range = next.range;
				if (MODES.includes(next.mode)) state.mode = next.mode;
				if (Array.isArray(next.overlays))
					state.overlays = new Set(
						next.overlays.filter((key) => OVERLAYS.includes(key)),
					);
			}
			function change(next) {
				applySettings(next);
				state.selection = null;
				signature = "";
				render();
				onSettings?.(settings());
			}

			function syncChips(points) {
				for (const button of dom.etaRanges.querySelectorAll("button"))
					button.setAttribute(
						"aria-pressed",
						String(button.dataset.range === state.range),
					);
				for (const button of dom.etaModes.querySelectorAll("button"))
					button.setAttribute(
						"aria-pressed",
						String(button.dataset.mode === state.mode),
					);
				for (const button of dom.etaOverlays.querySelectorAll("button")) {
					const key = button.dataset.overlay;
					button.hidden =
						state.mode !== "eta" || !points.some((p) => p[key] !== null);
					button.setAttribute("aria-pressed", String(state.overlays.has(key)));
				}
			}

			function summaryChange() {
				dom.etaChange.className = "eta-change";
				dom.etaChange.textContent = "";
				dom.etaChange.removeAttribute("title");
				if (!chart) return;
				const sel = state.selection;
				if (sel && sel.a !== sel.b) {
					const [i, j] = [
						nearestIndex(chart.points, Math.min(sel.a, sel.b)),
						nearestIndex(chart.points, Math.max(sel.a, sel.b)),
					];
					const a = chart.points[i],
						b = chart.points[j];
					const delta = formatDelta(state.mode, b.value - a.value) || "±0";
					dom.etaChange.textContent = `${delta} · ${TSP.formatDuration((b.t - a.t) / 1000)}`;
					dom.etaChange.title = `${shortDate(a.t)} → ${shortDate(b.t)}`;
					dom.etaChange.classList.add("selected");
					return;
				}
				const delta = chart.latest - chart.first;
				const text = formatDelta(state.mode, delta);
				if (!text) return;
				dom.etaChange.textContent = text;
				const better = state.mode === "cpd" ? delta > 0 : delta < 0;
				dom.etaChange.classList.add(better ? "earlier" : "later");
			}

			function tipRow(label, value) {
				const row = document.createElement("div");
				const name = document.createElement("span");
				name.textContent = label;
				const val = document.createElement("b");
				val.textContent = value;
				row.append(name, val);
				return row;
			}
			function showTip(point, fraction) {
				const rows = [tipRow("Sample", shortDate(point.t))];
				if (state.mode === "eta") {
					rows.push(tipRow("Planned", shortDate(point.value)));
					if (point.baseline !== null)
						rows.push(tipRow("Baseline", shortDate(point.baseline)));
					if (point.growth !== null)
						rows.push(tipRow("Growth", shortDate(point.growth)));
				}
				if (point.cp !== null)
					rows.push(tipRow("CP", Math.round(point.cp).toLocaleString()));
				if (point.daily !== null)
					rows.push(tipRow("CP/d", oneDecimal(point.daily)));
				dom.etaTip.replaceChildren(...rows);
				dom.etaTip.style.left = `${(fraction * 100).toFixed(2)}%`;
				dom.etaTip.classList.toggle("flip", fraction > 0.5);
				dom.etaTip.hidden = false;
			}

			function vline(className, t) {
				return svg("line", {
					class: className,
					x1: chart.x(t),
					x2: chart.x(t),
					y1: 0,
					y2: HEIGHT,
				});
			}
			/** Redraw only the hover and selection layer. */
			function drawInteraction() {
				if (!chart) {
					dom.etaTip.hidden = true;
					return;
				}
				chart.layer.replaceChildren();
				for (const dot of chart.dots) dot.classList.remove("active");
				const sel = state.selection;
				if (sel && sel.a !== sel.b) {
					const x1 = chart.x(Math.min(sel.a, sel.b)),
						x2 = chart.x(Math.max(sel.a, sel.b));
					chart.layer.append(
						svg("rect", {
							class: "eta-selection",
							x: x1,
							y: 0,
							width: Math.max(0, x2 - x1),
							height: HEIGHT,
						}),
						vline("eta-selection-edge", sel.a),
						vline("eta-selection-edge", sel.b),
					);
				}
				summaryChange();
				if (state.hover === null) {
					dom.etaTip.hidden = true;
					return;
				}
				const index = nearestIndex(
					chart.points,
					fractionToTime(chart, state.hover),
				);
				const point = chart.points[index];
				chart.layer.append(vline("eta-crosshair", point.t));
				chart.dots[index].classList.add("active");
				const px = chart.x(point.t) / WIDTH;
				showTip(point, px);
			}

			function render() {
				const points = historyPoints(log, {
					target,
					mode: state.mode,
					range: RANGES[state.range],
				});
				syncChips(points);
				const overlays =
					state.mode === "eta"
						? OVERLAYS.filter((key) => state.overlays.has(key))
						: [];
				const next = [
					target,
					state.mode,
					state.range,
					overlays.join(),
					points.length,
					points[0]?.t,
					points.at(-1)?.t,
					points.at(-1)?.value,
				].join(":");
				if (next === signature) return;
				signature = next;
				chart = renderEtaChart(dom.etaChart, points, {
					mode: state.mode,
					overlays,
				});
				dom.etaEmpty.hidden = !!chart;
				for (const id of ["etaMax", "etaMin", "etaFrom", "etaTo", "etaTrend"])
					dom[id].textContent = "";
				if (chart) {
					dom.etaMax.textContent = `${chart.clippedHigh ? "≥ " : ""}${formatValue(state.mode, chart.max)}`;
					dom.etaMin.textContent = `${chart.clippedLow ? "≤ " : ""}${formatValue(state.mode, chart.min)}`;
					dom.etaFrom.textContent = shortDate(chart.firstSample);
					dom.etaTo.textContent = shortDate(chart.lastSample);
					if (chart.trend)
						dom.etaTrend.textContent = `Trend ${formatTrend(state.mode, chart.trend.slope)}`;
				}
				drawInteraction();
			}

			function timeAt(event) {
				const fraction = pointerFraction(event, dom.etaChart);
				if (fraction === null || !chart) return null;
				state.hover = fraction;
				return chart.points[nearestIndex(chart.points, fractionToTime(chart, fraction))].t;
			}
			dom.etaChart.addEventListener("pointerdown", (event) => {
				const t = timeAt(event);
				if (t === null) return;
				state.dragging = true;
				state.selection = { a: t, b: t };
				dom.etaChart.setPointerCapture?.(event.pointerId);
				drawInteraction();
			});
			dom.etaChart.addEventListener("pointermove", (event) => {
				const t = timeAt(event);
				if (t === null) return;
				if (state.dragging) state.selection.b = t;
				drawInteraction();
			});
			const endDrag = () => {
				if (!state.dragging) return;
				state.dragging = false;
				if (state.selection && state.selection.a === state.selection.b)
					state.selection = null;
				drawInteraction();
			};
			dom.etaChart.addEventListener("pointerup", endDrag);
			dom.etaChart.addEventListener("pointercancel", endDrag);
			dom.etaChart.addEventListener("pointerleave", () => {
				if (state.dragging) return;
				state.hover = null;
				drawInteraction();
			});
			dom.etaRanges.addEventListener("click", (event) => {
				const range = event.target.closest("button")?.dataset.range;
				if (range && range !== state.range) change({ range });
			});
			dom.etaModes.addEventListener("click", (event) => {
				const mode = event.target.closest("button")?.dataset.mode;
				if (mode && mode !== state.mode) change({ mode });
			});
			dom.etaOverlays.addEventListener("click", (event) => {
				const key = event.target.closest("button")?.dataset.overlay;
				if (!key) return;
				const overlays = new Set(state.overlays);
				if (overlays.has(key)) overlays.delete(key);
				else overlays.add(key);
				change({ overlays: [...overlays] });
			});

			return {
				update(nextLog, nextTarget) {
					if (nextTarget !== target) state.selection = null;
					log = nextLog;
					target = nextTarget;
					render();
				},
				setSettings(next) {
					applySettings(next);
					signature = "";
				},
				reset() {
					signature = "";
				},
			};
		}

		return {
			ETA_RANGES: RANGES,
			historyPoints,
			etaSeries,
			trendFit,
			robustBounds,
			nearestIndex,
			renderEtaChart,
			createEtaHistory,
			shortDate,
		};
	})(),
);
