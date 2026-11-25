// Build-order planner core: pure functions, no DOM.
// Greedy payback ranking. Each step picks the upgrade with the lowest
// cost / net hourly gain, applies it, and repeats.
//
//   field     gain = production delta * (1 + bonus%) - crop upkeep of new pop
//   building  gain = +5% of the base production of its resource - upkeep
//   oasis     gain = oasis % of the base production it boosts, after building
//             the Hero's Mansion up to 10 / 15 / 20 for the 1st / 2nd / 3rd
//   cost      = wood + clay + iron + crop of the levels needed
//
// Values are in base (speed 1) units; server speed scales production and
// upkeep alike, so the ranking does not depend on it.
// Data: kirilloid T4 (production, costs, upkeep).
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
	// Resource boost buildings: +5% per level, max 5. `field`: gid + level of
	// a resource field needed first; `needs`: other buildings needed first.
	const BOOSTS = {
		5: { name: 'Sawmill', res: 0, cost: [520, 380, 290, 90], k: 1.8, cu: 4, field: [1, 10], needs: { 15: 5 } },
		6: { name: 'Brickyard', res: 1, cost: [440, 480, 320, 50], k: 1.8, cu: 3, field: [2, 10], needs: { 15: 5 } },
		7: { name: 'Iron Foundry', res: 2, cost: [200, 450, 510, 120], k: 1.8, cu: 6, field: [3, 10], needs: { 15: 5 } },
		8: { name: 'Grain Mill', res: 3, cost: [500, 440, 380, 1240], k: 1.8, cu: 3, field: [4, 5], needs: {} },
		9: { name: 'Bakery', res: 3, cost: [1200, 1480, 870, 1600], k: 1.8, cu: 4, field: [4, 10], needs: { 8: 5, 15: 5 } },
	};
	const BOOST_MAX = 5;
	const BOOST_PCT = 5;
	const MANSION = { gid: 37, name: "Hero's Mansion", cost: [700, 670, 700, 240], k: 1.33, cu: 2 };
	const MANSION_FOR_OASIS = [10, 15, 20];
	const NON_CAPITAL_MAX = 10;
	const CAPITAL_MAX = PRODUCTION.length - 1;

	const roundTo5 = (v) => Math.round(v / 5) * 5;
	const sum = (a) => a.reduce((x, y) => x + y, 0);

	/** Resources needed to build `level` of field `gid`. */
	function costAt(gid, level) {
		return FIELDS[gid].cost.map((c) => roundTo5(c * COST_GROWTH ** (level - 1)));
	}

	function buildingCost(b, level) {
		return sum(b.cost.map((c) => roundTo5(c * b.k ** (level - 1))));
	}

	/** Population at `level` for upkeep coefficient `cu` (building page formula). */
	function popFor(cu, level) {
		if (level <= 0) return 0;
		let total = cu;
		for (let l = 2; l <= level; l++) total += Math.round((5 * cu + l - 1) / 10);
		return total;
	}

	/** Population of field `gid` at `level`. */
	function popAt(gid, level) {
		return popFor(FIELDS[gid].cu, level);
	}

	/** Net hourly gain (base units) of taking `gid` from `level` to level + 1. */
	function gainOf(gid, level, bonuses) {
		const f = FIELDS[gid];
		const prod = (PRODUCTION[level + 1] - PRODUCTION[level]) * (1 + (bonuses[f.res] || 0) / 100);
		return prod - (popAt(gid, level + 1) - popAt(gid, level));
	}

	/** Max field level for this village: 10, or 20 once any field is past 10. */
	function maxLevelFor(fields, forceMax) {
		// `forceMax`: the per-village "Simulate to level 20" toggle.
		return forceMax || fields.some((f) => f.level > NON_CAPITAL_MAX) ? CAPITAL_MAX : NON_CAPITAL_MAX;
	}

	/** Base production per resource from field levels. */
	function baseProduction(fields, levels) {
		const out = [0, 0, 0, 0];
		for (const f of fields) if (FIELDS[f.gid]) out[FIELDS[f.gid].res] += PRODUCTION[levels.get(f.slot)];
		return out;
	}

	function maxFieldLevel(fields, levels, gid) {
		return Math.max(0, ...fields.filter((f) => f.gid === gid).map((f) => levels.get(f.slot)));
	}

	function bestField(fields, levels, max, bonus) {
		let best = null;
		for (const f of fields) {
			const level = levels.get(f.slot);
			if (level >= max || !FIELDS[f.gid]) continue;
			const gain = gainOf(f.gid, level, bonus);
			if (gain <= 0) continue;
			const cost = sum(costAt(f.gid, level + 1));
			const payback = cost / gain;
			if (!best || payback < best.payback || (payback === best.payback && f.slot < best.slot)) {
				best = { kind: 'field', slot: f.slot, gid: f.gid, res: FIELDS[f.gid].res, name: FIELDS[f.gid].name, from: level, to: level + 1, cost, payback };
			}
		}
		return best;
	}

	function bestBoost(fields, levels, bld) {
		const base = baseProduction(fields, levels);
		let best = null;
		for (const [gid, b] of Object.entries(BOOSTS)) {
			const level = bld[gid] || 0;
			if (level >= BOOST_MAX) continue;
			if (maxFieldLevel(fields, levels, b.field[0]) < b.field[1]) continue;
			if (Object.entries(b.needs).some(([g, l]) => (bld[g] ?? l) < l)) continue;
			const gain = (base[b.res] * BOOST_PCT) / 100 - (popFor(b.cu, level + 1) - popFor(b.cu, level));
			if (gain <= 0) continue;
			const cost = buildingCost(b, level + 1);
			const step = { kind: 'building', gid: Number(gid), res: b.res, name: b.name, from: level, to: level + 1, cost, payback: cost / gain };
			if (!best || step.payback < best.payback) best = step;
		}
		return best;
	}

	// Next planned oasis: build the Hero's Mansion to the level its slot needs.
	function bestOasis(fields, levels, bld, planned, owned) {
		if (!planned.length || owned >= MANSION_FOR_OASIS.length) return null;
		const need = MANSION_FOR_OASIS[owned];
		const from = bld[MANSION.gid] || 0;
		const to = Math.max(need, from);
		const base = baseProduction(fields, levels);
		let cost = 0;
		for (let l = from + 1; l <= to; l++) cost += buildingCost(MANSION, l);
		const upkeep = popFor(MANSION.cu, to) - popFor(MANSION.cu, from);
		let best = null;
		planned.forEach((bonus, index) => {
			const gain = sum(bonus.map((pct, r) => (base[r] * pct) / 100)) - upkeep;
			if (gain <= 0) return;
			const step = { kind: 'oasis', index, bonus, name: MANSION.name, from, to, cost, payback: cost / gain };
			if (!best || step.payback < best.payback) best = step;
		});
		return best;
	}

	function boostPct(bld, r) {
		return BOOST_PCT * sum(Object.entries(BOOSTS).filter(([, b]) => b.res === r).map(([g]) => bld[g] || 0));
	}

	/**
	 * Next `steps` upgrades in order.
	 * @param {{slot:number,gid:number,level:number}[]} fields effective levels
	 * @param {number[]} bonuses production bonus % [wood, clay, iron, crop].
	 *   With `extra` this excludes the boost buildings (owned oases, gold).
	 * @param {number} steps how many upgrades to plan
	 * @param {{buildings?:Object<number,number>, plannedOases?:number[][], ownedOases?:number}} [extra]
	 *   building levels by gid (5-9 boosts, 15 main building, 37 Hero's
	 *   Mansion) and oases still to take. Without it only fields are planned.
	 * @param {boolean} [forceMax] plan fields to level 20 even if none is past 10
	 */
	function plan(fields, bonuses, steps, extra, forceMax) {
		const levels = new Map(fields.map((f) => [f.slot, f.level]));
		const max = maxLevelFor(fields, forceMax);
		const bld = { ...(extra?.buildings || {}) };
		const planned = [...(extra?.plannedOases || [])];
		const own = [...bonuses];
		let owned = extra?.ownedOases || 0;
		const out = [];
		for (let i = 0; i < steps; i++) {
			const bonus = own.map((b, r) => b + (extra ? boostPct(bld, r) : 0));
			const options = [bestField(fields, levels, max, bonus)];
			if (extra) options.push(bestBoost(fields, levels, bld), bestOasis(fields, levels, bld, planned, owned));
			const best = options.filter(Boolean).sort((a, b) => a.payback - b.payback)[0];
			if (!best) break;
			if (best.kind === 'field') levels.set(best.slot, best.to);
			else if (best.kind === 'building') bld[best.gid] = best.to;
			else {
				bld[MANSION.gid] = best.to;
				best.bonus.forEach((pct, r) => { own[r] += pct; });
				planned.splice(best.index, 1);
				owned += 1;
			}
			out.push(best);
		}
		return out;
	}

	// Names of the prerequisite buildings in BOOSTS[].needs.
	const NEED_NAMES = { 8: 'Grain Mill', 15: 'Main Building' };

	/**
	 * When each boost building is worth building.
	 * Runs the plan `depth` steps ahead and returns, per boost gid, the
	 * 1-based step of its next level (null if not reached) and the first
	 * prerequisite still missing now ({ name, level } or null). The planner
	 * never builds prerequisite buildings, so a missing one means no step.
	 */
	function boostSchedule(fields, bonuses, extra, depth, forceMax) {
		const bld = extra?.buildings || {};
		const levels = new Map(fields.map((f) => [f.slot, f.level]));
		const steps = plan(fields, bonuses, depth, extra, forceMax);
		return Object.entries(BOOSTS).map(([g, b]) => {
			const gid = Number(g);
			const level = bld[gid] || 0;
			const index = steps.findIndex((s) => s.kind === 'building' && s.gid === gid);
			const missingNeed = Object.entries(b.needs).find(([n, l]) => (bld[n] ?? l) < l);
			let blocker = null;
			if (missingNeed) blocker = { name: NEED_NAMES[missingNeed[0]], level: missingNeed[1] };
			else if (maxFieldLevel(fields, levels, b.field[0]) < b.field[1]) blocker = { name: FIELDS[b.field[0]].name, level: b.field[1] };
			return { gid, name: b.name, res: b.res, level, max: BOOST_MAX, step: index >= 0 ? index + 1 : null, blocker };
		});
	}

	// Hero's Mansion annex range: 3 tiles each way (7x7 minus the village).
	const OASIS_RANGE = 3;
	const MAP_HALF = 200;
	const MAP_SIZE = 2 * MAP_HALF + 1;
	const wrap = (n) => (((n + MAP_HALF) % MAP_SIZE) + MAP_SIZE) % MAP_SIZE - MAP_HALF;

	/**
	 * Oases in annex range of a village, from map tiles seen in game.
	 * @param {Object<string, 0|{b:number[], o:boolean}>} tiles "x|y" -> 0 (not an
	 *   oasis) or { b: bonus % [wood, clay, iron, crop], o: occupied }
	 * @returns {{seen:number, total:number, oases:{x:number,y:number,bonus:number[],occupied:boolean}[]}}
	 */
	function nearbyOases(x, y, tiles) {
		const oases = [];
		let seen = 0;
		for (let dy = -OASIS_RANGE; dy <= OASIS_RANGE; dy++) {
			for (let dx = -OASIS_RANGE; dx <= OASIS_RANGE; dx++) {
				if (!dx && !dy) continue;
				const tx = wrap(x + dx), ty = wrap(y + dy);
				const tile = tiles?.[`${tx}|${ty}`];
				if (tile === undefined) continue;
				seen++;
				if (tile && Array.isArray(tile.b)) oases.push({ x: tx, y: ty, bonus: tile.b.map(Number), occupied: !!tile.o });
			}
		}
		return { seen, total: (2 * OASIS_RANGE + 1) ** 2 - 1, oases };
	}

	/** Free oases by hourly gain (base units) for these field levels, best first. */
	function rankOases(fields, oases) {
		const base = baseProduction(fields, new Map(fields.map((f) => [f.slot, f.level])));
		return oases
			.filter((o) => !o.occupied)
			.map((o) => ({ ...o, gain: Math.round(sum(o.bonus.map((pct, r) => (base[r] * pct) / 100))) }))
			.sort((a, b) => b.gain - a.gain);
	}

	root.TravianQoLBuildOrder = { plan, boostSchedule, nearbyOases, rankOases, costAt, popAt, gainOf, maxLevelFor, boostPct, FIELDS, BOOSTS, MANSION, MANSION_FOR_OASIS };
})(typeof window !== 'undefined' ? window : globalThis);
