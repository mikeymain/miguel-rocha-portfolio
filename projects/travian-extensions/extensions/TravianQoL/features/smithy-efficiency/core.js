// Smithy efficiency core: pure functions, no DOM.
// Break-even troop count for one smithy upgrade, as in Friso's Travian Tools
// ("Smithy efficiency"): the upgrade pays off once the strength it adds to
// your troops would cost more to get by training extra units.
//
//   stat(L)   = base + (base + 300 * upkeep / 7) * (1.007^L - 1)
//   main stat = attack for offensive units (and catapults), else inf + cav def
//   cost(L)   = round5((unitCost * 7 + k) / upkeep * L^0.8), k = 100/100/200/160
//   breakEven = cost(L) / (stat(L) - stat(L-1)) / (unitTotalCost / stat(L-1))
//
// Unit data: T4 (attack, def inf, def cav, upkeep, wood, clay, iron, crop).
(function (root) {
	if (root.TravianQoLSmithy) return;

	// [name, attack, defInf, defCav, upkeep, wood, clay, iron, crop]
	const TRIBES = {
		romans: [
			['Legionnaire', 40, 35, 50, 1, 120, 100, 150, 30],
			['Praetorian', 30, 65, 35, 1, 100, 130, 160, 70],
			['Imperian', 70, 40, 25, 1, 150, 160, 210, 80],
			['Equites Legati', 0, 20, 10, 2, 140, 160, 20, 40],
			['Equites Imperatoris', 120, 65, 50, 3, 550, 440, 320, 100],
			['Equites Caesaris', 180, 80, 105, 4, 550, 640, 800, 180],
			['Battering Ram', 60, 30, 75, 3, 900, 360, 500, 70],
			['Fire Catapult', 75, 60, 10, 6, 950, 1350, 600, 90],
		],
		teutons: [
			['Clubswinger', 40, 20, 5, 1, 95, 75, 40, 40],
			['Spearman', 10, 35, 60, 1, 145, 70, 85, 40],
			['Axeman', 60, 30, 30, 1, 130, 120, 170, 70],
			['Scout', 0, 10, 5, 1, 160, 100, 50, 50],
			['Paladin', 55, 100, 40, 2, 370, 270, 290, 75],
			['Teutonic Knight', 150, 50, 75, 3, 450, 515, 480, 80],
			['Ram', 65, 30, 80, 3, 1000, 300, 350, 70],
			['Catapult', 50, 60, 10, 6, 900, 1200, 600, 60],
		],
		gauls: [
			['Phalanx', 15, 40, 50, 1, 100, 130, 55, 30],
			['Swordsman', 65, 35, 20, 1, 140, 150, 185, 60],
			['Pathfinder', 0, 20, 10, 2, 170, 150, 20, 40],
			['Theutates Thunder', 100, 25, 40, 2, 350, 450, 230, 60],
			['Druidrider', 45, 115, 55, 2, 360, 330, 280, 120],
			['Haeduan', 140, 60, 165, 3, 500, 620, 675, 170],
			['Ram', 50, 30, 105, 3, 950, 555, 330, 75],
			['Trebuchet', 70, 45, 10, 6, 960, 1450, 630, 90],
		],
		egyptians: [
			['Slave Militia', 10, 30, 20, 1, 45, 60, 30, 15],
			['Ash Warden', 30, 55, 40, 1, 115, 100, 145, 60],
			['Khopesh Warrior', 65, 50, 20, 1, 170, 180, 220, 80],
			['Sopdu Explorer', 0, 20, 10, 2, 170, 150, 20, 40],
			['Anhur Guard', 50, 110, 50, 2, 360, 330, 280, 120],
			['Resheph Chariot', 110, 120, 150, 3, 450, 560, 610, 180],
			['Ram', 55, 30, 95, 3, 995, 575, 340, 80],
			['Stone Catapult', 65, 55, 10, 6, 980, 1510, 660, 100],
		],
		huns: [
			['Mercenary', 35, 40, 30, 1, 130, 80, 40, 40],
			['Bowman', 50, 30, 10, 1, 140, 110, 60, 60],
			['Spotter', 0, 20, 10, 2, 170, 150, 20, 40],
			['Steppe Rider', 120, 30, 15, 2, 290, 370, 190, 45],
			['Marksman', 110, 80, 70, 2, 320, 350, 330, 50],
			['Marauder', 180, 60, 40, 3, 450, 560, 610, 140],
			['Ram', 65, 30, 90, 3, 1060, 330, 360, 70],
			['Catapult', 45, 55, 10, 6, 950, 1280, 620, 60],
		],
	};
	// Game unit ids u1..u80: first id of each tribe's block.
	const TRIBE_BASE = { 1: 'romans', 11: 'teutons', 21: 'gauls', 51: 'egyptians', 61: 'huns' };
	const GROWTH = 1.007;
	const COST_K = [100, 100, 200, 160];
	const LAST_OFFENSIVE_INDEX = 6; // index > 6 (catapults) always uses attack

	const roundTo5 = (v) => Math.round(v / 5) * 5;

	/** Unit record for game id N (the "uN" class), or null if unknown. */
	function unitById(id) {
		const base = Math.floor((id - 1) / 10) * 10 + 1;
		const tribe = TRIBE_BASE[base];
		const row = tribe && TRIBES[tribe][id - base];
		if (!row) return null;
		const [name, attack, defInf, defCav, upkeep, ...cost] = row;
		return { id, index: id - base, tribe, name, attack, defInf, defCav, upkeep, cost };
	}

	function statAt(base, upkeep, level) {
		return base + (base + (300 * upkeep) / 7) * (GROWTH ** level - 1);
	}

	/** Attack for offensive units, else infantry + cavalry defence. */
	function mainStat(unit, level) {
		const attack = statAt(unit.attack, unit.upkeep, level);
		const def = statAt(unit.defInf, unit.upkeep, level) + statAt(unit.defCav, unit.upkeep, level);
		return attack > def || unit.index > LAST_OFFENSIVE_INDEX ? attack : def;
	}

	/** Resources for the smithy upgrade to `level`: [wood, clay, iron, crop]. */
	function upgradeCost(unit, level) {
		return unit.cost.map((c, i) => roundTo5(((c * 7 + COST_K[i]) / unit.upkeep) * level ** 0.8));
	}

	/**
	 * Units needed for the upgrade to `level` to pay off.
	 * @param {object} unit from unitById
	 * @param {number} level target smithy level (1-20)
	 * @param {number} [cost] actual total cost if read from the page
	 */
	function breakEven(unit, level, cost) {
		const total = cost ?? upgradeCost(unit, level).reduce((a, b) => a + b, 0);
		const prevStat = mainStat(unit, level - 1);
		const gain = mainStat(unit, level) - prevStat;
		const unitTotal = unit.cost.reduce((a, b) => a + b, 0);
		if (gain <= 0 || prevStat <= 0) return Infinity;
		return Math.round(total / gain / (unitTotal / prevStat));
	}

	root.TravianQoLSmithy = { unitById, mainStat, upgradeCost, breakEven, TRIBES };
})(typeof window !== 'undefined' ? window : globalThis);
