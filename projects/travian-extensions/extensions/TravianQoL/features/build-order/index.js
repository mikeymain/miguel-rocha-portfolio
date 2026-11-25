// Build order.
// On the resources view (dorf1), marks the resource field with the best
// payback as the next upgrade: it glows, and the next steps get numbered
// badges. The step list and the per-village production bonus live in the
// QoL settings "Build order" tab; this script saves each village's field
// levels there and re-ranks when the bonus changes.
// Ranking: features/build-order/core.js.
//
// Compliance note: read-only DOM change plus extension storage. No clicks,
// no network calls.
(function () {
	const STEPS = 5;
	const DEBOUNCE_MS = 150;
	// Per-host { villageId: [wood, clay, iron, crop] bonus % }.
	const BONUS_PREFIX = 'travianQoL.buildOrder.';
	// Per-host { villageId: { name, fields: [{slot, gid, level}], updatedAt } }.
	const FIELDS_PREFIX = 'travianQoL.buildFields.';
	const STYLE_ID = 'tqol-bo-style';
	const ORDER_ATTR = 'tqolBo';
	const CSS = `
#resourceFieldContainer a.resourceField[data-tqol-bo]::after {
	content: attr(data-tqol-bo);
	position: absolute; right: -4px; top: -4px; z-index: 3;
	min-width: 16px; height: 16px; padding: 0 3px; box-sizing: border-box;
	border-radius: 8px; background: #2b2b2b; color: #ffd75e;
	font: bold 11px/16px sans-serif; text-align: center; pointer-events: none;
}
#resourceFieldContainer a.resourceField[data-tqol-bo="1"] .labelLayer {
	box-shadow: 0 0 0 2px #ffd75e, 0 0 10px 4px rgba(255, 200, 40, .85);
	animation: tqol-bo-glow 1.4s ease-in-out infinite alternate;
}
#resourceFieldContainer a.resourceField[data-tqol-bo="1"]::after { background: #ffd75e; color: #2b2b2b; }
@keyframes tqol-bo-glow {
	from { box-shadow: 0 0 0 2px #ffd75e, 0 0 6px 2px rgba(255, 200, 40, .6); }
	to   { box-shadow: 0 0 0 2px #ffd75e, 0 0 16px 7px rgba(255, 200, 40, 1); }
}
@media (prefers-reduced-motion: reduce) {
	#resourceFieldContainer a.resourceField[data-tqol-bo="1"] .labelLayer { animation: none; }
}
`;

	let observer = null;
	let storageListener = null;
	let debounceTimer = null;
	let bonuses = [0, 0, 0, 0];
	let lastSnapshot = '';

	const isResourcesPage = () => /^\/(dorf1\.php|resources)$/.test(location.pathname);
	const bonusKey = () => BONUS_PREFIX + location.host;
	const fieldsKey = () => FIELDS_PREFIX + location.host;

	function activeVillage() {
		return document.querySelector('.villageList .listEntry.active, #sidebarBoxVillageList .listEntry.active');
	}
	function villageId() {
		return activeVillage()?.dataset?.did || 'default';
	}
	function villageName() {
		const el = activeVillage();
		const name = el?.querySelector('.name')?.textContent || el?.textContent || '';
		return name.replace(/[‪-‮‎‏⁦-⁩]/g, '').replace(/\s+/g, ' ').trim() || 'Village';
	}

	/** Resource fields with their effective level (queued upgrades counted). */
	function readFields() {
		const out = [];
		for (const a of document.querySelectorAll('#resourceFieldContainer a.resourceField')) {
			const cls = a.className;
			const slot = Number(cls.match(/\bbuildingSlot(\d+)\b/)?.[1]);
			const gid = Number(cls.match(/\bgid(\d)\b/)?.[1]);
			const level = Number(cls.match(/\blevel(\d+)\b/)?.[1]);
			if (!slot || !gid || !Number.isFinite(level)) continue;
			out.push({ el: a, slot, gid, level: level + (a.classList.contains('underConstruction') ? 1 : 0) });
		}
		return out;
	}

	function injectStyle() {
		if (document.getElementById(STYLE_ID)) return;
		const style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = CSS;
		document.head.appendChild(style);
	}

	// Field levels for the settings tab; written only when they change.
	function saveSnapshot(fields) {
		const id = villageId();
		const entry = { name: villageName(), fields: fields.map(({ slot, gid, level }) => ({ slot, gid, level })) };
		const sig = id + JSON.stringify(entry);
		if (sig === lastSnapshot) return;
		lastSnapshot = sig;
		const key = fieldsKey();
		chrome.storage.local.get(key, (res) => {
			const all = { ...(res[key] || {}), [id]: { ...entry, updatedAt: Date.now() } };
			chrome.storage.local.set({ [key]: all });
		});
	}

	function render() {
		if (!isResourcesPage()) return;
		const fields = readFields();
		if (!fields.length) return;
		saveSnapshot(fields);
		const steps = window.TravianQoLBuildOrder.plan(fields, bonuses, STEPS);
		injectStyle();
		const firstStep = new Map();
		steps.forEach((s, i) => { if (!firstStep.has(s.slot)) firstStep.set(s.slot, i + 1); });
		for (const f of fields) {
			const n = firstStep.get(f.slot);
			if (n && f.el.dataset[ORDER_ATTR] !== String(n)) f.el.dataset[ORDER_ATTR] = String(n);
			else if (!n && f.el.dataset[ORDER_ATTR]) delete f.el.dataset[ORDER_ATTR];
		}
	}

	function schedule() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(render, DEBOUNCE_MS);
	}

	function applyBonuses(all) {
		const saved = all?.[villageId()];
		bonuses = Array.isArray(saved) && saved.length === 4 ? saved.map((v) => Number(v) || 0) : [0, 0, 0, 0];
	}

	function start() {
		const key = bonusKey();
		chrome.storage.local.get(key, (res) => {
			applyBonuses(res[key]);
			render();
			const container = document.getElementById('resourceFieldContainer') || document.body;
			observer = new MutationObserver(schedule);
			observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
		});
		// Bonus edited in the settings tab: re-rank the highlighted fields.
		storageListener = (changes, area) => {
			if (area !== 'local' || !changes[key]) return;
			applyBonuses(changes[key].newValue);
			render();
		};
		chrome.storage.onChanged?.addListener(storageListener);
	}

	window.TravianQoL.register({
		id: 'build-order',
		label: 'Build order',
		description: 'Highlights the resource field with the best payback and numbers the next upgrades. Steps and production bonuses are in the Build order tab.',
		init() {
			if (!isResourcesPage()) return;
			if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
			else start();
		},
		destroy() {
			observer?.disconnect();
			observer = null;
			if (storageListener) chrome.storage.onChanged?.removeListener(storageListener);
			storageListener = null;
			clearTimeout(debounceTimer);
			debounceTimer = null;
			lastSnapshot = '';
			document.getElementById(STYLE_ID)?.remove();
			document.querySelectorAll('[data-tqol-bo]').forEach((el) => delete el.dataset[ORDER_ATTR]);
		},
	});
})();
