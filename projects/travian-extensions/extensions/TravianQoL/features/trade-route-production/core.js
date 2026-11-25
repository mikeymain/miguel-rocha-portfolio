// Shared trade-route helpers for early.js (document_start) and index.js
// (document_idle). Both content-script entries load this file; the guard
// keeps one instance so the saved original cells survive the second load.
window.TravianQoLTradeRoutes = window.TravianQoLTradeRoutes || (function () {
	const STORAGE_PREFIX = 'travianQoL.tradeRoutes.';
	const HOURS_PER_DAY = 24;
	const RESOURCE_COUNT = 4;
	const NET_CLASS = 'tqol-tr-net';
	const HIDE_STYLE_ID = 'tqol-tr-hide';
	const STYLE_ID = 'tqol-tr-style';
	const CSS = `#production .${NET_CLASS} { cursor: help; }`;

	// Production cell -> its original child nodes, restored on removeCells().
	const originals = new Map();

	const storageKey = () => STORAGE_PREFIX + location.host;
	const isResourcesPage = () => /^\/(dorf1\.php|resources)$/.test(location.pathname);

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

	function formatSigned(value) {
		if (value > 0) return `+${value}`;
		if (value < 0) return `−${Math.abs(value)}`;
		return '0';
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

	/** The four production value cells, once all of them hold a number. */
	function productionCells(doc = document) {
		const cells = [...doc.querySelectorAll('#production tbody tr td.num')].slice(0, RESOURCE_COUNT);
		if (cells.length < RESOURCE_COUNT) return null;
		return cells.every((c) => originals.has(c) || parseNum(c.textContent) !== null) ? cells : null;
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
		document.getElementById(STYLE_ID)?.remove();
	}

	/** Remove the style that hides the production values until they are final. */
	function reveal() {
		document.getElementById(HIDE_STYLE_ID)?.remove();
	}

	/**
	 * Show net production in each row; hover shows production and route
	 * change. Returns false when the table or village is not parsed yet.
	 */
	function apply(routes) {
		const did = activeVillageId();
		const cells = productionCells();
		if (!did || !cells) return false;
		const balance = balancePerHour(routes, did);
		removeCells();
		if (balance.every((v) => v === 0)) return true;
		injectStyle();
		cells.forEach((cell, i) => {
			const prod = parseNum(cell.textContent);
			if (prod === null) return;
			const delta = balance[i];
			originals.set(cell, [...cell.childNodes]);
			const span = document.createElement('span');
			span.className = NET_CLASS;
			span.textContent = String(prod + delta);
			span.title = `Production ${prod}, trade routes ${formatSigned(delta)}`;
			cell.replaceChildren(span);
		});
		return true;
	}

	const isProductionPage = () => location.pathname === '/production';

	/** Duration to fill `capacity` from 0 at `perHour`, e.g. "2d 3h 10m"; "Never" when not growing. */
	function formatFillTime(capacity, perHour) {
		if (!(capacity > 0)) return null;
		if (!(perHour > 0)) return 'Never';
		const minutes = Math.ceil((capacity / perHour) * 60);
		const days = Math.floor(minutes / 1440);
		const hours = Math.floor((minutes % 1440) / 60);
		const mins = minutes % 60;
		return [days && `${days}d`, (days || hours) && `${hours}h`, `${mins}m`].filter(Boolean).join(' ');
	}

	return {
		HIDE_STYLE_ID,
		isProductionPage,
		formatFillTime,
		storageKey,
		isResourcesPage,
		activeVillageId,
		parseNum,
		formatSigned,
		balancePerHour,
		apply,
		removeCells,
		reveal,
		isApplied: () => originals.size > 0,
	};
})();
