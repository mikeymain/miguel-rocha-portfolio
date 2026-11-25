// Trade routes in the production table.
// On the marketplace "Trade routes" tab, reads each expanded route group
// (resources per departure, one row per daily departure) and stores the daily
// totals per source -> target village. On the resources page, each
// "Production per hour" value becomes the net production after routes
// (incoming minus outgoing for the active village); hovering it shows the
// game's production and the trade-route change. Rendering lives in core.js
// and normally runs from early.js before the page is shown.
//
// Collapsed route groups have no rows in the page, so their last stored
// totals are kept. Open a group once to capture or refresh it.
//
// Compliance note: read-only DOM reads plus chrome.storage.local. No clicks,
// no network calls.
(function () {
	const STORAGE_PREFIX = 'travianQoL.tradeRoutes.';
	const RESOURCE_COUNT = 4;
	const RESOURCE_CLASSES = ['lumber', 'clay', 'iron', 'crop'];
	const DEBOUNCE_MS = 300;

	let observer = null;
	let debounceTimer = null;

	const core = window.TravianQoLTradeRoutes;
	const { storageKey, activeVillageId, parseNum } = core;

	/** Resource index 0-3 from an icon such as <i class="lumber_small">. */
	function resourceIndex(icon) {
		const cls = icon?.className || '';
		return RESOURCE_CLASSES.findIndex((name) => cls.includes(name));
	}

	/** Daily totals [w, c, i, cr] of one expanded route group. */
	function groupDailyTotals(group) {
		const totals = [0, 0, 0, 0];
		group.querySelectorAll('tbody td.resources').forEach((cell) => {
			cell.querySelectorAll('.value').forEach((valueEl, pos) => {
				const idx = resourceIndex(valueEl.parentElement?.querySelector('i'));
				const value = parseNum(valueEl.textContent);
				if (value === null) return;
				const slot = idx >= 0 ? idx : pos;
				if (slot < RESOURCE_COUNT) totals[slot] += value;
			});
		});
		return totals;
	}

	/** Route groups on the trade routes tab: [{ targetDid, name, perDay|null }]. */
	function readRouteGroups(doc = document) {
		const out = [];
		doc.querySelectorAll('#tradeRoutes .tradeRouteCollection').forEach((group) => {
			const link = group.querySelector('.headline a');
			if (!link) return;
			let targetDid = null;
			try {
				targetDid = new URL(link.getAttribute('href') || '', location.href).searchParams.get('newdid');
			} catch (_) {
				return;
			}
			if (!targetDid) return;
			// A collapsed group has no form/rows: null keeps the stored totals.
			const expanded = !!group.querySelector('form');
			out.push({
				targetDid,
				name: (link.textContent || '').trim(),
				perDay: expanded ? groupDailyTotals(group) : null,
			});
		});
		return out;
	}

	/** New stored routes for one source village, or null if nothing changed. */
	function mergeSource(prevSource, groups) {
		const prevTargets = prevSource?.targets || {};
		const targets = {};
		for (const g of groups) {
			const perDay = g.perDay || prevTargets[g.targetDid]?.perDay;
			if (!perDay) continue;
			targets[g.targetDid] = { name: g.name, perDay };
		}
		if (JSON.stringify(targets) === JSON.stringify(prevTargets)) return null;
		return { targets, updatedAt: Date.now() };
	}

	function captureRoutes() {
		const sourceDid = activeVillageId();
		if (!sourceDid || !document.getElementById('tradeRoutes')) return;
		const groups = readRouteGroups();
		const key = storageKey();
		chrome.storage.local.get(key, (res) => {
			if (chrome.runtime?.lastError) return;
			const all = res?.[key] || {};
			const next = mergeSource(all[sourceDid], groups);
			if (!next) return;
			const updated = { ...all, [sourceDid]: next };
			if (!Object.keys(next.targets).length) delete updated[sourceDid];
			chrome.storage.local.set({ [key]: updated });
		});
	}

	function renderProduction() {
		// early.js normally rendered already; this covers a live re-enable.
		if (core.isApplied()) return core.reveal();
		const key = storageKey();
		chrome.storage.local.get(key, (res) => {
			try {
				if (!chrome.runtime?.lastError) core.apply(res?.[key]);
			} finally {
				core.reveal();
			}
		});
	}

	window.TravianQoL.register({
		id: 'trade-route-production',
		label: 'Trade routes in production table',
		description: 'Production per hour shows net production after trade routes; hover a value for the breakdown. Open each trade route group on the marketplace once to record it.',
		// Exposed for tests.
		_internals: { groupDailyTotals, readRouteGroups, mergeSource },
		init() {
			const routes = document.getElementById('tradeRoutes');
			if (routes) {
				captureRoutes();
				// Expanding a group renders its rows: capture them then.
				observer = new MutationObserver(() => {
					clearTimeout(debounceTimer);
					debounceTimer = setTimeout(captureRoutes, DEBOUNCE_MS);
				});
				observer.observe(routes, { childList: true, subtree: true });
			} else if (core.isResourcesPage()) {
				renderProduction();
			}
		},
		destroy() {
			observer?.disconnect();
			observer = null;
			clearTimeout(debounceTimer);
			debounceTimer = null;
			core.removeCells();
			core.reveal();
		},
	});
})();
