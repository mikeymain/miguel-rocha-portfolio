// Traverse the same response containers as OasisCalc's tile scanner.
(function (root) {
	"use strict";
	// Travian's map dictionary (karte.json) maps f6 to 1-1-1-15.
	const cropperTitle = /^\s*\{k\.vt\}\s*\{k\.f6\}\s*$/;
	const OASIS_RADIUS = 1;

	function mapResponseHost(rawUrl) {
		const url = URL.parse(rawUrl);
		if (!url || url.protocol !== "https:" || !/^(?:\/api\/v\d+)?\/map\/position$/.test(url.pathname)) return null;
		return url.hostname === "ts1.x1.europe.travian.com" ? null : root.WWCore.normalizeHost(url.hostname);
	}

	function mapTiles(payload) {
		const matches = new Map();
		function visit(value, depth) {
			if (!value || typeof value !== "object" || depth > 12) return;
			if (Array.isArray(value)) {
				for (const entry of value) visit(entry, depth + 1);
				return;
			}
			if (value.position) {
				const tile = value.tile || value;
				if (typeof tile.title !== "string" || !tile.title.trim()) return;
				const pair = [value.position.x, value.position.y];
				if (!pair.every((n) => Number.isSafeInteger(n) || (typeof n === "string" && /^-?\d+$/.test(n) && Number.isSafeInteger(Number(n))))) return;
				const [x, y] = pair.map(Number);
				const row = { x, y, cropper: cropperTitle.test(tile.title), crop: 0 };
				if (/\{k\.(fo|bt)\}/.test(tile.title)) {
					const text = String(tile.text ?? tile.t ?? "").replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
					const bonuses = [...text.matchAll(/\{a:r([1-4])\}[^%<]*?\b(25|50)\s*%/g)];
					if (!bonuses.length) return;
					row.crop = Math.max(0, ...bonuses.filter((m) => m[1] === "4").map((m) => Number(m[2])));
					row.occupied = /\{k\.bt\}/.test(tile.title) || Number(tile.uid) > 0 || /\{k\.spieler\}/.test(text);
				}
				matches.set(`${x}|${y}`, row);
				return;
			}
			for (const key of ["tiles", "elements", "data", "response"]) visit(value[key], depth + 1);
		}
		visit(payload, 0);
		return Array.from(matches.values());
	}

	function oasisScore({ x, y }, observations) {
		const nearby = [];
		let seen = 0;
		const wrap = (n) => ((n + 200) % 401 + 401) % 401 - 200;
		for (let dy = -OASIS_RADIUS; dy <= OASIS_RADIUS; dy++) {
			for (let dx = -OASIS_RADIUS; dx <= OASIS_RADIUS; dx++) {
				if (!dx && !dy) continue;
				const ox = wrap(x + dx), oy = wrap(y + dy);
				const observation = observations[`${ox}|${oy}`];
				if (observation === undefined) continue;
				seen++;
				if (observation.crop) nearby.push({ x: ox, y: oy, ...observation, distance: dx * dx + dy * dy });
			}
		}
		nearby.sort((a, b) => b.crop - a.crop || Number(a.occupied) - Number(b.occupied) || a.distance - b.distance);
		const best = nearby.slice(0, 3);
		const sum = (list) => list.reduce((total, oasis) => total + oasis.crop, 0);
		return { seen, total: (2 * OASIS_RADIUS + 1) ** 2 - 1, best, potential: sum(best), free: sum(nearby.filter((oasis) => !oasis.occupied).slice(0, 3)) };
	}

	root.WWCroppers = { mapResponseHost, mapTiles, oasisScore };
})(globalThis);
