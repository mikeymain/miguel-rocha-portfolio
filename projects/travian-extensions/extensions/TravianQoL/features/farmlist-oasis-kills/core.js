// Farm list oasis kills: pure helpers. Animals killed come from the raid's
// report page: the defender (nature) table's dead row. Report links come from
// the farm list (last raid) and from the oasis tile's report list, which
// lists every raid on the tile.
(function () {
	const NATURE_NAMES = ['Rat', 'Spider', 'Snake', 'Bat', 'Wild boar', 'Wolf', 'Bear', 'Crocodile', 'Tiger', 'Elephant'];
	const WINDOW_MS = 60 * 60 * 1000;
	const SEEN_KEEP = 40;

	const num = (text) => parseInt(String(text ?? '').replace(/[^\d]/g, ''), 10);
	// Travian wraps numbers in bidi marks and uses U+2212 for minus.
	const cleanCoord = (text) => String(text ?? '').replace(/[‪-‮‎‏]/g, '').replace(/−/g, '-');

	// Population 0 marks an oasis in any game language; villages never have 0.
	const isOasisRow = (row) => num(row.querySelector('td.population')?.textContent) === 0;

	/** Report href of the slot's last raid, or null. */
	const reportHref = (row) => row.querySelector('a.lastRaidReport')?.getAttribute('href') || null;

	/** Report id from a report href, or null. */
	const reportId = (href) => (href || '').match(/[?&]id=([^&#]+)/)?.[1] || null;

	/** Target coordinates { x, y } of a farm list row, or null. */
	function rowCoords(row) {
		const href = row.querySelector('td.target a[href]')?.getAttribute('href') || '';
		const q = href.match(/[?&]x=(-?\d+)&(?:amp;)?y=(-?\d+)/);
		if (q) return { x: Number(q[1]), y: Number(q[2]) };
		const t = cleanCoord(row.querySelector('td.target')?.textContent).match(/\((-?\d+)\|(-?\d+)\)/);
		return t ? { x: Number(t[1]), y: Number(t[2]) } : null;
	}

	/** "25.11.26, 16:09" (DD.MM.YY, HH:MM) as a local timestamp, or null. */
	function parseTravianDate(text) {
		const m = String(text || '').match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})[\s,]+(\d{1,2}):(\d{2})/);
		if (!m) return null;
		const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
		const ts = new Date(year, Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5])).getTime();
		return Number.isFinite(ts) ? ts : null;
	}

	/** Reports listed on an oasis tile: [{ id, href, at }], newest first as listed. */
	function parseTileReports(root) {
		const out = [];
		for (const a of root.querySelectorAll('a[href*="report?id="]')) {
			const href = a.getAttribute('href');
			const id = reportId(href);
			const at = parseTravianDate(a.textContent);
			if (id && at && !out.some((r) => r.id === id)) out.push({ id, href, at });
		}
		return out;
	}

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

	/** Entry with the report marked seen and, when given, its kills added at `at`. */
	function addReport(entry, id, kills, at = Date.now(), now = Date.now()) {
		const seen = [...(entry?.seen || []).filter((s) => s !== id), id].slice(-SEEN_KEEP);
		const recent = (entry?.kills || []).filter((k) => now - k.t < WINDOW_MS);
		return { ...entry, seen, kills: kills ? [...recent, { t: at, n: kills }] : recent };
	}

	/** Kills per species in the last hour, or null when no raid was read in it. */
	function killsLastHour(entry, now = Date.now()) {
		const recent = (entry?.kills || []).filter((k) => now - k.t < WINDOW_MS);
		if (recent.length === 0) return null;
		return recent.reduce((sum, k) => sum.map((v, i) => v + (k.n[i] || 0)), Array(10).fill(0));
	}

	window.TravianQoLOasisKills = {
		NATURE_NAMES, WINDOW_MS, isOasisRow, reportHref, reportId, rowCoords,
		parseTravianDate, parseTileReports, parseKills, addReport, killsLastHour,
	};
})();
