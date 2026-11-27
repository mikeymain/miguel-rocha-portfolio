// Farm targets tab: one row per farm list target, joining the details the
// farm list page records (farmlist-raid-fill) with its bag fill history and,
// for oases, the animals killed in the past hour (farmlist-oasis-kills).
(function () {
	const TARGETS_KEY = 'travianQoL.farmTargets';
	const FILL_KEY = 'travianQoL.raidFill';
	const KILLS_KEY = 'travianQoL.oasisKills';
	const HOST_KEY = 'travianQoL.farmTargets.host';
	const SORT_KEY = 'travianQoL.farmTargets.sort';
	const LOW_FILL = 0.3;

	// Remembered sort and server; storage can be unavailable, so never required.
	function readPref(key) {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	}
	function writePref(key, value) {
		try {
			localStorage.setItem(key, value);
		} catch {
			/* not remembered */
		}
	}

	const COLUMNS = [
		{ key: 'name', label: 'Target' },
		{ key: 'list', label: 'List' },
		{ key: 'type', label: 'Type' },
		{ key: 'dist', label: 'Dist', num: true },
		{ key: 'cap', label: 'Carry', num: true },
		{ key: 'lastBounty', label: 'Last', num: true },
		{ key: 'sumBounty', label: 'Sum', num: true },
		{ key: 'fill', label: 'Bag fill', num: true },
		{ key: 'raids', label: 'Raids', num: true },
		{ key: 'kills', label: 'Kills 1h', num: true },
		{ key: 'seenAt', label: 'Updated', num: true },
	];

	/** Table rows for one server, from the three stores. */
	function buildRows(targets, fills, kills, host, now = Date.now()) {
		const fill = window.TravianQoLRaidFill;
		const oasisKills = window.TravianQoLOasisKills;
		return Object.entries(targets || {})
			.filter(([id]) => id.startsWith(`${host}|`))
			.map(([id, t]) => {
				const raids = fills?.[id] || [];
				const killed = t.oasis ? oasisKills?.killsLastHour(kills?.[id], now) : null;
				return {
					id,
					...t,
					type: t.oasis ? 'Oasis' : 'Village',
					fill: fill.averageFill(raids),
					fills: raids.map((r) => r.fill),
					raids: raids.length,
					kills: killed ? killed.reduce((a, b) => a + b, 0) : null,
				};
			});
	}

	function sortRows(rows, { key, dir }) {
		const sign = dir === 'desc' ? -1 : 1;
		return [...rows].sort((a, b) => {
			const av = a[key];
			const bv = b[key];
			// Missing values always go last.
			if (av == null && bv == null) return 0;
			if (av == null) return 1;
			if (bv == null) return -1;
			return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * sign;
		});
	}

	const ago = (ms) => {
		const m = Math.round(ms / 60000);
		if (m < 60) return `${m}m`;
		const h = Math.round(m / 60);
		return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
	};
	const fmt = (v) => (v == null ? '–' : v.toLocaleString());

	function cell(row, key, host, now) {
		const td = document.createElement('td');
		if (key === 'name') {
			const a = document.createElement('a');
			a.textContent = row.name;
			if (row.x != null) {
				a.href = `https://${host}/karte.php?x=${row.x}&y=${row.y}`;
				a.target = '_blank';
				a.rel = 'noopener';
				const coords = document.createElement('span');
				coords.className = 'ft__coords';
				coords.textContent = `${row.x}|${row.y}`;
				td.append(a, coords);
			} else td.append(a);
			return td;
		}
		const col = COLUMNS.find((c) => c.key === key);
		if (col.num) td.className = 'ft__num';
		if (key === 'fill') {
			td.textContent = row.fill == null ? '–' : `${Math.round(row.fill * 100)}%`;
			if (row.fill != null && row.fill < LOW_FILL) td.classList.add('is-low');
			td.title = row.fills.map((f) => `${Math.round(f * 100)}%`).join(' · ');
		} else if (key === 'dist') td.textContent = row.dist == null ? '–' : row.dist.toFixed(1);
		else if (key === 'seenAt') td.textContent = ago(now - row.seenAt);
		else if (key === 'kills') td.textContent = row.oasis ? fmt(row.kills ?? 0) : '–';
		else td.textContent = typeof row[key] === 'number' ? fmt(row[key]) : row[key] ?? '–';
		return td;
	}

	async function init() {
		const root = document.getElementById('ft-root');
		const hostSelect = document.getElementById('ft-server');
		const countEl = document.getElementById('ft-count');
		if (!root || !hostSelect) return;
		let sort = { key: 'fill', dir: 'asc' };
		try {
			sort = JSON.parse(readPref(SORT_KEY)) || sort;
		} catch {
			/* keep the default sort */
		}
		let data = await chrome.storage.local.get([TARGETS_KEY, FILL_KEY, KILLS_KEY]);

		function render() {
			const now = Date.now();
			const hosts = [...new Set(Object.keys(data[TARGETS_KEY] || {}).map((id) => id.split('|')[0]))].sort();
			const chosen = hosts.includes(hostSelect.value) ? hostSelect.value : readPref(HOST_KEY);
			hostSelect.replaceChildren(...hosts.map((h) => new Option(h, h)));
			hostSelect.value = hosts.includes(chosen) ? chosen : hosts[0] || '';
			const host = hostSelect.value;
			const rows = sortRows(buildRows(data[TARGETS_KEY], data[FILL_KEY], data[KILLS_KEY], host, now), sort);
			countEl.textContent = rows.length ? `${rows.length} targets` : '';
			if (!rows.length) {
				const empty = document.createElement('p');
				empty.className = 'ft__empty';
				empty.textContent = 'Open the Farm List page with its lists expanded to record targets.';
				root.replaceChildren(empty);
				return;
			}
			const table = document.createElement('table');
			table.className = 'ft__table';
			const head = table.createTHead().insertRow();
			for (const col of COLUMNS) {
				const th = document.createElement('th');
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.textContent = col.label;
				if (sort.key === col.key) {
					th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
					btn.textContent += sort.dir === 'asc' ? ' ▲' : ' ▼';
				}
				btn.addEventListener('click', () => {
					sort = { key: col.key, dir: sort.key === col.key && sort.dir === 'asc' ? 'desc' : 'asc' };
					writePref(SORT_KEY, JSON.stringify(sort));
					render();
				});
				if (col.num) th.className = 'ft__num';
				th.append(btn);
				head.append(th);
			}
			const body = table.createTBody();
			for (const row of rows) {
				const tr = body.insertRow();
				if (row.disabled) tr.className = 'is-disabled';
				for (const col of COLUMNS) tr.append(cell(row, col.key, host, now));
			}
			root.replaceChildren(table);
		}

		hostSelect.addEventListener('change', () => {
			writePref(HOST_KEY, hostSelect.value);
			render();
		});
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area !== 'local') return;
			if (![TARGETS_KEY, FILL_KEY, KILLS_KEY].some((key) => changes[key])) return;
			data = { ...data };
			for (const key of [TARGETS_KEY, FILL_KEY, KILLS_KEY]) {
				if (changes[key]) data[key] = changes[key].newValue;
			}
			render();
		});
		render();
	}

	window.TravianQoLFarmTargets = { buildRows, sortRows };
	if (document.getElementById('ft-root')) init();
})();
