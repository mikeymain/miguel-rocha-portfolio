// Heat cells group observed coordinates. Unobserved terrain earns no points.
(function (root) {
	"use strict";
	const A = root.WWAnalysis;
	const wrap = (n) => n > 200 ? n - 401 : n < -200 ? n + 401 : n;
	const band = (n) => Math.min(19, Math.floor(n / 10));
	const points = (max, fraction) => Math.round(max * Math.max(0, Math.min(1, fraction)));
	const total = (parts) => Object.values(parts).reduce((sum, n) => sum + n, 0);
	const resources = ["Lumber", "Clay", "Iron", "Crop"];

	function survey(observations, croppers, snap, { target, greyRadius } = {}) {
		const cells = new Map(), records = [], villages = new Map();
		const rings = new Map((snap ? A.spawnRing(snap) : []).map((r) => [r.quadrant, r.medianDist]));
		function cellAt(x, y) {
			const bx = band(x), by = band(y), id = bx + "|" + by;
			if (!cells.has(id)) cells.set(id, { id, bx, by, quad: A.quadrantOf(x, y), seen: 0,
				valleys: 0, croppers: 0, freeYield: 0, players: new Set(), alliances: new Set(), best: null });
			return cells.get(id);
		}
		for (let i = 0; snap && i < snap.x.length; i++) {
			const x = snap.x[i], y = snap.y[i];
			villages.set(x + "|" + y, i);
			const cell = cellAt(x, y);
			cell.players.add(snap.uid[i]);
			if (snap.aid[i]) cell.alliances.add(snap.aid[i]);
		}
		const tiles = new Map();
		for (const point of new Set([...Object.keys(observations), ...Object.keys(croppers)])) {
			const [x, y] = point.split("|").map(Number);
			const cell = cellAt(x, y);
			cell.seen++;
			const obs = observations[point], cropper = croppers[point];
			const oasis = obs && typeof obs === "object";
			const valley = typeof obs === "number" && obs > 0;
			if (!cropper && !oasis && !valley) continue;
			const type = oasis ? "Oasis" : cropper ? "15c" : "Valley";
			const claimed = oasis ? obs.occupied : obs < 0 || villages.has(point);
			const excluded = greyRadius > 0 && Math.hypot(x, y) <= greyRadius;
			const bonus = obs?.bonuses || (obs?.crop ? { 4: obs.crop } : {});
			const amount = Object.values(bonus).reduce((sum, pct) => sum + pct, 0);
			const row = { point, x, y, quad: cell.quad, cell: cell.id, type,
				status: claimed ? "Occupied" : oasis || valley ? "Free when seen" : "Unverified",
				grey: excluded, bonus: Object.entries(bonus).map(([r, pct]) => resources[r-1] + " +" + pct + "%").join(", "),
				time: obs?.seenAt || (typeof obs === "number" && Math.abs(obs)) || cropper?.seenAt || null, amount, crop: obs?.crop || 0 };
			records.push(row);
			tiles.set(point, row);
			if (excluded || claimed) continue;
			if (oasis) cell.freeYield += amount;
			else {
				cell.valleys++;
				if (cropper) cell.croppers++;
			}
		}
		for (const cell of cells.values()) {
			if (!cell.valleys) continue;
			const ring = rings.get(cell.quad);
			const distance = Math.hypot(cell.bx * 10 + 4.5, cell.by * 10 + 4.5);
			cell.ring = ring;
			cell.radius = Math.round(distance);
			cell.parts = {
				"15c": points(25, cell.croppers / 2), "Valleys": points(10, cell.valleys / 10),
				"Oases": points(25, cell.freeYield / 300),
				"Spawn ring": ring == null ? 0 : points(20, 1 - Math.abs(distance - ring) / 30),
				"Competition": snap ? points(20, 1 - (cell.players.size + cell.alliances.size) / 10) : 0,
			};
			cell.spawn = total(cell.parts);
		}
		for (const row of records) {
			const cell = cells.get(row.cell);
			row.spawn = cell.spawn;
			if (row.type === "Oasis" || row.grey || row.status === "Occupied") continue;
			const free = [], players = new Set(), alliances = new Set();
			let seen = 0;
			for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
				if (!dx && !dy) continue;
				const key = wrap(row.x + dx) + "|" + wrap(row.y + dy);
				if (Object.hasOwn(observations, key) || tiles.has(key)) seen++;
				const nearby = tiles.get(key);
				if (nearby?.type === "Oasis" && nearby.status === "Free when seen" && nearby.amount)
					free.push(nearby);
				const i = villages.get(key);
				if (i !== undefined) {
					players.add(snap.uid[i]);
					if (snap.aid[i]) alliances.add(snap.aid[i]);
				}
			}
			// Crop counts at full value, other resources at half value.
			const value = (oasis) => (oasis.crop + oasis.amount) / 2;
			const best = free.sort((a, b) => value(b) - value(a)).slice(0, 3);
			row.distance = target ? Math.round(A.distance(row.x, row.y, target.x, target.y) * 10) / 10 : null;
			row.parts = {
				"Terrain": row.type === "15c" ? 35 : 10,
				"Oases": points(30, best.reduce((sum, o) => sum + value(o), 0) / 150),
				"Target": target ? points(20, 1 - row.distance / 30) : 0,
				"Competition": snap ? points(15, 1 - (players.size + alliances.size) / 6) : 0,
			};
			row.settle = total(row.parts);
			row.coverage = seen + "/48";
			row.neighbours = snap ? players.size + " players, " + alliances.size + " alliances" : "No snapshot";
			row.oases = best.map((o) => o.point + " " + o.bonus).join(" · ");
			if (!cell.best || row.settle > cell.best.settle) cell.best = row;
		}
		return { cells, records };
	}
	root.WWHeat = { survey };
})(globalThis);
