// Scan by visiting regular game map URLs, one saved viewport at a time.
(function (root) {
	"use strict";
	const RADII = [5, 10, 15];
	const STEP = 5;
	const GAP_MS = 2000;
	const TIMEOUT_MS = 15000;

	function grid(centre, radius) {
		const match = /^\s*(-?\d+)\s*\|\s*(-?\d+)\s*$/.exec(centre);
		if (!match || !match.slice(1).every((n) => Math.abs(Number(n)) <= 200) || !RADII.includes(radius)) return [];
		const [, x, y] = match.map(Number);
		const wrap = (n) => ((n + 601) % 401) - 200;
		const points = [];
		for (let dy = radius; dy >= -radius; dy -= STEP) {
			const direction = (radius - dy) % (STEP * 2) ? -1 : 1;
			for (let dx = -radius; dx <= radius; dx += STEP) {
				points.push({ x: wrap(x + dx * direction), y: wrap(y + dy) });
			}
		}
		return points;
	}

	function create(tabs) {
		const jobs = new Map();
		const status = (id) => {
			const job = jobs.get(id);
			return job ? { state: job.state, saved: job.saved, total: job.points.length, error: job.error } : null;
		};
		function finish(job, state, error) {
			clearTimeout(job.timer);
			job.state = state;
			job.error = error;
		}
		function matches(raw, expected) {
			const url = URL.parse(raw || "");
			return url?.origin === expected.origin && url.pathname === expected.pathname &&
				["x", "y"].every((key) => url.searchParams.get(key) === expected.searchParams.get(key));
		}
		async function visit(id, job) {
			try {
				const tab = await tabs.get(id);
				if (job.state !== "running") return;
				const current = tab.pendingUrl || tab.url;
				if (!matches(current, job.expected)) {
					finish(job, "stopped", "The game tab left the scan location.");
					return;
				}
				const point = job.points[job.saved];
				const url = new URL(current);
				url.searchParams.set("x", point.x);
				url.searchParams.set("y", point.y);
				job.expected = url;
				job.waiting = true;
				job.timer = setTimeout(() => finish(job, "stopped", `No saved map tiles at ${point.x}|${point.y}. Check the map and try again.`), TIMEOUT_MS);
				if (url.href === current) await tabs.reload(id);
				else await tabs.update(id, { url: url.href });
			} catch {
				if (job.state === "running") finish(job, "stopped", "Could not open the next map location.");
			}
		}
		async function start(id, centre, radius) {
			const points = grid(centre, radius);
			if (!points.length) throw new Error("Enter a centre as x|y, from −200 to 200, and select a radius.");
			const tab = await tabs.get(id);
			const page = URL.parse(tab.pendingUrl || tab.url || "");
			if (!root.WWCore.canScanMap(page)) throw new Error("Open a supported Travian game map first.");
			if ([...jobs.values()].some((job) => job.state === "running")) throw new Error("A map scan is already running.");
			const job = { points, expected: page, state: "running", saved: 0 };
			jobs.set(id, job);
			void visit(id, job);
			return status(id);
		}
		function observe(id, rawUrl, tiles) {
			const job = jobs.get(id);
			if (job?.state !== "running" || !job.waiting || !matches(rawUrl, job.expected)) return;
			const point = job.points[job.saved];
			if (!tiles.some(({ x, y }) => x === point.x && y === point.y)) return;
			clearTimeout(job.timer);
			job.waiting = false;
			if (++job.saved === job.points.length) finish(job, "complete");
			else job.timer = setTimeout(() => void visit(id, job), GAP_MS);
		}
		tabs?.onUpdated.addListener((id, change) => {
			const job = jobs.get(id);
			if (job?.state === "running" && change.url && !matches(change.url, job.expected)) {
				finish(job, "stopped", "The game tab left the scan location.");
			}
		});
		tabs?.onRemoved.addListener((id) => {
			const job = jobs.get(id);
			if (job) finish(job, "stopped");
			jobs.delete(id);
		});
		return { start, observe, status, stop(id) {
			const job = jobs.get(id);
			if (job?.state === "running") finish(job, "stopped");
			return status(id);
		} };
	}

	root.WWMapScan = { create };
})(globalThis);
