// Farm list oasis kills. For oasis targets, shows the animals killed in the
// past hour before the bounty sum. Kills are read from each new raid's report
// page in the background while the farm list is open: one request at a time,
// randomised start and gaps, paused while the tab is hidden. A slot's report
// that is already there when the page opens is not fetched.
(function () {
	const STORE_KEY = 'travianQoL.oasisKills';
	const START_MS = [4000, 9000];
	const GAP_MS = [2000, 6000];
	const MAX_QUEUE = 40;
	const SCAN_DELAY_MS = 300;
	const BADGE_CLASS = 'tqol-oasis-kills';

	let store = {};
	let loaded = false;
	let running = false;
	let stopped = false;
	let observer = null;
	let scanTimer = null;
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

	async function runQueue() {
		if (running) return;
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
				const kills = await fetchKills(job.href);
				queued.delete(job.reportId);
				if (stopped) break;
				store = { ...store, [job.id]: k().addReport(store[job.id], job.reportId, kills) };
				save();
				scheduleScan();
				if (queue.length) await sleep(rand(GAP_MS));
			}
		} finally {
			running = false;
		}
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
		let changed = false;
		for (const row of document.querySelectorAll('table.slots tr.slot')) {
			if (!k().isOasisRow(row)) continue;
			const slotId = row.querySelector('input[data-slot-id]')?.dataset.slotId;
			if (!slotId) continue;
			const id = `${host}|${slotId}`;
			const href = k().reportHref(row);
			const reportId = k().reportId(href);
			const entry = store[id];
			if (reportId && !entry) {
				// First sight: the current report is the baseline, not fetched.
				store = { ...store, [id]: k().addReport(null, reportId, null) };
				changed = true;
			} else if (reportId && !entry.seen.includes(reportId) && !queued.has(reportId) && queue.length < MAX_QUEUE) {
				queue.push({ id, reportId, href });
				queued.add(reportId);
			}
			render(row, store[id]);
		}
		if (changed) save();
		if (queue.length) runQueue();
	}

	// Throttle, not debounce: the farm list re-renders constantly.
	function scheduleScan() {
		if (scanTimer) return;
		scanTimer = setTimeout(() => {
			scanTimer = null;
			scan();
		}, SCAN_DELAY_MS);
	}

	window.TravianQoL.register({
		id: 'farmlist-oasis-kills',
		label: 'Farm list oasis kills',
		description: 'Animals killed at each oasis in the past hour, before the bounty sum. Reads each new oasis raid report in the background while the farm list is open.',
		init() {
			if (!isFarmListPage()) return;
			stopped = false;
			chrome.storage.local.get(STORE_KEY, (res) => {
				store = res?.[STORE_KEY] || {};
				loaded = true;
				scan();
			});
			storageListener = (changes, area) => {
				if (area === 'local' && changes[STORE_KEY]) store = changes[STORE_KEY].newValue || {};
			};
			chrome.storage.onChanged.addListener(storageListener);
			observer = new MutationObserver(scheduleScan);
			observer.observe(document.getElementById('content') || document.body, { childList: true, subtree: true });
		},
		destroy() {
			stopped = true;
			queue.length = 0;
			queued.clear();
			observer?.disconnect();
			observer = null;
			clearTimeout(scanTimer);
			scanTimer = null;
			if (storageListener) chrome.storage.onChanged.removeListener?.(storageListener);
			storageListener = null;
			added.forEach((el) => el.remove());
			added.clear();
			loaded = false;
		},
	});
})();
