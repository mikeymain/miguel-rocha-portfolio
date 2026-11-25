// Build order tab of the options page. Loaded after options.js.
// Field levels come from features/build-order (saved on each village's
// resources view); bonuses are shared with it, so edits here re-rank the
// highlighted fields in open Travian tabs.
(function initBuildOrderTab() {
	const FIELDS_PREFIX = 'travianQoL.buildFields.';
	const BONUS_PREFIX = 'travianQoL.buildOrder.';
	const PICK_KEY = 'travianQoL.buildOrder.pick';
	// Per-host { villageId: { oases: [type x3], extra: [4] } }. The summed
	// bonus is also written to BONUS_PREFIX, which the in-game highlight reads.
	const SETUP_PREFIX = 'travianQoL.buildOasis.';
	const STEPS = 10;
	const RES_NAMES = ['Lumber', 'Clay', 'Iron', 'Crop'];
	const MAX_BONUS = 500;
	const OASIS_SLOTS = 3;
	// Travian oasis types: bonus % per [lumber, clay, iron, crop].
	const OASES = {
		'': { label: 'None', bonus: [0, 0, 0, 0] },
		l25: { label: 'Lumber 25%', bonus: [25, 0, 0, 0] },
		c25: { label: 'Clay 25%', bonus: [0, 25, 0, 0] },
		i25: { label: 'Iron 25%', bonus: [0, 0, 25, 0] },
		f25: { label: 'Crop 25%', bonus: [0, 0, 0, 25] },
		f50: { label: 'Crop 50%', bonus: [0, 0, 0, 50] },
		lf: { label: 'Lumber 25% + Crop 25%', bonus: [25, 0, 0, 25] },
		cf: { label: 'Clay 25% + Crop 25%', bonus: [0, 25, 0, 25] },
		if: { label: 'Iron 25% + Crop 25%', bonus: [0, 0, 25, 25] },
	};

	const root = document.getElementById('bo-root');
	const select = document.getElementById('bo-village');
	const planner = window.TravianQoLBuildOrder;
	if (!root || !select || !planner) return;

	let villages = []; // { value, host, id, name, fields, updatedAt }
	let bonusStore = {}; // host -> { villageId: [4] }
	let setupStore = {}; // host -> { villageId: { oases, extra } }

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
		setupStore = {};
		for (const [key, value] of Object.entries(all)) {
			if (key.startsWith(SETUP_PREFIX)) {
				setupStore[key.slice(SETUP_PREFIX.length)] = value || {};
			} else if (key.startsWith(FIELDS_PREFIX)) {
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

	const clampPct = (n) => Math.min(MAX_BONUS, Math.max(0, Math.round(Number(n) || 0)));

	// Oases + building bonus for a village. A bonus saved before oasis pickers
	// existed becomes the building part, so nothing entered is lost.
	function setupFor(v) {
		const s = setupStore[v.host]?.[v.id];
		if (s && Array.isArray(s.oases) && Array.isArray(s.extra)) {
			return {
				oases: Array.from({ length: OASIS_SLOTS }, (_, i) => (s.oases[i] in OASES ? s.oases[i] : '')),
				extra: [0, 1, 2, 3].map((i) => clampPct(s.extra[i])),
			};
		}
		const old = bonusStore[v.host]?.[v.id];
		const extra = Array.isArray(old) && old.length === 4 ? old.map(clampPct) : [0, 0, 0, 0];
		return { oases: Array(OASIS_SLOTS).fill(''), extra };
	}

	function totalBonus(setup) {
		return [0, 1, 2, 3].map((r) => setup.extra[r] + setup.oases.reduce((sum, t) => sum + OASES[t].bonus[r], 0));
	}

	function saveSetup(v, setup) {
		setupStore[v.host] = { ...(setupStore[v.host] || {}), [v.id]: setup };
		bonusStore[v.host] = { ...(bonusStore[v.host] || {}), [v.id]: totalBonus(setup) };
		chrome.storage.local.set({
			[SETUP_PREFIX + v.host]: setupStore[v.host],
			[BONUS_PREFIX + v.host]: bonusStore[v.host],
		}, flash);
	}

	// options.js owns the header save indicator; pulse it here too.
	function flash() {
		const status = document.getElementById('save-status');
		status?.classList.add('is-saving');
		setTimeout(() => status?.classList.remove('is-saving'), 600);
	}

	function oasisSelect(value, index, onPick) {
		const sel = el('select', 'select');
		sel.setAttribute('aria-label', `Oasis ${index + 1}`);
		for (const [key, o] of Object.entries(OASES)) {
			const opt = el('option', null, o.label);
			opt.value = key;
			sel.appendChild(opt);
		}
		sel.value = value;
		sel.addEventListener('change', () => onPick(sel.value));
		return sel;
	}

	function pctInput(value, label, onSet) {
		const input = document.createElement('input');
		input.type = 'number';
		input.min = '0';
		input.max = String(MAX_BONUS);
		input.step = '5';
		input.className = 'lc-num';
		input.value = String(value);
		input.setAttribute('aria-label', label);
		input.addEventListener('change', () => {
			input.value = String(clampPct(input.value));
			onSet(Number(input.value));
		});
		return input;
	}

	// Friso-style: three oasis pickers, plus editable building bonus %.
	function buildBonusCard(v, onChange) {
		const card = el('section', 'card lc-card bo__bonus');
		const head = el('div', 'lc-card__head');
		head.appendChild(el('span', 'lc-card__title', 'Production bonus'));
		card.appendChild(head);
		let setup = setupFor(v);
		const totals = el('div', 'bo__totals');

		function update(next) {
			setup = next;
			saveSetup(v, setup);
			paintTotals();
			onChange(totalBonus(setup));
		}
		function paintTotals() {
			totals.innerHTML = '';
			totalBonus(setup).forEach((pct, r) => {
				const cell = el('span', pct > 0 ? 'is-set' : null);
				cell.append(el('b', null, `${pct}%`), RES_NAMES[r]);
				totals.appendChild(cell);
			});
		}

		const oasisBox = el('div', 'bo__block');
		oasisBox.appendChild(el('span', 'bo__block-title', 'Oases'));
		for (let i = 0; i < OASIS_SLOTS; i++) {
			oasisBox.appendChild(oasisSelect(setup.oases[i], i, (type) => {
				update({ ...setup, oases: setup.oases.map((t, j) => (j === i ? type : t)) });
			}));
		}

		const extraBox = el('div', 'bo__block');
		extraBox.appendChild(el('span', 'bo__block-title', 'Buildings %'));
		const grid = el('div', 'bo__extra');
		RES_NAMES.forEach((name, r) => {
			const cell = el('label', 'bo__extra-cell');
			cell.append(el('span', null, name), pctInput(setup.extra[r], `${name} building bonus %`, (value) => {
				update({ ...setup, extra: setup.extra.map((x, j) => (j === r ? value : x)) });
			}));
			grid.appendChild(cell);
		});
		extraBox.appendChild(grid);

		paintTotals();
		card.append(oasisBox, extraBox, totals);
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
		let steps = buildStepsCard(v, totalBonus(setupFor(v)));
		const bonus = buildBonusCard(v, (next) => {
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
