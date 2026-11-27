// Farm list bag fill. In each target's last raid cell, before the bounty sum,
// shows the average bag fill of the target's last raids (red below 30%).
// Raids are recorded as they appear on the farm list page.
//
// Compliance note: pure read + DOM annotation. No clicks, no fetches.
(function () {
	const STORE_KEY = 'travianQoL.raidFill';
	const STALE_MS = 30 * 24 * 60 * 60 * 1000; // drop targets not seen for 30 days
	const LOW_FILL = 0.3;
	const LOW_COLOR = '#e05555';
	const SCAN_DELAY_MS = 300;
	const BADGE_CLASS = 'tqol-raid-fill';

	// Farm list target details, read by the Farm targets settings tab:
	// `${host}|${slotId}` -> rowMeta() + seenAt.
	const TARGETS_KEY = 'travianQoL.farmTargets';

	let history = {};
	let targets = {};
	let loaded = false;
	let observer = null;
	let scanTimer = null;
	let storageListener = null;
	const added = new Set();

	const core = () => window.TravianQoLRaidFill;
	const isFarmListPage = () =>
		/^\/(build\.php|building)$/.test(location.pathname) && /\btt=99\b/.test(location.search);

	function createBadge(avgEl) {
		const el = document.createElement('div');
		el.className = BADGE_CLASS;
		// Same box as the bounty sum next to it.
		const cs = getComputedStyle(avgEl);
		el.style.display = cs.display;
		el.style.alignItems = cs.alignItems;
		el.style.columnGap = cs.columnGap;
		el.style.marginLeft = cs.marginLeft;
		el.style.marginRight = cs.marginRight;
		const value = document.createElement('span');
		value.className = 'value';
		el.append(document.createElement('i'), value);
		avgEl.before(el);
		added.add(el);
		return el;
	}

	// Writes only what changed, so the page observer is not re-triggered.
	function setIfChanged(obj, prop, value) {
		if (obj[prop] !== value) obj[prop] = value;
	}

	function render(row, list) {
		const wrapper = row.querySelector('.lastRaidWrapper');
		if (!wrapper) return;
		const existing = wrapper.querySelector(`:scope > .${BADGE_CLASS}`);
		const avg = core().averageFill(list);
		if (avg === null) {
			existing?.remove();
			return;
		}
		const avgEl = wrapper.querySelector(':scope > .averageRaidBounty');
		const el = existing || (avgEl && createBadge(avgEl));
		if (!el) return;
		const icon = avg >= 0.99 ? 'bounty_full_small' : avg > 0 ? 'bounty_half_small' : 'bounty_empty_small';
		setIfChanged(el.firstChild, 'className', icon);
		setIfChanged(el.lastChild, 'textContent', `${Math.round(avg * 100)}%`);
		setIfChanged(el.lastChild.style, 'color', avg < LOW_FILL ? LOW_COLOR : '');
		setIfChanged(el, 'title', list.map((r) => `${Math.round(r.fill * 100)}%`).join(' · '));
	}

	function prune(all, now) {
		return Object.fromEntries(
			Object.entries(all).filter(([, list]) => list.length && now - list[list.length - 1].t < STALE_MS),
		);
	}

	// Target details change rarely; a target already saved is refreshed at most
	// this often when nothing else about it changed.
	const TARGET_REFRESH_MS = 60 * 60 * 1000;
	const sameMeta = (a, b) => !!a && Object.keys(b).every((key) => a[key] === b[key]);

	function scan() {
		if (!loaded || !core()) return;
		const host = location.hostname;
		const now = Date.now();
		let next = history;
		let nextTargets = targets;
		for (const row of document.querySelectorAll('table.slots tr.slot')) {
			const slotId = row.querySelector('input[data-slot-id]')?.dataset.slotId;
			if (!slotId) continue;
			const id = `${host}|${slotId}`;
			const prev = next[id] || [];
			const raid = core().lastRaid(row);
			const list = raid ? core().addRaid(prev, raid) : prev;
			if (list !== prev) next = { ...next, [id]: list };
			const meta = core().rowMeta(row);
			const old = nextTargets[id];
			if (!sameMeta(old, meta) || now - (old.seenAt || 0) > TARGET_REFRESH_MS) {
				nextTargets = { ...nextTargets, [id]: { ...meta, seenAt: now } };
			}
			render(row, list);
		}
		if (next !== history) {
			history = prune(next, now);
			chrome.storage.local.set({ [STORE_KEY]: history });
		}
		if (nextTargets !== targets) {
			targets = Object.fromEntries(Object.entries(nextTargets).filter(([, t]) => now - t.seenAt < STALE_MS));
			chrome.storage.local.set({ [TARGETS_KEY]: targets });
		}
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
		id: 'farmlist-raid-fill',
		label: 'Farm list bag fill',
		description: 'Average bag fill of each target\'s last 5 raids, before the bounty sum. Red below 30%.',
		init() {
			if (!isFarmListPage()) return;
			chrome.storage.local.get([STORE_KEY, TARGETS_KEY], (res) => {
				history = res?.[STORE_KEY] || {};
				targets = res?.[TARGETS_KEY] || {};
				loaded = true;
				scan();
			});
			storageListener = (changes, area) => {
				if (area !== 'local') return;
				if (changes[STORE_KEY]) history = changes[STORE_KEY].newValue || {};
				if (changes[TARGETS_KEY]) targets = changes[TARGETS_KEY].newValue || {};
			};
			chrome.storage.onChanged.addListener(storageListener);
			observer = new MutationObserver(scheduleScan);
			observer.observe(document.getElementById('content') || document.body, { childList: true, subtree: true });
		},
		destroy() {
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
