// Starting guide: 4-party farming start (guide by Caim, community spreadsheet).
// Pure data and functions, no DOM. Costs, rewards, CP and population are the
// sheet's Roman numbers; buildings cost the same for every tribe. Rows with
// `manual` need are ticked by hand (tasks, parties, troops).
//
// need items:
//   { k: 'f', g, n, to }  n resource fields of type g at level >= to (n 'all' = every one)
//   { k: 'b', g, n, to }  n buildings (g: gid or list of gids) at level >= to
// Counts are cumulative: "1x to 4" after "1x to 2" is still one field.
(function (root) {
	if (root.TravianQoLGuide4P) return;
	const WALLS = [31, 32, 33, 42, 43];
	const WOOD = 1, CLAY = 2, IRON = 3, CROP = 4;
	const GID = { warehouse: 10, granary: 11, smithy: 13, main: 15, rally: 16, market: 17, embassy: 18, barracks: 19,
		stable: 20, workshop: 21, academy: 22, cranny: 23, townhall: 24, residence: 25 };

	const f = (g, n, to) => ({ k: 'f', g, n, to });
	const b = (g, to, n = 1) => ({ k: 'b', g, n, to });
	const each = (to) => [f(WOOD, 1, to), f(CLAY, 1, to), f(IRON, 1, to), f(CROP, 1, to)];
	const all = (g, to) => [f(g, 'all', to)];
	const allRes = (to) => [WOOD, CLAY, IRON, CROP].map((g) => f(g, 'all', to));
	// label, need (null = manual), cost, reward res, CP/day, population, options
	const S = (label, need, cost = 0, reward = 0, cp = 0, pop = 0, opts = {}) => ({ label, need, cost, reward, cp, pop, ...opts });

	const STEPS = [
		S('Hero adventure for a horse, then raid animals', null),
		S('Main Building 1', [b(GID.main, 1)], 0, 600, 2, 2),
		S('Woodcutter 1x to 2', [f(WOOD, 1, 2)], 0, 600, 1, 3),
		S('Cropland 1x to 2', [f(CROP, 1, 2)], 0, 600, 1, 0),
		S('Rally Point 1', [b(GID.rally, 1)], 0, 600, 1, 1),
		S('Activate +25% production', null),
		S('Clay Pit 1x to 2', [f(CLAY, 1, 2)], 420, 600, 1, 3),
		S('Iron Mine 1x to 2', [f(IRON, 1, 2)], 720, 600, 1, 5),
		S('Even growth: 1 of each to 2', each(2), 0, 300, 0, 0),
		S('Granary 1', [b(GID.granary, 1)], 270, 300, 1, 1),
		S('Warehouse 1', [b(GID.warehouse, 1)], 420, 300, 1, 1),
		S('Main Building 3', [b(GID.main, 3)], 555, 1200, 1, 2),
		S('Granary 3', [b(GID.granary, 3)], 790, 600, 1, 2),
		S('Marketplace 1', [b(GID.market, 1)], 340, 600, 4, 4),
		S('Marketplace 3', [b(GID.market, 3)], 990, 1200, 1, 4),
		S('All Croplands to 2', all(CROP, 2), 3325, 900, 5, 0),
		S('Embassy 1', [b(GID.embassy, 1)], 540, 1200, 5, 3),
		S('Cranny 1', [b(GID.cranny, 1)], 130, 300, 1, 0),
		S('Cranny 3', [b(GID.cranny, 3)], 380, 600, 1, 0),
		S('Wall 1', [b(WALLS, 1)], 400, 600, 1, 0),
		S('Wall 3', [b(WALLS, 3)], 1170, 1200, 1, 0),
		S('All Woodcutters to 2', all(WOOD, 2), 1995, 900, 3, 9),
		S('All Clay Pits to 2', all(CLAY, 2), 2010, 900, 3, 9),
		S('All Iron Mines to 2', all(IRON, 2), 2175, 900, 3, 15),
		S('Population 50', null, 0, 1500),
		S('Warehouse 3', [b(GID.warehouse, 3)], 1220, 600, 1, 2),
		S('Barracks 1', [b(GID.barracks, 1)], 730, 600, 1, 4),
		S('Woodcutter 1x to 4', [f(WOOD, 1, 4)], 1860, 1200, 1, 2),
		S('Cropland 1x to 4', [f(CROP, 1, 4)], 1860, 1200, 1, 0),
		S('Clay Pit 1x to 4', [f(CLAY, 1, 4)], 1870, 1200, 1, 2),
		S('Iron Mine 1x to 4', [f(IRON, 1, 4)], 2015, 1200, 1, 4),
		S('Even growth: 1 of each to 4', each(4), 0, 600, 0, 0),
		S('Cranny 6', [b(GID.cranny, 6)], 1065, 900, 1, 1),
		S('Main Building 7', [b(GID.main, 7)], 2395, 1800, 4, 6),
		S('Culture points 50/day', null, 0, 1500),
		S('Barracks 3', [b(GID.barracks, 3)], 2135, 600, 1, 4),
		S('Academy 1', [b(GID.academy, 1)], 510, 600, 5, 4),
		S('Cropland 2nd to 3', [f(CROP, 2, 3)], 695, 0, 1, 0),
		S('Smithy 1', [b(GID.smithy, 1)], 1090, 600, 2, 4),
		S('All Iron Mines to 3', all(IRON, 3), 2265, 1800, 3, 6),
		S('Population 100', null, 0, 3000),
		S('All Croplands to 3', all(CROP, 3), 2780, 1800, 4, 0),
		S('All Woodcutters to 3', all(WOOD, 3), 2085, 1800, 3, 3),
		S('All Clay Pits to 3', all(CLAY, 3), 2100, 1800, 3, 3),
		S('Cranny 10', [b(GID.cranny, 10)], 3430, 1200, 3, 4),
		S('Residence 1', [b(GID.residence, 1)], 1570, 1200, 2, 1),
		S('Marketplace 7', [b(GID.market, 7)], 4290, 1800, 6, 10),
		S('7 Crannies to 3', [b(GID.cranny, 3, 7)], 3570, 0, 14, 0),
		S('Cropland 2nd to 4', [f(CROP, 2, 4)], 1165, 0, 0, 0),
		S('Smithy 3', [b(GID.smithy, 3)], 2570, 0, 1, 4),
		S('Academy 5', [b(GID.academy, 5)], 3915, 0, 5, 8),
		S('Culture points 100/day', null, 0, 3000),
		S('Cropland 3rd to 4', [f(CROP, 3, 4)], 1165, 0, 0, 0),
		S('Stable 1', [b(GID.stable, 1)], 720, 600, 2, 5),
		S('Stable 3', [b(GID.stable, 3)], 2105, 1200, 1, 6),
		S('Population 150', null, 0, 4500),
		S('Research farm unit', null),
		S('Train 8 farm units', null, 3200, 3200, 0, 0),
		S('All resource fields to 4', allRes(4), 14280, 4800, 0, 12),
		S('All Croplands to 5', all(CROP, 5), 9725, 2700, 0, 0),
		S('Main Building 12', [b(GID.main, 12)], 9310, 2400, 11, 10),
		S('Academy 10', [b(GID.academy, 10)], 15250, 1200, 15, 15),
		S('Workshop 1', [b(GID.workshop, 1)], 1895, 2400, 4, 3),
		S('Town Hall 1', [b(GID.townhall, 1)], 4220, 2400, 6, 4),
		S('Embassy 6', [b(GID.embassy, 6)], 6015, 0, 7, 10),
		S('Culture points 150/day', null, 0, 4500),
		S('Warehouse 7', [b(GID.warehouse, 7)], 5295, 900, 2, 4),
		S('Warehouse 8', [b(GID.warehouse, 8)], 2360, 0, 0, 1),
		S('Party 1 (within 48h)', null, 20330, 2400),
		S('All Clay Pits to 5', all(CLAY, 5), 7760, 2700, 0, 4, { optional: true }),
		S('All Woodcutters to 5', all(WOOD, 5), 7780, 2700, 0, 4, { optional: true }),
		S('All Iron Mines to 5', all(IRON, 5), 8400, 2700, 0, 8, { optional: true }),
		S('Marketplace 12', [b(GID.market, 12)], 16655, 2400, 16, 15),
		S('Granary 7', [b(GID.granary, 7)], 3415, 900, 2, 4),
		S('7 Crannies to 7', [b(GID.cranny, 7, 7)], 11445, 0, 14, 14),
		S('Population 250', null, 0, 6000),
		S('Residence 3', [b(GID.residence, 3)], 4585, 2400, 1, 2),
		S('Residence 7', [b(GID.residence, 7)], 19810, 3600, 4, 4),
		S('Party 2', null, 20330),
		S('Residence 10', [b(GID.residence, 10)], 34635, 4800, 5, 3),
		S('Train settler 1', null, 19000),
		S('Party 3', null, 20330),
		S('Train settlers 2-3', null, 38000),
		S('Party 4', null, 20330),
		S('Keep 3000 of each resource to found', null, 3000),
		// Cheapest CP per resource, for when CP runs short before the parties finish.
		S('Embassy 9', [b(GID.embassy, 9)], 9295, 0, 9, 6, { optional: true }),
		S('Main Building 14', [b(GID.main, 14)], 8380, 0, 8, 4, { optional: true }),
		S('Academy 11', [b(GID.academy, 11)], 6020, 0, 5, 3, { optional: true }),
		S('Main Building 15', [b(GID.main, 15)], 6025, 0, 5, 2, { optional: true }),
		S('Embassy 10', [b(GID.embassy, 10)], 4985, 0, 4, 2, { optional: true }),
		S('Marketplace 14', [b(GID.market, 14)], 14995, 0, 12, 6, { optional: true }),
		S('Rally Point 3', [b(GID.rally, 3)], 1250, 0, 1, 2, { optional: true }),
		S('Embassy 11', [b(GID.embassy, 11)], 6375, 0, 5, 3, { optional: true }),
		S('Academy 12', [b(GID.academy, 12)], 7710, 0, 6, 3, { optional: true }),
		S('Main Building 16', [b(GID.main, 16)], 7710, 0, 6, 3, { optional: true }),
		S('Embassy 12', [b(GID.embassy, 12)], 8160, 0, 6, 3, { optional: true }),
	].map((s, i) => ({ ...s, id: i + 1 }));

	function met(item, fields, slots) {
		if (item.k === 'f') {
			const own = fields.filter((x) => x.gid === item.g);
			if (!own.length) return false;
			const n = item.n === 'all' ? own.length : item.n;
			return own.filter((x) => x.level >= item.to).length >= n;
		}
		const gids = Array.isArray(item.g) ? item.g : [item.g];
		const levels = gids.flatMap((g) => slots?.[g] || []);
		return levels.filter((l) => l >= item.to).length >= item.n;
	}

	/** Whether a step's detectable need is met. Manual steps return null. */
	function isDone(step, fields, slots) {
		if (!step.need) return null;
		return step.need.every((item) => met(item, fields || [], slots));
	}

	/**
	 * First required step the game can show, that is not done and not ticked by
	 * hand. Optional and manual steps are skipped.
	 * @param {Set<number>} [manual] step ids ticked by hand
	 */
	function nextStep(fields, slots, manual) {
		for (const s of STEPS) {
			if (s.optional || !s.need || manual?.has(s.id)) continue;
			// Building levels unknown (village centre not opened yet): skip building steps.
			if (!slots && s.need.some((item) => item.k === 'b')) continue;
			if (!isDone(s, fields || [], slots)) return s;
		}
		return null;
	}

	/** First need of the step that is not met yet. */
	function firstUnmet(step, fields, slots) {
		return step.need.find((item) => !met(item, fields || [], slots)) || null;
	}

	// Candidate closest to the target level: it finishes soonest.
	const closest = (list) => [...list].sort((a, b) => b.level - a.level || (a.slot ?? 0) - (b.slot ?? 0))[0] || null;

	/** Resource field to upgrade for an unmet field need, or null. */
	function pickField(step, item, fields) {
		if (item.n === 'all') {
			const eligible = fields.filter((field) => step.need.some((need) =>
				need.k === 'f' && need.n === 'all' && need.g === field.gid && field.level < need.to));
			return eligible.sort((a, b) => a.level - b.level || a.slot - b.slot)[0] || null;
		}
		return closest(fields.filter((field) => field.gid === item.g && field.level < item.to));
	}

	/** Existing building to upgrade for an unmet building need, or null. */
	function pickBuilding(item, buildings) {
		const gids = Array.isArray(item.g) ? item.g : [item.g];
		return closest((buildings || []).filter((x) => gids.includes(x.gid) && x.level < item.to));
	}

	/** Net resources the step costs once its task reward is cashed. */
	const netCost = (step) => step.cost - step.reward;

	/** Net resources per culture point per day, or null if the step gives none. */
	const costPerCp = (step) => (step.cp > 0 ? Math.round(netCost(step) / step.cp) : null);

	root.TravianQoLGuide4P = { STEPS, isDone, nextStep, firstUnmet, pickField, pickBuilding, netCost, costPerCp, WALLS };
})(typeof window !== 'undefined' ? window : globalThis);
