// Pure analysis functions over parsed map.sql snapshots (see mapsql.js).
(function (root) {
	"use strict";

	const MAP_SIZE = 401; // -200..200 on both axes; the map wraps.
	const HOUR_MS = 3_600_000;
	const QUADRANTS = ["NE", "NW", "SE", "SW"];

	// Positive y is north. The 0 axes belong to the east / north side.
	function quadrantOf(x, y) {
		return (y >= 0 ? "N" : "S") + (x >= 0 ? "E" : "W");
	}

	function wrapDelta(d) {
		const a = Math.abs(d) % MAP_SIZE;
		return Math.min(a, MAP_SIZE - a);
	}

	function distance(ax, ay, bx, by) {
		return Math.hypot(wrapDelta(ax - bx), wrapDelta(ay - by));
	}

	function round1(n) {
		return Math.round(n * 10) / 10;
	}

	function median(values) {
		if (!values.length) return null;
		const s = [...values].sort((a, b) => a - b);
		const mid = s.length >> 1;
		return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
	}

	// Nearest-rank percentile, p in 0..100.
	function percentile(values, p) {
		if (!values.length) return null;
		const s = [...values].sort((a, b) => a - b);
		const rank = Math.ceil((p / 100) * s.length);
		return s[Math.min(s.length - 1, Math.max(0, rank - 1))];
	}

	// Groups villages per account: pop, villages and spawn (lowest vid).
	function accounts(snap) {
		const map = new Map();
		for (let i = 0; i < snap.uid.length; i++) {
			const uid = snap.uid[i];
			let acc = map.get(uid);
			if (!acc) {
				acc = { uid, pop: 0, villages: 0, aid: snap.aid[i], spawnVid: Infinity, sx: 0, sy: 0, idx: [] };
				map.set(uid, acc);
			}
			acc.pop += snap.pop[i];
			acc.villages += 1;
			acc.idx.push(i);
			if (snap.vid[i] < acc.spawnVid) {
				acc.spawnVid = snap.vid[i];
				acc.sx = snap.x[i];
				acc.sy = snap.y[i];
			}
		}
		return map;
	}

	// Newest `count` accounts (by uid) per quadrant of their spawn village.
	function newestPerQuadrant(snap, count) {
		const byQuad = Object.fromEntries(QUADRANTS.map((q) => [q, []]));
		for (const acc of accounts(snap).values()) byQuad[quadrantOf(acc.sx, acc.sy)].push(acc);
		return Object.fromEntries(QUADRANTS.map((q) => [q, byQuad[q].sort((a, b) => b.uid - a.uid).slice(0, count)]));
	}

	const ALLIANCE_COLORS = ["#d7263d", "#1b6ca8", "#f49d37", "#7b2cbf", "#2a9d8f", "#e76f51", "#455a64", "#8d6e63", "#ff5d8f", "#00a6a6"];

	// Accounts ranked by population. x/y is the account's largest village.
	function topAccounts(snap, limit = 100) {
		const rows = [];
		for (const acc of accounts(snap).values()) {
			const big = acc.idx.reduce((b, i) => (snap.pop[i] > snap.pop[b] ? i : b), acc.idx[0]);
			rows.push({ uid: acc.uid, player: snap.players[acc.uid] || "", aid: acc.aid, alliance: snap.alliances[acc.aid] || "", pop: acc.pop, villages: acc.villages, x: snap.x[big], y: snap.y[big] });
		}
		rows.sort((p, q) => q.pop - p.pop || p.uid - q.uid);
		return rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
	}

	// Map overlay data: newest spawns, the ring they form and the top alliances.
	function mapLayers(snap, { spawnCount = 40, allianceCount = 10 } = {}) {
		const perQuad = newestPerQuadrant(snap, spawnCount);
		const spawns = QUADRANTS.flatMap((q) => perQuad[q]);
		const dists = spawns.map((a) => Math.hypot(a.sx, a.sy));
		const alliances = topAlliances(snap, Math.min(allianceCount, ALLIANCE_COLORS.length)).map((a, i) => ({
			...a,
			color: ALLIANCE_COLORS[i],
		}));
		const top = topAccounts(snap, 100);
		return {
			top,
			topRank: new Map(top.map((r) => [r.uid, r.rank])),
			spawnUids: new Set(spawns.map((a) => a.uid)),
			spawnVids: new Set(spawns.map((a) => a.spawnVid)),
			ring: dists.length ? { min: round1(Math.min(...dists)), median: round1(median(dists)), max: round1(Math.max(...dists)) } : null,
			newest: spawns.length ? spawns.reduce((a, b) => (b.uid > a.uid ? b : a)) : null,
			alliances,
		};
	}

	// Spawn ring per quadrant from the newest `count` accounts (by uid).
	function spawnRing(snap, count = 40, examples = 5) {
		const perQuad = newestPerQuadrant(snap, count);
		return QUADRANTS.map((quadrant) => {
			const newest = perQuad[quadrant];
			const dists = newest.map((a) => Math.hypot(a.sx, a.sy));
			return {
				quadrant,
				accounts: newest.length,
				minDist: dists.length ? round1(Math.min(...dists)) : null,
				medianDist: dists.length ? round1(median(dists)) : null,
				maxDist: dists.length ? round1(Math.max(...dists)) : null,
				newestUid: newest.length ? newest[0].uid : null,
				examples: newest.slice(0, examples).map((a) => `${a.sx}|${a.sy}`).join(" "),
			};
		});
	}

	function parsePoint(text) {
		const m = /^\s*\(?\s*(-?\d{1,3})\s*[|,;\s]\s*(-?\d{1,3})\s*\)?\s*$/.exec(String(text || ""));
		if (!m) return null;
		const x = Number(m[1]);
		const y = Number(m[2]);
		if (Math.abs(x) > 200 || Math.abs(y) > 200) return null;
		return { x, y };
	}

	function nearestDistance(snap, acc, point) {
		let best = Infinity;
		for (const i of acc.idx) best = Math.min(best, distance(snap.x[i], snap.y[i], point.x, point.y));
		return best;
	}

	// Population gain per account between two snapshots.
	// Only accounts present in both are compared. Gains above the 99th
	// percentile of all compared accounts are flagged.
	// opts: { point: {x,y}, radius, limit }
	function goldSuspects(prev, cur, opts = {}) {
		const hours = (cur.t - prev.t) / HOUR_MS;
		const before = accounts(prev.snap);
		const after = accounts(cur.snap);
		const all = [];
		for (const acc of after.values()) {
			const old = before.get(acc.uid);
			if (!old) continue;
			all.push({ acc, old, gain: acc.pop - old.pop });
		}
		const p99 = percentile(
			all.map((r) => r.gain),
			99,
		);
		const rows = [];
		for (const { acc, old, gain } of all) {
			let dist = null;
			if (opts.point) {
				dist = nearestDistance(cur.snap, acc, opts.point);
				if (Number.isFinite(opts.radius) && dist > opts.radius) continue;
			}
			rows.push({
				uid: acc.uid,
				player: cur.snap.players[acc.uid] || "",
				alliance: cur.snap.alliances[acc.aid] || "",
				popBefore: old.pop,
				pop: acc.pop,
				gain,
				perHour: hours > 0 ? round1(gain / hours) : null,
				villages: acc.villages,
				villagesDelta: acc.villages - old.villages,
				spawn: `${acc.sx}|${acc.sy}`,
				distance: dist == null ? null : round1(dist),
				flag: p99 != null && gain > p99 && gain > 0,
			});
		}
		rows.sort((a, b) => b.gain - a.gain || a.uid - b.uid);
		return { hours: round1(hours), p99, compared: all.length, rows: opts.limit ? rows.slice(0, opts.limit) : rows };
	}

	// Alliances ranked by population, with a pop-weighted centre.
	function topAlliances(snap, limit = 30) {
		const map = new Map();
		for (let i = 0; i < snap.aid.length; i++) {
			const aid = snap.aid[i];
			if (!aid) continue;
			let a = map.get(aid);
			if (!a) {
				a = { aid, members: new Set(), villages: 0, pop: 0, wx: 0, wy: 0, quad: { NE: 0, NW: 0, SE: 0, SW: 0 } };
				map.set(aid, a);
			}
			const pop = snap.pop[i];
			const weight = Math.max(pop, 1);
			a.members.add(snap.uid[i]);
			a.villages += 1;
			a.pop += pop;
			a.wx += snap.x[i] * weight;
			a.wy += snap.y[i] * weight;
			a.w = (a.w || 0) + weight;
			a.quad[quadrantOf(snap.x[i], snap.y[i])] += pop;
		}
		return [...map.values()]
			.sort((a, b) => b.pop - a.pop || a.aid - b.aid)
			.slice(0, limit)
			.map((a) => ({
				aid: a.aid,
				tag: snap.alliances[a.aid] || "",
				members: a.members.size,
				villages: a.villages,
				pop: a.pop,
				centre: `${Math.round(a.wx / a.w)}|${Math.round(a.wy / a.w)}`,
				quadrant: QUADRANTS.reduce((best, q) => (a.quad[q] > a.quad[best] ? q : best), "NE"),
			}));
	}

	// Growth rows from stored snapshot summaries (oldest first).
	function growth(metas) {
		return [...metas]
			.sort((a, b) => a.t - b.t)
			.map((m, i, arr) => ({
				t: m.t,
				maxUid: m.maxUid,
				signupsDelta: i ? m.maxUid - arr[i - 1].maxUid : null,
				accounts: m.accounts,
				villages: m.villages,
				pop: m.pop,
			}));
	}

	function csvCell(value) {
		let s = value == null ? "" : String(value);
		if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
		return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	}

	// columns: [{ key, label }]
	function toCsv(columns, rows) {
		const head = columns.map((c) => csvCell(c.label)).join(",");
		const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(","));
		return [head, ...body].join("\r\n") + "\r\n";
	}

	root.WWAnalysis = {
		MAP_SIZE,
		QUADRANTS,
		quadrantOf,
		distance,
		median,
		percentile,
		accounts,
		spawnRing,
		mapLayers,
		topAccounts,
		parsePoint,
		goldSuspects,
		topAlliances,
		growth,
		toCsv,
	};
})(globalThis);
