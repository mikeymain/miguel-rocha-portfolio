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

		/** [sampledAt, eta] pairs for one target, oldest first, downsampled. */
		function etaSeries(log, target) {
			const points = (Array.isArray(log) ? log : [])
				.filter(
					(entry) =>
						entry?.target === target &&
						Number.isFinite(entry.t) &&
						Number.isFinite(entry.eta?.parties),
				)
				.map((entry) => [entry.t, entry.eta.parties])
				.sort((a, b) => a[0] - b[0]);
			if (points.length <= MAX_POINTS) return points;
			const step = (points.length - 1) / (MAX_POINTS - 1);
			return Array.from(
				{ length: MAX_POINTS },
				(_, i) => points[Math.round(i * step)],
			);
		}

		const shortDate = (ms) =>
			new Date(ms).toLocaleString([], {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});

		function svg(tag, attributes) {
			const element = document.createElementNS(SVG_NS, tag);
			for (const [name, value] of Object.entries(attributes))
				element.setAttribute(name, value);
			return element;
		}

		/**
		 * Draw the series into an <svg>. X is when the forecast was made, Y is
		 * the forecast ETA (later ETA = higher). Returns null under two points.
		 */
		function renderEtaChart(target, series) {
			target.replaceChildren();
			target.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
			if (series.length < 2) return null;
			const times = series.map(([t]) => t),
				etas = series.map(([, eta]) => eta);
			const minT = Math.min(...times),
				maxT = Math.max(...times);
			let minE = Math.min(...etas),
				maxE = Math.max(...etas);
			if (maxE - minE < 60000) {
				minE -= 30000;
				maxE += 30000;
			}
			const x = (t) =>
				PAD_X + ((t - minT) / (maxT - minT || 1)) * (WIDTH - 2 * PAD_X);
			const y = (eta) =>
				HEIGHT - PAD_Y - ((eta - minE) / (maxE - minE)) * (HEIGHT - 2 * PAD_Y);
			for (const level of [minE, maxE])
				target.append(
					svg("line", {
						class: "eta-grid",
						x1: 0,
						x2: WIDTH,
						y1: y(level),
						y2: y(level),
					}),
				);
			target.append(
				svg("polyline", {
					class: "eta-line",
					points: series
						.map(([t, eta]) => `${x(t).toFixed(1)},${y(eta).toFixed(1)}`)
						.join(" "),
				}),
			);
			series.forEach(([t, eta], index) => {
				const last = index === series.length - 1;
				const dot = svg("circle", {
					class: last ? "eta-dot last" : "eta-dot",
					cx: x(t).toFixed(1),
					cy: y(eta).toFixed(1),
					r: last ? 3 : 2,
				});
				const title = svg("title", {});
				title.textContent = `${shortDate(t)} → ${shortDate(eta)}`;
				dot.append(title);
				target.append(dot);
			});
			return {
				first: etas[0],
				latest: etas.at(-1),
				min: Math.min(...etas),
				max: Math.max(...etas),
				firstSample: minT,
				lastSample: maxT,
			};
		}

		return { etaSeries, renderEtaChart, shortDate };
	})(),
);
