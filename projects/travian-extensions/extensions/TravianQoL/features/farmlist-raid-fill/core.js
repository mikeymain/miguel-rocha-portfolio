// Farm list bag fill: pure helpers. A raid's bag fill is its bounty divided
// by the carry capacity of the slot's troops (farm list troops cell).
(function () {
	// Carry per unit t1..t10, by the tribe id in `unit_small tribeN tM`.
	const UNIT_CARRY = {
		1: [50, 20, 50, 0, 100, 70, 0, 0, 0, 3000], // Romans
		2: [60, 40, 50, 0, 110, 80, 0, 0, 0, 3000], // Teutons
		3: [35, 45, 0, 75, 35, 65, 0, 0, 0, 3000], // Gauls
		6: [15, 50, 45, 0, 50, 70, 0, 0, 0, 3000], // Egyptians
		7: [50, 30, 0, 75, 105, 80, 0, 0, 0, 3000], // Huns
		8: [60, 0, 40, 50, 110, 80, 0, 0, 0, 3000], // Spartans
	};
	// Raids averaged per target.
	const MAX_RAIDS = 5;

	const num = (text) => parseInt(String(text ?? '').replace(/[^\d]/g, ''), 10);

	/** Carry capacity of the slot's troops, or 0 when a unit is unknown. */
	function slotCapacity(row) {
		let cap = 0;
		for (const icon of row.querySelectorAll('td.troops i.unit_small')) {
			const cls = icon.className;
			if (/\buhero\b|\bhero\b/.test(cls)) continue;
			const tribe = cls.match(/\btribe(\d+)\b/)?.[1];
			const unit = Number(cls.match(/\bt(\d+)\b/)?.[1]);
			const per = UNIT_CARRY[tribe]?.[unit - 1];
			if (per === undefined) return 0;
			const count = num(icon.parentElement?.querySelector('.value')?.textContent);
			if (count > 0) cap += per * count;
		}
		return cap;
	}

	/** The slot's last raid as { key, fill } (fill 0..1), or null. */
	function lastRaid(row) {
		const bounty = num(row.querySelector('.lastRaidBounty .value')?.textContent);
		const report = row.querySelector('.lastRaidReport');
		const time = report?.querySelector('.value')?.textContent.trim();
		if (!Number.isFinite(bounty) || !time) return null;
		const cap = slotCapacity(row);
		if (!(cap > 0)) return null;
		const reportId = (report.getAttribute('href') || '').match(/[?&]id=([^&#]+)/)?.[1];
		return { key: reportId || `${time}|${bounty}`, fill: Math.min(1, bounty / cap) };
	}

	/** List with the raid appended (last MAX_RAIDS kept); same list if already known. */
	function addRaid(list, raid, now = Date.now()) {
		if (list.some((r) => r.key === raid.key)) return list;
		return [...list, { key: raid.key, fill: raid.fill, t: now }].slice(-MAX_RAIDS);
	}

	const averageFill = (list) =>
		list.length ? list.reduce((s, r) => s + r.fill, 0) / list.length : null;

	// Travian wraps numbers in bidi marks and uses U+2212 for minus.
	const clean = (text) =>
		String(text ?? '').replace(/[‪-‮‎‏]/g, '').replace(/−/g, '-').trim();

	/** Target details shown on a farm list row, for the Farm targets tab. */
	function rowMeta(row) {
		const link = row.querySelector('td.target a');
		const href = link?.getAttribute('href') || '';
		const label = clean(link?.textContent || row.querySelector('td.target')?.textContent);
		const q = href.match(/[?&]x=(-?\d+)&(?:amp;)?y=(-?\d+)/);
		const t = label.match(/\(?(-?\d+)\|(-?\d+)\)?/);
		const coords = q || t;
		const pop = num(row.querySelector('td.population')?.textContent);
		const dist = parseFloat(clean(row.querySelector('td.distance')?.textContent).replace(',', '.'));
		const wrapper = row.closest('.farmListWrapper');
		const listIndex = wrapper ? [...row.ownerDocument.querySelectorAll('.farmListWrapper')].indexOf(wrapper) : -1;
		return {
			name: label.replace(/\s*\(?-?\d+\|-?\d+\)?\s*$/, '').trim() || label,
			listIndex: listIndex >= 0 ? listIndex : null,
			listId: row.querySelector('input[data-farm-list-id]')?.dataset.farmListId || null,
			x: coords ? Number(coords[1]) : null,
			y: coords ? Number(coords[2]) : null,
			list: clean(row.closest('.farmListWrapper')?.querySelector('.farmListName .name')?.textContent) || null,
			oasis: pop === 0,
			pop: Number.isFinite(pop) ? pop : null,
			dist: Number.isFinite(dist) ? dist : null,
			cap: slotCapacity(row) || null,
			lastBounty: num(row.querySelector('.lastRaidBounty .value')?.textContent) || 0,
			sumBounty: num(row.querySelector('.averageRaidBounty .value')?.textContent) || 0,
			disabled: row.classList.contains('disabled'),
		};
	}

	window.TravianQoLRaidFill = { UNIT_CARRY, MAX_RAIDS, slotCapacity, lastRaid, addRaid, averageFill, rowMeta };
})();
