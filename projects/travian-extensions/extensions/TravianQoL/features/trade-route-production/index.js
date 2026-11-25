// Trade routes in the production table.
// On the marketplace "Trade routes" tab, reads each expanded route group
// (resources per departure, one row per daily departure) and stores the daily
// totals per source -> target village. On the resources page, each
// "Production per hour" value becomes the net production after routes
// (incoming minus outgoing for the active village); hovering it shows the
// game's production and the trade-route change.
//
// Collapsed route groups have no rows in the page, so their last stored
// totals are kept. Open a group once to capture or refresh it.
//
// Compliance note: read-only DOM reads plus chrome.storage.local. No clicks,
// no network calls.
(function () {
	const STORAGE_PREFIX = 'travianQoL.tradeRoutes.';
	const HOURS_PER_DAY = 24;
	const RESOURCE_COUNT = 4;
	const RESOURCE_CLASSES = ['lumber', 'clay', 'iron', 'crop'];
	const NET_CLASS = 'tqol-tr-net';
	const STYLE_ID = 'tqol-tr-style';
	const DEBOUNCE_MS = 300;
	const CSS = `#production .${NET_CLASS} { cursor: help; }`;

	let observer = null;
	let debounceTimer = null;
	// Production cell -> its original child nodes, restored on destroy.
	const originals = new Map();

	const storageKey = () => STORAGE_PREFIX + location.host;

	function activeVillageId(doc = document) {
		const entry = doc.querySelector(
			'.villageList .listEntry.active, #sidebarBoxVillageList .listEntry.active'
		);
		return entry?.dataset?.did || null;
	}

	function parseNum(text) {
		const cleaned = String(text ?? '')
			.replace(/[‪-‮‎‏]/g, '')
			.replace(/[−‒–]/g, '-')
			.replace(/[^\d-]/g, '');
		const value = parseInt(cleaned, 10);
		return Number.isFinite(value) ? value : null;
	}

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

	/** Trade-route balance per hour [w, c, i, cr] for `did`: incoming - outgoing. */
	function balancePerHour(all, did) {
		const daily = [0, 0, 0, 0];
		for (const [sourceDid, source] of Object.entries(all || {})) {
			for (const [targetDid, route] of Object.entries(source?.targets || {})) {
				if (sourceDid === targetDid) continue;
				const sign = targetDid === did ? 1 : sourceDid === did ? -1 : 0;
				if (!sign) continue;
				for (let i = 0; i < RESOURCE_COUNT; i++) daily[i] += sign * (route.perDay?.[i] || 0);
			}
		}
		return daily.map((v) => Math.round(v / HOURS_PER_DAY));
	}

	function formatSigned(value) {
		if (value > 0) return `+${value}`;
		if (value < 0) return `−${Math.abs(value)}`;
		return '0';
	}

	function injectStyle() {
		if (document.getElementById(STYLE_ID)) return;
		const style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = CSS;
		(document.head || document.documentElement).appendChild(style);
	}

	function removeCells() {
		for (const [cell, nodes] of originals) cell.replaceChildren(...nodes);
		originals.clear();
	}

	/** Show net production in each row; hover shows production and route change. */
	function applyToTable(balance) {
		const rows = [...document.querySelectorAll('#production tbody tr')].slice(0, RESOURCE_COUNT);
		if (rows.length < RESOURCE_COUNT) return;
		removeCells();
		if (balance.every((v) => v === 0)) return;
		injectStyle();
		rows.forEach((row, i) => {
			const cell = row.querySelector('td.num');
			const prod = parseNum(cell?.textContent);
			if (prod === null) return;
			const delta = balance[i];
			originals.set(cell, [...cell.childNodes]);
			const span = document.createElement('span');
			span.className = NET_CLASS;
			span.textContent = String(prod + delta);
			span.title = `Production ${prod}, trade routes ${formatSigned(delta)}`;
			cell.replaceChildren(span);
		});
	}

	function renderProduction() {
		const did = activeVillageId();
		if (!did || !document.getElementById('production')) return;
		const key = storageKey();
		chrome.storage.local.get(key, (res) => {
			if (chrome.runtime?.lastError) return;
			applyToTable(balancePerHour(res?.[key], did));
		});
	}

	const isResourcesPage = () => /^\/(dorf1\.php|resources)$/.test(location.pathname);

	window.TravianQoL.register({
		id: 'trade-route-production',
		label: 'Trade routes in production table',
		description: 'Production per hour shows net production after trade routes; hover a value for the breakdown. Open each trade route group on the marketplace once to record it.',
		// Exposed for tests.
		_internals: { parseNum, groupDailyTotals, readRouteGroups, mergeSource, balancePerHour, formatSigned },
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
			} else if (isResourcesPage()) {
				renderProduction();
			}
		},
		destroy() {
			observer?.disconnect();
			observer = null;
			clearTimeout(debounceTimer);
			debounceTimer = null;
			removeCells();
			document.getElementById(STYLE_ID)?.remove();
		},
	});
})();
