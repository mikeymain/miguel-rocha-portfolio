/** ETA history: how the planned settle time moved across logged forecasts. */
"use strict";
Object.assign(
	TSP,
	(() => {
		const MAX_POINTS = 120;
		const SVG_NS = "http://www.w3.org/2000/svg";
		const DEFAULT_WIDTH = 340,
			DEFAULT_HEIGHT = 96,
			PAD_X = 4,
			PAD_Y = 8;
		const HOUR = 3600000,
			DAY = 24 * HOUR;
		/** Selectable sample windows, measured back from now. */
		const RANGES = { "8h": 8 * HOUR, "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY, all: Infinity };
		/** Series the chart can plot. CP/d does not depend on the target. */
		const MODES = ["eta", "cpd"];
		const OVERLAYS = ["baseline", "growth"];
		/** Wheel zoom: span multiplier per tick, pan share, narrowest view. */
		const ZOOM_STEP = 0.8,
			PAN_STEP = 0.15,
			MIN_VIEW_SPAN = HOUR;
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
		 * Same test predictSettlement uses: observed CP plus passive CP since
		 * the observation meets the target. An ETA equal to the sample time
		 * is not enough, since "start the planned celebrations" also gives 0.
		 */
		function isReached(entry) {
			if (!(entry.target > 0) || !Number.isFinite(entry.cp)) return false;
			const since =
				Number.isFinite(entry.obsAt) && entry.daily > 0
					? (entry.daily * Math.max(0, entry.t - entry.obsAt)) / DAY
					: 0;
			return entry.cp + since >= entry.target;
		}
		/**
		 * When CP actually crossed `target`: the sample's observation time
		 * minus the CP above target at the logged rate, kept after the
		 * previous sample. Scans are throttled, so the sample itself can
		 * land hours after the crossing.
		 */
		function crossingTime(entry, previous) {
			const observed = Number.isFinite(entry.obsAt) ? entry.obsAt : entry.t;
			let at = observed;
			if (Number.isFinite(entry.cp) && entry.daily > 0)
				at = observed - (Math.max(0, entry.cp - entry.target) / entry.daily) * DAY;
			const floor = previous ? previous.t : -Infinity;
			return Math.round(Math.min(entry.t, Math.max(floor, at)));
		}
		/**
		 * First sample that met `target` ({t, at}) or null. Later samples
		 * only repeat "now" as the ETA, so the chart stops there.
		 */
		function reachedAt(log, target) {
			const entries = (Array.isArray(log) ? log : [])
				.filter(
					(entry) =>
						Number.isFinite(entry?.t) &&
						entry.target === target &&
						Number.isFinite(entry.eta?.parties),
				)
				.sort((a, b) => a.t - b.t);
			const index = entries.findIndex(isReached);
			if (index < 0) return null;
			const entry = entries[index];
			return { t: entry.t, at: crossingTime(entry, entries[index - 1]) };
		}

		/**
		 * Chart points for one target, oldest first. The range filter runs
		 * before downsampling so short windows keep their full resolution.
		 * ETA points end at the sample that reached the target.
		 */
		function historyPoints(log, options = {}) {
			const {
				target,
				mode = "eta",
				range = Infinity,
				now = Date.now(),
				view = null,
			} = options;
			const reached = mode === "eta" ? reachedAt(log, target) : null;
			const from = Math.max(
				Number.isFinite(range) ? now - range : -Infinity,
				view ? view[0] : -Infinity,
			);
			const to = Math.min(view ? view[1] : Infinity, reached?.t ?? Infinity);
			const points = (Array.isArray(log) ? log : [])
				.filter(
					(entry) =>
						Number.isFinite(entry?.t) &&
						entry.t >= from &&
						entry.t <= to &&
						(mode === "cpd"
							? Number.isFinite(entry.daily)
							: entry.target === target &&
								Number.isFinite(entry.eta?.parties)),
				)
				.map((entry) => {
					// Every series of the crossing sample ends at the real arrival.
					const hit = reached !== null && entry.t === reached.t;
					const eta = (v) => (hit ? reached.at : finiteOrNull(v));
					return {
						t: entry.t,
						value: mode === "cpd" ? entry.daily : eta(entry.eta.parties),
						baseline: eta(entry.eta?.baseline),
						growth: eta(entry.eta?.growth),
						cp: finiteOrNull(entry.cp),
						daily: finiteOrNull(entry.daily),
						model: typeof entry.model === "string" ? entry.model : null,
						reached: hit,
					};
				})
				.sort((a, b) => a.t - b.t);
			// Downsampling always keeps the last point, so the crossing stays.
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

		const LERP_KEYS = ["value", "baseline", "growth", "cp", "daily"];
		/**
		 * Value of `key` at time t, interpolated between the nearest samples
		 * on each side that have it, so gaps in one field don't blank it.
		 */
		function valueAt(points, key, t) {
			let before = null,
				after = null;
			for (const p of points) {
				if (p[key] == null) continue;
				if (p.t <= t) before = p;
				else {
					after = p;
					break;
				}
			}
			if (!before || !after) return (before || after)?.[key] ?? null;
			const share = (t - before.t) / (after.t - before.t || 1);
			return before[key] + share * (after[key] - before[key]);
		}
		/** Point at time t with every field interpolated. */
		function pointAt(points, t) {
			const point = { t };
			for (const key of LERP_KEYS) point[key] = valueAt(points, key, t);
			return point;
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

		/** Gaussian kernel width as a share of the plotted time span. */
		const SMOOTH_SIGMA = 0.025;
		/**
		 * Time-weighted Gaussian smoothing of `key`; nulls stay null. The
		 * reached point is the real arrival, so it is neither smoothed nor
		 * blended into its neighbours.
		 */
		function smoothValues(points, key) {
			const span = points.at(-1).t - points[0].t;
			const sigma = span * SMOOTH_SIGMA;
			return points.map((p) => {
				if (p[key] === null || !sigma || p.reached) return p[key];
				let sum = 0,
					weight = 0;
				for (const q of points) {
					const d = q.t - p.t;
					if (q[key] === null || q.reached || Math.abs(d) > 3 * sigma) continue;
					const w = Math.exp((-d * d) / (2 * sigma * sigma));
					sum += w * q[key];
					weight += w;
				}
				return sum / weight;
			});
		}
		/** Monotone cubic (Fritsch–Carlson) path: smooth, no overshoot. */
		function curvePath(className, coords) {
			const n = coords.length;
			const dx = [],
				m = [];
			for (let i = 0; i < n - 1; i++) {
				dx.push(coords[i + 1][0] - coords[i][0] || 1e-6);
				m.push((coords[i + 1][1] - coords[i][1]) / dx[i]);
			}
			const tangent = coords.map((_, i) => {
				if (i === 0) return m[0];
				if (i === n - 1) return m[n - 2];
				return m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
			});
			for (let i = 0; i < n - 1; i++) {
				if (!m[i]) {
					tangent[i] = tangent[i + 1] = 0;
					continue;
				}
				const a = tangent[i] / m[i],
					b = tangent[i + 1] / m[i];
				const h = a * a + b * b;
				if (h > 9) {
					const k = 3 / Math.sqrt(h);
					tangent[i] = k * a * m[i];
					tangent[i + 1] = k * b * m[i];
				}
			}
			const f = (v) => v.toFixed(1);
			let d = `M${f(coords[0][0])},${f(coords[0][1])}`;
			for (let i = 0; i < n - 1; i++) {
				const [x0, y0] = coords[i],
					[x1, y1] = coords[i + 1],
					h = dx[i] / 3;
				d += `C${f(x0 + h)},${f(y0 + h * tangent[i])} ${f(x1 - h)},${f(y1 - h * tangent[i + 1])} ${f(x1)},${f(y1)}`;
			}
			return svg("path", { class: className, d });
		}

		/**
		 * Draw the points into an <svg>. X is when the forecast was made, Y is
		 * the plotted value (later ETA = higher). Returns null under two points.
		 */
		function renderEtaChart(target, points, options = {}) {
			const overlays = options.overlays || [];
			target.replaceChildren();
			// Match the viewBox to the rendered size so dots stay round.
			const WIDTH = Math.round(target.clientWidth) || DEFAULT_WIDTH,
				HEIGHT = Math.round(target.clientHeight) || DEFAULT_HEIGHT;
			target.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
			if (points.length < 2) return null;
			const minT = points[0].t,
				maxT = points.at(-1).t;
			const values = points.map((p) => p.value);
			const smooth = { value: smoothValues(points, "value") };
			for (const key of overlays) smooth[key] = smoothValues(points, key);
			const plotted = [...smooth.value];
			for (const key of overlays)
				for (const v of smooth[key]) if (v !== null) plotted.push(v);
			let [minV, maxV] = robustBounds(
				plotted,
				options.mode === "cpd" ? 1 : 60000,
			);
			// A reached arrival is never clipped as an outlier: it is the level
			// every forecast is judged against. Raw value, not smoothed.
			if (points.at(-1).reached) {
				minV = Math.min(minV, points.at(-1).value);
				maxV = Math.max(maxV, points.at(-1).value);
			}
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
			const curves = {};
			for (const key of overlays) {
				const coords = points
					.map((p, i) => [x(p.t), smooth[key][i]])
					.filter(([, v]) => v !== null)
					.map(([px, v]) => [px, y(v)]);
				if (coords.length > 1) {
					curves[key] = curvePath(`eta-overlay-line ${key}`, coords);
					target.append(curves[key]);
				}
			}
			// The crossing sample's ETA is the real arrival: a level to judge
			// every earlier forecast against.
			const reached = points.at(-1).reached ? points.at(-1).value : null;
			if (reached !== null)
				target.append(
					svg("line", {
						class: "eta-reached",
						x1: 0,
						x2: WIDTH,
						y1: y(reached),
						y2: y(reached),
					}),
				);
			const trend = trendFit(
				points.filter((_, i) => inside(smooth.value[i])),
			);
			if (trend)
				target.append(
					polyline("eta-trendline", [
						[x(minT), y(trend.at(minT))],
						[x(maxT), y(trend.at(maxT))],
					]),
				);
			const line = curvePath(
				"eta-line",
				points.map((p, i) => [x(p.t), y(smooth.value[i])]),
			);
			target.append(line);
			curves.value = line;
			const dots = points.map((p, index) => {
				const last = index === points.length - 1;
				const dot = svg("circle", {
					class: `eta-dot${last ? " last" : ""}${p.reached ? " reached" : ""}${inside(smooth.value[index]) ? "" : " clipped"}`,
					cx: x(p.t).toFixed(1),
					cy: y(smooth.value[index]).toFixed(1),
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
				curves,
				layer,
				x,
				// Inverse of y(); null where the curve is pinned to an edge.
				valueAtY: (py) => {
					const top = PAD_Y,
						bottom = HEIGHT - PAD_Y;
					if (py <= top + 0.5 || py >= bottom - 0.5) return null;
					return minV + ((bottom - py) / (bottom - top)) * (maxV - minV);
				},
				width: WIDTH,
				height: HEIGHT,
				minT,
				maxT,
				trend,
				reached,
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
		/** Y of a left-to-right path at x, by bisecting its length. */
		function curveY(path, x) {
			if (typeof path?.getTotalLength !== "function") return null;
			const total = path.getTotalLength();
			if (x < path.getPointAtLength(0).x - 0.5) return null;
			if (x > path.getPointAtLength(total).x + 0.5) return null;
			let lo = 0,
				hi = total;
			for (let i = 0; i < 24; i++) {
				const mid = (lo + hi) / 2;
				if (path.getPointAtLength(mid).x < x) lo = mid;
				else hi = mid;
			}
			return path.getPointAtLength(hi).y;
		}
		/** The plot's x maps 0–1 onto [PAD_X, width - PAD_X]. */
		function fractionToTime(chart, fraction) {
			const px = fraction * chart.width;
			const share = (px - PAD_X) / (chart.width - 2 * PAD_X);
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
				view: null,
			};
			let extent = null;
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
				state.view = null;
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
				if (state.mode === "eta" && chart.reached !== null) {
					dom.etaChange.textContent = `Reached ${shortDate(chart.reached)}`;
					if (text) dom.etaChange.title = `${text} vs first forecast`;
					dom.etaChange.classList.add("reached");
					return;
				}
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
					if (point.baseline !== null)
						rows.push(tipRow("No parties", shortDate(point.baseline)));
					rows.push(tipRow("With parties", shortDate(point.value)));
					if (point.growth !== null)
						rows.push(tipRow("Parties + growth", shortDate(point.growth)));
				}
				if (point.cp !== null)
					rows.push(tipRow("CP", Math.round(point.cp).toLocaleString()));
				if (point.daily !== null)
					rows.push(tipRow("CP/d", oneDecimal(point.daily)));
				dom.etaTip.replaceChildren(...rows);
				// Centre the tip above the cursor, held inside the plot's edges.
				dom.etaTip.hidden = false;
				const plot = dom.etaTip.offsetParent?.clientWidth || 0;
				const width = dom.etaTip.offsetWidth;
				const left = Math.min(
					Math.max(0, fraction * plot - width / 2),
					Math.max(0, plot - width),
				);
				dom.etaTip.style.left = `${left.toFixed(1)}px`;
			}

			function vline(className, t) {
				return svg("line", {
					class: className,
					x1: chart.x(t),
					x2: chart.x(t),
					y1: 0,
					y2: chart.height,
				});
			}
			/** Redraw only the hover and selection layer. */
			function drawInteraction() {
				if (!chart) {
					dom.etaTip.hidden = true;
					return;
				}
				chart.layer.replaceChildren();
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
							height: chart.height,
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
				const t = fractionToTime(chart, state.hover);
				const point = pointAt(chart.points, t);
				const x = chart.x(t);
				chart.layer.append(vline("eta-crosshair", t));
				// Read each drawn series straight off its curve.
				for (const [key, path] of Object.entries(chart.curves)) {
					const y = curveY(path, x);
					if (y === null) continue;
					chart.layer.append(
						svg("circle", {
							class: `eta-hover-dot ${key}`,
							cx: x,
							cy: y,
							r: key === "value" ? 2.5 : 2,
						}),
					);
					const traced = chart.valueAtY(y);
					if (traced !== null) point[key] = traced;
				}
				if (state.mode === "cpd") point.daily = point.value;
				showTip(point, x / chart.width);
			}

			function render() {
				const query = {
					target,
					mode: state.mode,
					range: RANGES[state.range],
				};
				const all = historyPoints(log, query);
				extent = all.length > 1 ? [all[0].t, all.at(-1).t] : null;
				if (!extent) state.view = null;
				const points = state.view
					? historyPoints(log, { ...query, view: state.view })
					: all;
				syncChips(all);
				dom.etaZoomReset.hidden = !state.view;
				const overlays =
					state.mode === "eta"
						? OVERLAYS.filter((key) => state.overlays.has(key))
						: [];
				const next = [
					target,
					state.mode,
					state.range,
					state.view?.join("-"),
					dom.etaChart.clientWidth,
					dom.etaChart.clientHeight,
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
			/** Wheel zooms time around the cursor; Shift+wheel pans. */
			function zoomView(event) {
				if (event.ctrlKey || event.metaKey || !chart || !extent) return;
				const fraction = pointerFraction(event, dom.etaChart);
				if (fraction === null) return;
				event.preventDefault();
				const [a, b] = state.view || extent;
				const span = b - a;
				let next;
				if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
					const shift =
						Math.sign(event.deltaX || event.deltaY) * span * PAN_STEP;
					next = [a + shift, b + shift];
					if (next[0] < extent[0]) next = [extent[0], extent[0] + span];
					if (next[1] > extent[1]) next = [extent[1] - span, extent[1]];
				} else {
					const t = fractionToTime(chart, fraction);
					const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
					const width = Math.max(MIN_VIEW_SPAN, span * factor);
					const share = span ? (t - a) / span : 0.5;
					next = [t - width * share, t + width * (1 - share)];
					next = [Math.max(extent[0], next[0]), Math.min(extent[1], next[1])];
				}
				state.view =
					next[0] <= extent[0] && next[1] >= extent[1] ? null : next;
				render();
			}
			const resetView = () => {
				if (!state.view) return;
				state.view = null;
				render();
			};
			dom.etaChart.addEventListener("wheel", zoomView, { passive: false });
			dom.etaChart.addEventListener("dblclick", resetView);
			dom.etaZoomReset.addEventListener("click", resetView);
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
				resize() {
					signature = "";
					render();
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
