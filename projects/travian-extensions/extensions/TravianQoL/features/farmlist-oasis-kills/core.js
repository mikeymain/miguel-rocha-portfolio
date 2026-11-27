// Farm list oasis kills: pure helpers. Animals killed come from the raid's
// report page: the defender (nature) table's dead row.
(function () {
	const NATURE_NAMES = ['Rat', 'Spider', 'Snake', 'Bat', 'Wild boar', 'Wolf', 'Bear', 'Crocodile', 'Tiger', 'Elephant'];
	const WINDOW_MS = 60 * 60 * 1000;
	const SEEN_KEEP = 10;

	const num = (text) => parseInt(String(text ?? '').replace(/[^\d]/g, ''), 10);

	// Population 0 marks an oasis in any game language; villages never have 0.
	const isOasisRow = (row) => num(row.querySelector('td.population')?.textContent) === 0;

	/** Report href of the slot's last raid, or null. */
	const reportHref = (row) => row.querySelector('a.lastRaidReport')?.getAttribute('href') || null;

	/** Report id from a report href, or null. */
	const reportId = (href) => (href || '').match(/[?&]id=([^&#]+)/)?.[1] || null;

	/**
	 * Animals killed per species [u31..u40] from a report document, or null
	 * when it is not an oasis report.
	 */
	function parseKills(doc) {
		const table = [...doc.querySelectorAll('table')].find((t) => t.querySelector('tbody.units img.unit.u31'));
		if (!table) return null;
		const row = table.querySelector('tbody.units i.troopDead_small')?.closest('tr');
		const cells = row ? [...row.querySelectorAll('td.unit')] : [];
		return Array.from({ length: 10 }, (_, i) => num(cells[i]?.textContent) || 0);
	}

	/** Entry with the report marked seen and, when given, its kills added. */
	function addReport(entry, id, kills, now = Date.now()) {
		const seen = [...(entry?.seen || []).filter((s) => s !== id), id].slice(-SEEN_KEEP);
		const recent = (entry?.kills || []).filter((k) => now - k.t < WINDOW_MS);
		return { seen, kills: kills ? [...recent, { t: now, n: kills }] : recent };
	}

	/** Kills per species in the last hour, or null when no raid was read in it. */
	function killsLastHour(entry, now = Date.now()) {
		const recent = (entry?.kills || []).filter((k) => now - k.t < WINDOW_MS);
		if (recent.length === 0) return null;
		return recent.reduce((sum, k) => sum.map((v, i) => v + (k.n[i] || 0)), Array(10).fill(0));
	}

	window.TravianQoLOasisKills = {
		NATURE_NAMES, WINDOW_MS, isOasisRow, reportHref, reportId, parseKills, addReport, killsLastHour,
	};
})();
