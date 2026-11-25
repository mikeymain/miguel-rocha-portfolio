// Build order tab of the options page. Loaded after options.js.
// Field levels come from features/build-order (saved on each village's
// resources view); bonuses are shared with it, so edits here re-rank the
// highlighted fields in open Travian tabs.
(function initBuildOrderTab() {
	const FIELDS_PREFIX = 'travianQoL.buildFields.';
	const BONUS_PREFIX = 'travianQoL.buildOrder.';
	const PICK_KEY = 'travianQoL.buildOrder.pick';
	const STEPS = 10;
	const RES_NAMES = ['Lumber', 'Clay', 'Iron', 'Crop'];
	const MAX_BONUS = 500;

	const root = document.getElementById('bo-root');
	const select = document.getElementById('bo-village');
	const planner = window.TravianQoLBuildOrder;
	if (!root || !select || !planner) return;

	let villages = []; // { value, host, id, name, fields, updatedAt }
	let bonusStore = {}; // host -> { villageId: [4] }

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text != null) node.textContent = text;
		return node;
	}

	function formatHours(h) {
		return h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
	}

	function formatAge(ms) {
		const min = Math.round((Date.now() - ms) / 60000);
		if (min < 60) return `${Math.max(min, 0)}m ago`;
		const h = Math.round(min / 60);
		return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
	}

	const shortHost = (host) => host.replace(/\.travian\.[a-z.]+$/i, '');

	async function load() {
		const all = await chrome.storage.local.get(null);
		villages = [];
		bonusStore = {};
		for (const [key, value] of Object.entries(all)) {
			if (key.startsWith(FIELDS_PREFIX)) {
				const host = key.slice(FIELDS_PREFIX.length);
				for (const [id, v] of Object.entries(value || {})) {
					if (Array.isArray(v?.fields) && v.fields.length) {
						villages.push({ value: `${host}|${id}`, host, id, name: v.name || id, fields: v.fields, updatedAt: v.updatedAt || 0 });
					}
				}
			} else if (key.startsWith(BONUS_PREFIX) && key !== PICK_KEY) {
				bonusStore[key.slice(BONUS_PREFIX.length)] = value || {};
			}
		}
		villages.sort((a, b) => a.host.localeCompare(b.host) || a.name.localeCompare(b.name));
		return all[PICK_KEY];
	}

	function fillSelect(pick) {
		select.innerHTML = '';
		const multiHost = new Set(villages.map((v) => v.host)).size > 1;
		for (const v of villages) {
			const opt = el('option', null, multiHost ? `${v.name} · ${shortHost(v.host)}` : v.name);
			opt.value = v.value;
			select.appendChild(opt);
		}
		select.disabled = villages.length === 0;
		const latest = [...villages].sort((a, b) => b.updatedAt - a.updatedAt)[0];
		select.value = villages.some((v) => v.value === pick) ? pick : latest?.value || '';
	}

	const current = () => villages.find((v) => v.value === select.value);

	function bonusesFor(v) {
		const saved = bonusStore[v.host]?.[v.id];
		return Array.isArray(saved) && saved.length === 4 ? saved.map((n) => Number(n) || 0) : [0, 0, 0, 0];
	}

	function saveBonuses(v, bonuses) {
		const key = BONUS_PREFIX + v.host;
		bonusStore[v.host] = { ...(bonusStore[v.host] || {}), [v.id]: bonuses };
		chrome.storage.local.set({ [key]: bonusStore[v.host] }, flash);
	}

	// options.js owns the header save indicator; pulse it here too.
	function flash() {
		const status = document.getElementById('save-status');
		status?.classList.add('is-saving');
		setTimeout(() => status?.classList.remove('is-saving'), 600);
	}

	function buildBonusCard(v, bonuses, onChange) {
		const card = el('section', 'card lc-card bo__bonus');
		const head = el('div', 'lc-card__head');
		head.appendChild(el('span', 'lc-card__title', 'Production bonus'));
		card.appendChild(head);
		let current = bonuses;
		RES_NAMES.forEach((name, i) => {
			const row = el('label', 'lc-line');
			row.appendChild(el('span', 'lc-line__label', name));
			const wrap = el('span', 'bo__pct');
			const input = document.createElement('input');
			input.type = 'number';
			input.min = '0';
			input.max = String(MAX_BONUS);
			input.step = '5';
			input.className = 'lc-num';
			input.value = String(bonuses[i]);
			input.setAttribute('aria-label', `${name} bonus %`);
			input.addEventListener('change', () => {
				const value = Math.min(MAX_BONUS, Math.max(0, Math.round(Number(input.value) || 0)));
				input.value = String(value);
				current = current.map((b, j) => (j === i ? value : b));
				saveBonuses(v, current);
				onChange(current);
			});
			wrap.append(input, el('span', null, '%'));
			row.appendChild(wrap);
			card.appendChild(row);
		});
		return card;
	}

	function buildStepsCard(v, bonuses) {
		const card = el('section', 'card lc-card bo__steps');
		const head = el('div', 'lc-card__head');
		head.appendChild(el('span', 'lc-card__title', 'Next upgrades'));
		head.appendChild(el('span', 'bo__age', `Fields read ${formatAge(v.updatedAt)}`));
		card.appendChild(head);
		const steps = planner.plan(v.fields, bonuses, STEPS);
		if (!steps.length) {
			card.appendChild(el('div', 'bo__empty', 'All resource fields are at the maximum level.'));
			return card;
		}
		const table = el('table', 'bo__table');
		const thead = el('thead');
		const hr = el('tr');
		['#', 'Field', 'Level', 'Cost', 'Payback (x1)'].forEach((h) => hr.appendChild(el('th', null, h)));
		thead.appendChild(hr);
		const tbody = el('tbody');
		steps.forEach((s, i) => {
			const tr = el('tr', i === 0 ? 'is-next' : null);
			tr.append(
				el('td', 'bo__n', String(i + 1)),
				el('td', null, s.name),
				el('td', 'bo__lvl', `${s.from} → ${s.to}`),
				el('td', 'bo__num', s.cost.toLocaleString()),
				el('td', 'bo__num', formatHours(s.payback)),
			);
			tbody.appendChild(tr);
		});
		table.append(thead, tbody);
		card.appendChild(table);
		return card;
	}

	function render() {
		root.innerHTML = '';
		const v = current();
		if (!v) {
			root.appendChild(el('div', 'bo__empty card', 'Open a village\'s resources view in Travian to load its fields.'));
			return;
		}
		let steps = buildStepsCard(v, bonusesFor(v));
		const bonus = buildBonusCard(v, bonusesFor(v), (next) => {
			const fresh = buildStepsCard(v, next);
			steps.replaceWith(fresh);
			steps = fresh;
		});
		root.append(bonus, steps);
	}

	select.addEventListener('change', () => {
		chrome.storage.local.set({ [PICK_KEY]: select.value });
		render();
	});

	// Field snapshots arrive while the popup is open: refresh in place.
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local') return;
		if (!Object.keys(changes).some((k) => k.startsWith(FIELDS_PREFIX))) return;
		const keep = select.value;
		load().then(() => {
			fillSelect(keep);
			render();
		});
	});

	load().then((pick) => {
		fillSelect(pick);
		render();
	});
})();
