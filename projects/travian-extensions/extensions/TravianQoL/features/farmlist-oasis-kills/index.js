// Farm list oasis kills. For oasis targets, shows the animals killed in the
// past hour before the bounty sum, read from each raid's report page.
//
// No raid is missed: besides the farm list's last raid, every oasis raided in
// the last 2 hours has its tile report list checked every 15-20 minutes on
// any game page (the tile lists every raid on it), and unread reports from
// the last hour are read. All requests go one at a time with randomised
// waits and pause while the tab is hidden.
(function () {
	const STORE_KEY = 'travianQoL.oasisKills';
	const START_MS = [4000, 9000];
	const GAP_MS = [2000, 6000];
	const SWEEP_TICK_MS = [60000, 120000];
	const TILE_CHECK_MS = [15 * 60000, 20 * 60000];
	const ACTIVE_FOR_MS = 2 * 60 * 60000; // keep checking an oasis this long after its last raid
	const MAX_QUEUE = 60;
	const SCAN_DELAY_MS = 300;
	const BADGE_CLASS = 'tqol-oasis-kills';

	let store = {};
	let loaded = false;
	let running = false;
	let stopped = false;
	let observer = null;
	let scanTimer = null;
	let sweepTimer = null;
	let storageListener = null;
	const queue = [];
	const queued = new Set();
	const added = new Set();

	const k = () => window.TravianQoLOasisKills;
	const rand = ([min, max]) => min + Math.random() * (max - min);
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const isFarmListPage = () =>
		/^\/(build\.php|building)$/.test(location.pathname) && /\btt=99\b/.test(location.search);

	function save() {
		chrome.storage.local.set({ [STORE_KEY]: store });
	}

	function update(id, change) {
		store = { ...store, [id]: { ...(store[id] || { seen: [], kills: [] }), ...change } };
	}

	function waitVisible() {
		return new Promise((resolve) => {
			const onChange = () => {
				if (document.hidden) return;
				document.removeEventListener('visibilitychange', onChange);
				resolve();
			};
			document.addEventListener('visibilitychange', onChange);
		});
	}

	function enqueue(job, dedupeKey) {
		if (queued.has(dedupeKey) || queue.length >= MAX_QUEUE) return;
		queue.push({ ...job, dedupeKey });
		queued.add(dedupeKey);
		runQueue();
	}

	/** Kills from a report page; null when unreadable or not an oasis report. */
	async function fetchKills(href) {
		try {
			const url = new URL(href, location.origin);
			if (url.origin !== location.origin) return null;
			const res = await fetch(url.href, { credentials: 'include' });
			const landed = new URL(res.url || url.href, location.origin).pathname;
			if (!res.ok || !landed.startsWith('/report')) return null;
			return k().parseKills(new DOMParser().parseFromString(await res.text(), 'text/html'));
		} catch {
			return null;
		}
	}

	/** Reports on an oasis tile, from the map's own tile-details call; null on failure. */
	async function fetchTileReports(x, y) {
		try {
			const res = await fetch(`${location.origin}/api/v1/map/tile-details`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
				body: JSON.stringify({ x, y }),
			});
			if (!res.ok) return null;
			const html = (await res.json())?.html;
			if (typeof html !== 'string') return null;
			return k().parseTileReports(new DOMParser().parseFromString(html, 'text/html'));
		} catch {
			return null;
		}
	}

	async function runJob(job) {
		if (job.kind === 'report') {
			const kills = await fetchKills(job.href);
			store = { ...store, [job.id]: k().addReport(store[job.id], job.reportId, kills, job.at) };
			save();
			scheduleScan();
			return;
		}
		const reports = await fetchTileReports(job.x, job.y);
		if (!reports) return;
		const now = Date.now();
		const entry = store[job.id] || { seen: [], kills: [] };
		const newest = reports.reduce((m, r) => Math.max(m, r.at), entry.raidAt || 0);
		update(job.id, { raidAt: newest });
		save();
		for (const r of reports) {
			if (now - r.at >= k().WINDOW_MS || entry.seen.includes(r.id)) continue;
			enqueue({ kind: 'report', id: job.id, reportId: r.id, href: r.href, at: r.at }, r.id);
		}
	}

	async function runQueue() {
		if (running || stopped) return;
		running = true;
		try {
			await sleep(rand(START_MS));
			while (queue.length && !stopped) {
				if (document.hidden) {
					await waitVisible();
					await sleep(rand(START_MS));
					continue;
				}
				const job = queue.shift();
				await runJob(job);
				queued.delete(job.dedupeKey);
				if (queue.length) await sleep(rand(GAP_MS));
			}
		} finally {
			running = false;
		}
	}

	// Picks one raided oasis whose tile list is due and queues its check.
	function sweep() {
		if (stopped) return;
		sweepTimer = setTimeout(sweep, rand(SWEEP_TICK_MS));
		if (!loaded || document.hidden) return;
		const now = Date.now();
		const due = Object.entries(store)
			.filter(([id, e]) =>
				id.startsWith(`${location.hostname}|`) &&
				Number.isFinite(e.x) && Number.isFinite(e.y) &&
				now - (e.raidAt || 0) < ACTIVE_FOR_MS &&
				now - (e.tileAt || 0) > rand(TILE_CHECK_MS))
			.sort((a, b) => (a[1].tileAt || 0) - (b[1].tileAt || 0));
		if (!due.length) return;
		const [id, e] = due[0];
		// Claim it in storage first so another tab does not check it too.
		update(id, { tileAt: now });
		save();
		enqueue({ kind: 'tile', id, x: e.x, y: e.y }, `tile:${id}`);
	}

	function setIfChanged(obj, prop, value) {
		if (obj[prop] !== value) obj[prop] = value;
	}

	function render(row, entry) {
		const wrapper = row.querySelector('.lastRaidWrapper');
		if (!wrapper) return;
		const existing = wrapper.querySelector(`:scope > .${BADGE_CLASS}`);
		const kills = k().killsLastHour(entry);
		if (!kills) {
			existing?.remove();
			return;
		}
		let el = existing;
		if (!el) {
			const avgEl = wrapper.querySelector(':scope > .averageRaidBounty');
			if (!avgEl) return;
			el = document.createElement('div');
			el.className = BADGE_CLASS;
			// Same box as the bounty sum next to it.
			const cs = getComputedStyle(avgEl);
			el.style.display = cs.display;
			el.style.alignItems = cs.alignItems;
			el.style.columnGap = cs.columnGap;
			el.style.marginLeft = cs.marginLeft;
			el.style.marginRight = cs.marginRight;
			const icon = document.createElement('img');
			icon.src = '/img/x.gif';
			icon.alt = '';
			const value = document.createElement('span');
			value.className = 'value';
			el.append(icon, value);
			avgEl.before(el);
			added.add(el);
		}
		const total = kills.reduce((a, b) => a + b, 0);
		const top = kills.indexOf(Math.max(...kills));
		setIfChanged(el.firstChild, 'className', `unit u${31 + top}`);
		setIfChanged(el.lastChild, 'textContent', String(total));
		const detail = kills
			.map((n, i) => (n ? `${k().NATURE_NAMES[i]} ${n}` : null))
			.filter(Boolean)
			.join(' · ');
		setIfChanged(el, 'title', detail || '0');
	}

	function scan() {
		if (!loaded || !k()) return;
		const host = location.hostname;
		const now = Date.now();
		let changed = false;
		for (const row of document.querySelectorAll('table.slots tr.slot')) {
			if (!k().isOasisRow(row)) continue;
			const slotId = row.querySelector('input[data-slot-id]')?.dataset.slotId;
			if (!slotId) continue;
			const id = `${host}|${slotId}`;
			const href = k().reportHref(row);
			const reportId = k().reportId(href);
			const entry = store[id];
			const coords = k().rowCoords(row);
			if (coords && (entry?.x !== coords.x || entry?.y !== coords.y)) {
				update(id, coords);
				changed = true;
			}
			if (reportId && !entry?.seen?.length) {
				// First sight: the current report is the baseline; the tile check
				// reads the raids from the last hour with their own times.
				store = { ...store, [id]: { ...k().addReport(store[id], reportId, null), raidAt: now } };
				changed = true;
			} else if (reportId && !entry.seen.includes(reportId)) {
				update(id, { raidAt: now });
				changed = true;
				enqueue({ kind: 'report', id, reportId, href, at: now }, reportId);
			}
			render(row, store[id]);
		}
		if (changed) save();
	}

	// Throttle, not debounce: the farm list re-renders constantly.
	function scheduleScan() {
		if (scanTimer || !isFarmListPage()) return;
		scanTimer = setTimeout(() => {
			scanTimer = null;
			scan();
		}, SCAN_DELAY_MS);
	}

	window.TravianQoL.register({
		id: 'farmlist-oasis-kills',
		label: 'Farm list oasis kills',
		description: 'Animals killed at each oasis in the past hour, before the bounty sum. Reads oasis raid reports in the background.',
		init() {
			if (!/\.travian\.com$/.test(location.hostname)) return;
			stopped = false;
			chrome.storage.local.get(STORE_KEY, (res) => {
				store = res?.[STORE_KEY] || {};
				loaded = true;
				if (isFarmListPage()) scan();
			});
			storageListener = (changes, area) => {
				if (area === 'local' && changes[STORE_KEY]) store = changes[STORE_KEY].newValue || {};
			};
			chrome.storage.onChanged.addListener(storageListener);
			sweepTimer = setTimeout(sweep, rand(SWEEP_TICK_MS));
			if (isFarmListPage()) {
				observer = new MutationObserver(scheduleScan);
				observer.observe(document.getElementById('content') || document.body, { childList: true, subtree: true });
			}
		},
		destroy() {
			stopped = true;
			queue.length = 0;
			queued.clear();
			observer?.disconnect();
			observer = null;
			clearTimeout(scanTimer);
			scanTimer = null;
			clearTimeout(sweepTimer);
			sweepTimer = null;
			if (storageListener) chrome.storage.onChanged.removeListener?.(storageListener);
			storageListener = null;
			added.forEach((el) => el.remove());
			added.clear();
			loaded = false;
		},
	});
})();
