// Build-order planner core: pure functions, no DOM.
// Greedy payback ranking for resource fields. Each step picks the field
// upgrade with the lowest cost / net hourly gain, applies it, and repeats.
//
//   gain  = production delta * (1 + bonus%) - crop upkeep of the new pop
//   cost  = wood + clay + iron + crop of the next level
//
// Values are in base (speed 1) units; server speed scales production and
// upkeep alike, so the ranking does not depend on it.
// Field data: kirilloid T4 (production, costs, upkeep).
(function (root) {
	if (root.TravianQoLBuildOrder) return;
	const PRODUCTION = [2, 5, 9, 15, 22, 33, 50, 70, 100, 145, 200, 280, 375, 495, 635, 800, 1000, 1300, 1600, 2000, 2450];
	const COST_GROWTH = 1.67;
	// gid -> base cost [wood, clay, iron, crop] and upkeep coefficient.
	const FIELDS = {
		1: { name: 'Woodcutter', res: 0, cost: [40, 100, 50, 60], cu: 2 },
		2: { name: 'Clay Pit', res: 1, cost: [80, 40, 80, 50], cu: 2 },
		3: { name: 'Iron Mine', res: 2, cost: [100, 80, 30, 60], cu: 3 },
		4: { name: 'Cropland', res: 3, cost: [70, 90, 70, 20], cu: 0 },
	};
	const NON_CAPITAL_MAX = 10;
	const CAPITAL_MAX = PRODUCTION.length - 1;

	const roundTo5 = (v) => Math.round(v / 5) * 5;

	/** Resources needed to build `level` of field `gid`. */
	function costAt(gid, level) {
		return FIELDS[gid].cost.map((c) => roundTo5(c * COST_GROWTH ** (level - 1)));
	}

	/** Population of field `gid` at `level` (same formula as building pages). */
	function popAt(gid, level) {
		const cu = FIELDS[gid].cu;
		if (level <= 0) return 0;
		let total = cu;
		for (let l = 2; l <= level; l++) total += Math.round((5 * cu + l - 1) / 10);
		return total;
	}

	/** Net hourly gain (base units) of taking `gid` from `level` to level + 1. */
	function gainOf(gid, level, bonuses) {
		const f = FIELDS[gid];
		const prod = (PRODUCTION[level + 1] - PRODUCTION[level]) * (1 + (bonuses[f.res] || 0) / 100);
		return prod - (popAt(gid, level + 1) - popAt(gid, level));
	}

	/** Max field level for this village: 10, or 20 once any field is past 10. */
	function maxLevelFor(fields) {
		return fields.some((f) => f.level > NON_CAPITAL_MAX) ? CAPITAL_MAX : NON_CAPITAL_MAX;
	}

	/**
	 * Next `steps` upgrades in order.
	 * @param {{slot:number,gid:number,level:number}[]} fields effective levels
	 * @param {number[]} bonuses production bonus % [wood, clay, iron, crop]
	 * @param {number} steps how many upgrades to plan
	 */
	function plan(fields, bonuses, steps) {
		const levels = new Map(fields.map((f) => [f.slot, f.level]));
		const max = maxLevelFor(fields);
		const out = [];
		for (let i = 0; i < steps; i++) {
			let best = null;
			for (const f of fields) {
				const level = levels.get(f.slot);
				if (level >= max || !FIELDS[f.gid]) continue;
				const gain = gainOf(f.gid, level, bonuses);
				if (gain <= 0) continue;
				const cost = costAt(f.gid, level + 1).reduce((a, b) => a + b, 0);
				const payback = cost / gain;
				if (!best || payback < best.payback || (payback === best.payback && f.slot < best.slot)) {
					best = { slot: f.slot, gid: f.gid, name: FIELDS[f.gid].name, from: level, to: level + 1, cost, payback };
				}
			}
			if (!best) break;
			levels.set(best.slot, best.to);
			out.push(best);
		}
		return out;
	}

	root.TravianQoLBuildOrder = { plan, costAt, popAt, gainOf, maxLevelFor, FIELDS };
})(typeof window !== 'undefined' ? window : globalThis);
