// Build order.
// On the resources view (dorf1), marks the resource field with the best
// payback as the next upgrade: it glows, and the next steps get numbered
// badges. A panel under the production table lists the steps and takes this
// village's production bonus per resource (oases + mill/sawmill etc.).
// Ranking: features/build-order/core.js.
//
// Compliance note: read-only DOM change plus extension storage. No clicks,
// no network calls.
(function () {
	const STEPS = 5;
	const DEBOUNCE_MS = 150;
	const STORAGE_PREFIX = 'travianQoL.buildOrder.';
	const STYLE_ID = 'tqol-bo-style';
	const PANEL_ID = 'tqol-bo-panel';
	const ORDER_ATTR = 'tqolBo';
	const RES_ICONS = ['r1', 'r2', 'r3', 'r4'];
	const RES_NAMES = ['Lumber', 'Clay', 'Iron', 'Crop'];
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
#${PANEL_ID} { margin-top: 10px; font-size: 12px; text-align: left; color: inherit; }
#${PANEL_ID} h4 { margin: 0 0 4px; font-size: 13px; font-weight: bold; color: inherit; }
#${PANEL_ID} .tqol-bo-bonus { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 4px; }
#${PANEL_ID} .tqol-bo-bonus label { display: flex; align-items: center; gap: 1px; }
#${PANEL_ID} .tqol-bo-bonus input { width: 100%; min-width: 0; padding: 1px 2px; font-size: 11px; }
#${PANEL_ID} ol { margin: 0; padding-left: 16px; }
#${PANEL_ID} li { line-height: 18px; white-space: nowrap; text-align: left; }
#${PANEL_ID} li span { opacity: .7; }
`;

	let observer = null;
	let debounceTimer = null;
	let bonuses = [0, 0, 0, 0];

	const isResourcesPage = () => /^\/(dorf1\.php|resources)$/.test(location.pathname);
	const storageKey = () => STORAGE_PREFIX + location.host;

	function villageId() {
		const entry = document.querySelector('.villageList .listEntry.active, #sidebarBoxVillageList .listEntry.active');
		return entry?.dataset?.did || 'default';
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

	function formatHours(h) {
		if (h < 48) return `${Math.round(h)}h`;
		return `${Math.round(h / 24)}d`;
	}

	function saveBonuses() {
		const key = storageKey();
		chrome.storage.local.get(key, (res) => {
			const all = { ...(res[key] || {}), [villageId()]: bonuses };
			chrome.storage.local.set({ [key]: all });
		});
	}

	function buildPanel() {
		const panel = document.createElement('div');
		panel.id = PANEL_ID;
		const title = document.createElement('h4');
		title.textContent = 'Build order · bonus %';
		const row = document.createElement('div');
		row.className = 'tqol-bo-bonus';
		RES_ICONS.forEach((icon, i) => {
			const label = document.createElement('label');
			label.title = `${RES_NAMES[i]} bonus %`;
			const ico = document.createElement('i');
			ico.className = icon;
			const input = document.createElement('input');
			input.type = 'number';
			input.min = '0';
			input.max = '500';
			input.step = '5';
			input.dataset.res = String(i);
			input.setAttribute('aria-label', `${RES_NAMES[i]} bonus %`);
			label.append(ico, input);
			row.append(label);
		});
		row.addEventListener('change', (e) => {
			const input = e.target.closest('input[data-res]');
			if (!input) return;
			const value = Math.min(500, Math.max(0, Number(input.value) || 0));
			input.value = String(value);
			bonuses = bonuses.map((b, i) => (i === Number(input.dataset.res) ? value : b));
			saveBonuses();
			render();
		});
		const list = document.createElement('ol');
		panel.append(title, row, list);
		return panel;
	}

	function ensurePanel() {
		let panel = document.getElementById(PANEL_ID);
		if (panel) return panel;
		const anchor = document.getElementById('production');
		if (!anchor) return null;
		panel = buildPanel();
		anchor.after(panel);
		return panel;
	}

	function render() {
		if (!isResourcesPage()) return;
		const fields = readFields();
		if (!fields.length) return;
		const steps = window.TravianQoLBuildOrder.plan(fields, bonuses, STEPS);
		injectStyle();
		const firstStep = new Map();
		steps.forEach((s, i) => { if (!firstStep.has(s.slot)) firstStep.set(s.slot, i + 1); });
		for (const f of fields) {
			const n = firstStep.get(f.slot);
			if (n && f.el.dataset[ORDER_ATTR] !== String(n)) f.el.dataset[ORDER_ATTR] = String(n);
			else if (!n && f.el.dataset[ORDER_ATTR]) delete f.el.dataset[ORDER_ATTR];
		}

		const panel = ensurePanel();
		if (!panel) return;
		panel.querySelectorAll('input[data-res]').forEach((input) => {
			const v = String(bonuses[Number(input.dataset.res)]);
			if (document.activeElement !== input && input.value !== v) input.value = v;
		});
		const list = panel.querySelector('ol');
		const key = JSON.stringify(steps);
		if (list.dataset.key === key) return;
		list.dataset.key = key;
		list.replaceChildren(...steps.map((s) => {
			const li = document.createElement('li');
			const info = document.createElement('span');
			info.textContent = ` ${formatHours(s.payback)}`;
			li.title = `Cost ${s.cost.toLocaleString()} · payback ${formatHours(s.payback)} at speed 1`;
			li.append(`${s.name} ${s.from} → ${s.to}`, info);
			return li;
		}));
	}

	function schedule() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(render, DEBOUNCE_MS);
	}

	function start() {
		const key = storageKey();
		chrome.storage.local.get(key, (res) => {
			const saved = res[key]?.[villageId()];
			if (Array.isArray(saved) && saved.length === 4) bonuses = saved.map((v) => Number(v) || 0);
			render();
			const container = document.getElementById('resourceFieldContainer') || document.body;
			observer = new MutationObserver(schedule);
			observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
		});
	}

	window.TravianQoL.register({
		id: 'build-order',
		label: 'Build order',
		description: 'Highlights the resource field with the best payback and numbers the next upgrades.',
		init() {
			if (!isResourcesPage()) return;
			if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
			else start();
		},
		destroy() {
			observer?.disconnect();
			observer = null;
			clearTimeout(debounceTimer);
			debounceTimer = null;
			document.getElementById(PANEL_ID)?.remove();
			document.getElementById(STYLE_ID)?.remove();
			document.querySelectorAll('[data-tqol-bo]').forEach((el) => delete el.dataset[ORDER_ATTR]);
		},
	});
})();
