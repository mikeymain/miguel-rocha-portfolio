// Build order tab of the options page. Loaded after options.js.
// Field levels come from features/build-order (saved on each village's
// resources view) and building levels from its village centre. The summed
// bonus is shared with the in-game highlight, so edits here re-rank it.
(function initBuildOrderTab() {
	const FIELDS_PREFIX = 'travianQoL.buildFields.';
	const BONUS_PREFIX = 'travianQoL.buildOrder.';
	const PICK_KEY = 'travianQoL.buildOrder.pick';
	// Per-host { villageId: setup } (see setupFor).
	const SETUP_PREFIX = 'travianQoL.buildOasis.';
	// Per-host boolean: the +25% gold bonus applies to every village.
	const GOLD_PREFIX = 'travianQoL.buildGold.';
	// Per-host { villageId: true }: plan fields to level 20 (read in game too).
	const MAX20_PREFIX = 'travianQoL.buildMax20.';
	// Per-host { villageId: [guide step ids ticked by hand] }.
	const GUIDE_PREFIX = 'travianQoL.buildGuide.';
	const STEPS = 12;
	// Plan depth for the boost-building timing (covers every field to 20).
	const BOOST_DEPTH = 450;
	const RES_NAMES = ['Lumber', 'Clay', 'Iron', 'Crop'];
	const RES_FILES = ['lumber', 'clay', 'iron', 'crop'];
	const OASIS_SLOTS = 3;
	const GOLD_PCT = 25;
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
	if (!root || !select || !planner || !window.TravianQoLGuide4P) return;
	// Editable buildings: the five boosts (max 5). The Hero's Mansion level is
	// always the one read in game.
	const EDIT_BUILDINGS = Object.entries(planner.BOOSTS).map(([gid, b]) => ({ gid: Number(gid), name: b.name, res: b.res, max: 5 }));
	const SHORT_NAMES = { 'Iron Foundry': 'Foundry' };

	let villages = []; // { value, host, id, name, fields, buildings, updatedAt }
	let bonusStore = {}; // host -> { villageId: [4] }
	let setupStore = {}; // host -> { villageId: setup }
	let goldStore = {}; // host -> bool (Plus bonus is account wide)
	let max20Store = {}; // host -> { villageId: bool }
	// Per-host map tiles seen in game (features/build-order, map pages).
	const TILES_PREFIX = 'travianQoL.mapTiles.';
	let tilesStore = {}; // host -> { "x|y": 0 | { b, o } }
	let guideStore = {}; // host -> { villageId: [step ids] }
	const NEARBY_SHOWN = 5;

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text != null) node.textContent = text;
		return node;
	}

	const formatHours = (h) => (h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`);
	const shortHost = (host) => host.replace(/\.travian\.[a-z.]+$/i, '');
	const sumOf = (a) => a.reduce((x, y) => x + y, 0);

	function formatAge(ms) {
		const min = Math.round((Date.now() - ms) / 60000);
		if (min < 60) return `${Math.max(min, 0)}m ago`;
		const h = Math.round(min / 60);
		return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
	}

	// Game resource icon (options/res/, kept out of the public repo).
	function resIcon(r) {
		const i = el('span', 'res-ico');
		i.style.backgroundImage = `url(res/${RES_FILES[r]}_small.png)`;
		i.title = RES_NAMES[r];
		i.setAttribute('aria-hidden', 'true');
		return i;
	}

	async function load() {
		const all = await chrome.storage.local.get(null);
		villages = [];
		bonusStore = {};
		setupStore = {};
		goldStore = {};
		max20Store = {};
		tilesStore = {};
		guideStore = {};
		for (const [key, value] of Object.entries(all)) {
			if (key.startsWith(GUIDE_PREFIX)) {
				guideStore[key.slice(GUIDE_PREFIX.length)] = value || {};
			} else if (key.startsWith(TILES_PREFIX)) {
				tilesStore[key.slice(TILES_PREFIX.length)] = value || {};
			} else if (key.startsWith(MAX20_PREFIX)) {
				max20Store[key.slice(MAX20_PREFIX.length)] = value || {};
			} else if (key.startsWith(GOLD_PREFIX)) {
				goldStore[key.slice(GOLD_PREFIX.length)] = !!value;
			} else if (key.startsWith(SETUP_PREFIX)) {
				setupStore[key.slice(SETUP_PREFIX.length)] = value || {};
			} else if (key.startsWith(FIELDS_PREFIX)) {
				const host = key.slice(FIELDS_PREFIX.length);
				for (const [id, v] of Object.entries(value || {})) {
					if (!Array.isArray(v?.fields) || !v.fields.length) continue;
					villages.push({ value: `${host}|${id}`, host, id, name: v.name || id, fields: v.fields, buildings: v.buildings || null, slots: v.slots || null, updatedAt: v.updatedAt || 0, x: v.x, y: v.y });
				}
			} else if (key.startsWith(BONUS_PREFIX) && key !== PICK_KEY) {
				bonusStore[key.slice(BONUS_PREFIX.length)] = value || {};
			}
		}
		villages.sort((a, b) => a.host.localeCompare(b.host) || a.name.localeCompare(b.name));
		return all[PICK_KEY];
	}

	// Village shown in the Travian tab the popup was opened from, as a select
	// value, or null. Asks that tab's content script; needs no extra permission
	// because Travian hosts are already granted.
	async function activeTabVillage() {
		try {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!tab?.id || !tab.url || !/^https?:\/\/[^/]*\.travian\.[a-z.]+(\/|$)/i.test(tab.url)) return null;
			const res = await chrome.tabs.sendMessage(tab.id, { type: 'TQOL_ACTIVE_VILLAGE' });
			if (!res?.did) return null;
			const value = `${new URL(tab.url).hostname}|${res.did}`;
			return villages.some((v) => v.value === value) ? value : null;
		} catch {
			return null;
		}
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

	// setup = { oases: [{ type, owned }] x3, gold, buildings: {gid: level} | null }
	// buildings null = use the levels read in game. Older saves stored oases
	// as plain type strings (all owned).
	function setupFor(v) {
		const s = setupStore[v.host]?.[v.id] || {};
		const oases = Array.from({ length: OASIS_SLOTS }, (_, i) => {
			const o = s.oases?.[i];
			const type = typeof o === 'string' ? o : o?.type;
			return { type: type in OASES ? type : '', owned: typeof o === 'string' ? true : o?.owned !== false };
		});
		const gold = v.host in goldStore ? goldStore[v.host] : !!s.gold;
		return { oases, gold, buildings: s.buildings && typeof s.buildings === 'object' ? s.buildings : null };
	}

	function buildingLevels(v, setup) {
		const game = v.buildings || {};
		const levels = { ...game };
		for (const b of EDIT_BUILDINGS) levels[b.gid] = Number((setup.buildings || game)[b.gid]) || 0;
		return levels;
	}

	// Bonus % that is not from boost buildings: owned oases and gold.
	function ownBonus(setup) {
		return [0, 1, 2, 3].map((r) => (setup.gold ? GOLD_PCT : 0)
			+ sumOf(setup.oases.filter((o) => o.owned).map((o) => OASES[o.type].bonus[r])));
	}

	function totalBonus(v, setup) {
		const levels = buildingLevels(v, setup);
		return ownBonus(setup).map((b, r) => b + planner.boostPct(levels, r));
	}

	function planExtra(v, setup) {
		return {
			buildings: buildingLevels(v, setup),
			plannedOases: setup.oases.filter((o) => !o.owned && o.type).map((o) => OASES[o.type].bonus),
			ownedOases: setup.oases.filter((o) => o.owned && o.type).length,
		};
	}

	const max20Of = (v) => !!max20Store[v.host]?.[v.id];

	function planFor(v, setup) {
		return planner.plan(v.fields, ownBonus(setup), STEPS, planExtra(v, setup), max20Of(v));
	}

	function saveMax20(v, on) {
		max20Store[v.host] = { ...(max20Store[v.host] || {}), [v.id]: on };
		chrome.storage.local.set({ [MAX20_PREFIX + v.host]: max20Store[v.host] }, flash);
	}

	function saveSetup(v, setup) {
		setupStore[v.host] = { ...(setupStore[v.host] || {}), [v.id]: setup };
		bonusStore[v.host] = { ...(bonusStore[v.host] || {}), [v.id]: totalBonus(v, setup) };
		chrome.storage.local.set({
			[SETUP_PREFIX + v.host]: setupStore[v.host],
			[BONUS_PREFIX + v.host]: bonusStore[v.host],
		}, flash);
	}

	// Gold applies to the whole account: store it per host and re-total every
	// village on that host so the in-game highlight stays right everywhere.
	function saveGold(host, on) {
		goldStore = { ...goldStore, [host]: on };
		const bonuses = { ...(bonusStore[host] || {}) };
		for (const v of villages.filter((x) => x.host === host)) bonuses[v.id] = totalBonus(v, setupFor(v));
		bonusStore[host] = bonuses;
		chrome.storage.local.set({ [GOLD_PREFIX + host]: on, [BONUS_PREFIX + host]: bonuses }, flash);
	}

	// options.js owns the header save indicator; pulse it here too.
	function flash() {
		const status = document.getElementById('save-status');
		status?.classList.add('is-saving');
		setTimeout(() => status?.classList.remove('is-saving'), 600);
	}

	// --- Oasis picker (custom listbox: <select> options cannot show icons) ---

	function oasisFace(type) {
		const face = el('span', 'bo-pick__face');
		const parts = OASES[type].bonus.map((pct, r) => [pct, r]).filter(([pct]) => pct > 0);
		if (!parts.length) face.appendChild(el('span', 'bo-pick__none', 'None'));
		for (const [pct, r] of parts) {
			const part = el('span', 'bo-pick__part');
			part.append(resIcon(r), el('span', null, `${pct}%`));
			face.appendChild(part);
		}
		return face;
	}

	let closeOpenPicker = null;
	document.addEventListener('click', (e) => {
		if (closeOpenPicker && !e.target.closest('.bo-pick')) closeOpenPicker(false);
	});

	function oasisPicker(value, index, onPick) {
		const wrap = el('div', 'bo-pick');
		const btn = el('button', 'select bo-pick__btn');
		btn.type = 'button';
		btn.setAttribute('aria-haspopup', 'listbox');
		btn.setAttribute('aria-expanded', 'false');
		btn.setAttribute('aria-label', `Oasis ${index + 1}: ${OASES[value].label}`);
		btn.appendChild(oasisFace(value));
		const list = el('ul', 'bo-pick__list');
		list.setAttribute('role', 'listbox');
		list.hidden = true;
		const options = Object.keys(OASES).map((type) => {
			const li = el('li', 'bo-pick__opt');
			li.setAttribute('role', 'option');
			li.setAttribute('aria-selected', String(type === value));
			li.setAttribute('aria-label', OASES[type].label);
			li.tabIndex = -1;
			li.dataset.type = type;
			li.appendChild(oasisFace(type));
			list.appendChild(li);
			return li;
		});
		function close(refocus) {
			list.hidden = true;
			btn.setAttribute('aria-expanded', 'false');
			if (closeOpenPicker === close) closeOpenPicker = null;
			if (refocus) btn.focus();
		}
		function open() {
			if (closeOpenPicker) closeOpenPicker(false);
			list.hidden = false;
			btn.setAttribute('aria-expanded', 'true');
			closeOpenPicker = close;
			(options.find((o) => o.dataset.type === value) || options[0]).focus();
		}
		function choose(type) {
			close(true);
			if (type !== value) onPick(type);
		}
		btn.addEventListener('click', () => (list.hidden ? open() : close(false)));
		btn.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
		});
		list.addEventListener('click', (e) => {
			const li = e.target.closest('li[data-type]');
			if (li) choose(li.dataset.type);
		});
		list.addEventListener('keydown', (e) => {
			const i = options.indexOf(document.activeElement);
			if (e.key === 'ArrowDown') { e.preventDefault(); options[Math.min(i + 1, options.length - 1)].focus(); }
			else if (e.key === 'ArrowUp') { e.preventDefault(); options[Math.max(i - 1, 0)].focus(); }
			else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (i >= 0) choose(options[i].dataset.type); }
			else if (e.key === 'Escape' || e.key === 'Tab') close(e.key === 'Escape');
		});
		wrap.append(btn, list);
		return wrap;
	}

	// --- Nearby oases (annex range, from map tiles seen in game) ------------

	const typeOf = (bonus) => Object.keys(OASES).find((k) => k && OASES[k].bonus.every((p, r) => p === bonus[r])) || '';

	// Free oases in range, best hourly gain for this village first.
	function nearbyRanked(v) {
		const near = planner.nearbyOases(v.x, v.y, tilesStore[v.host] || {});
		return { ...near, ranked: planner.rankOases(v.fields, near.oases).filter((o) => typeOf(o.bonus)) };
	}

	// Empty slots get the best free oases not already planned in a slot.
	function pickBest(setup, ranked) {
		const left = [...ranked];
		for (const o of setup.oases) {
			const i = o.type && !o.owned ? left.findIndex((r) => typeOf(r.bonus) === o.type) : -1;
			if (i >= 0) left.splice(i, 1);
		}
		const oases = setup.oases.map((o) => {
			if (o.type || !left.length) return o;
			return { type: typeOf(left.shift().bonus), owned: false };
		});
		return { ...setup, oases };
	}

	function buildNearbyBlock(v, setup, update) {
		const box = el('div', 'bo-near');
		const head = el('div', 'bo__block-head');
		head.appendChild(el('span', 'bo__block-title', 'Nearby'));
		box.appendChild(head);
		if (!Number.isInteger(v.x) || !Number.isInteger(v.y)) {
			head.appendChild(el('span', 'bo__hint', 'Open the resources view to read coordinates'));
			return box;
		}
		const near = nearbyRanked(v);
		head.appendChild(el('span', 'bo__hint', `Seen ${near.seen}/${near.total}`));
		if (!near.ranked.length) {
			box.appendChild(el('div', 'bo__hint', near.seen < near.total ? 'Hover the tiles around the village on the map' : 'No free oases in range'));
			return box;
		}
		for (const o of near.ranked.slice(0, NEARBY_SHOWN)) {
			const row = el('div', 'bo-near__row');
			const gain = el('span', 'bo-near__gain', `+${o.gain}/h`);
			gain.title = 'Speed x1';
			row.append(oasisFace(typeOf(o.bonus)), el('span', 'bo-near__xy', `(${o.x}|${o.y})`), gain);
			box.appendChild(row);
		}
		const use = el('button', 'bo-link', 'Use best');
		use.type = 'button';
		use.disabled = !setup.oases.some((o) => !o.type);
		use.addEventListener('click', () => update((s) => pickBest(s, nearbyRanked(v).ranked)));
		box.appendChild(use);
		return box;
	}

	// --- Bonus card ---------------------------------------------------------

	function oasisRow(o, i, update) {
		const row = el('div', 'bo-oasis');
		row.appendChild(oasisPicker(o.type, i, (type) => update((s) => ({ ...s, oases: s.oases.map((x, j) => (j === i ? { ...x, type } : x)) }))));
		if (!o.type) return row;
		const state = el('button', `bo-state${o.owned ? ' is-owned' : ''}`, o.owned ? 'Owned' : 'Planned');
		state.type = 'button';
		state.setAttribute('aria-pressed', String(o.owned));
		state.addEventListener('click', () => update((s) => ({ ...s, oases: s.oases.map((x, j) => (j === i ? { ...x, owned: !x.owned } : x)) })));
		row.appendChild(state);
		return row;
	}

	function buildingCell(b, level, update) {
		const cell = el('label', 'bo-bld');
		const name = el('span', 'bo-bld__name');
		name.title = b.name;
		if (b.res != null) name.appendChild(resIcon(b.res));
		name.appendChild(el('span', null, SHORT_NAMES[b.name] || b.name));
		const sel = el('select', 'select');
		sel.setAttribute('aria-label', `${b.name} level`);
		for (let l = 0; l <= b.max; l++) {
			const opt = el('option', null, String(l));
			opt.value = String(l);
			sel.appendChild(opt);
		}
		sel.value = String(level);
		sel.addEventListener('change', () => update((s, v) => ({ ...s, buildings: { ...buildingLevels(v, s), [b.gid]: Number(sel.value) } })));
		cell.append(name, sel);
		return cell;
	}

	function buildBonusCard(v, setup, update) {
		const card = el('section', 'card lc-card bo__bonus');
		const head = el('div', 'lc-card__head');
		head.appendChild(el('span', 'lc-card__title', 'Production bonus'));
		card.appendChild(head);

		const oasisBox = el('div', 'bo__block');
		oasisBox.appendChild(el('span', 'bo__block-title', 'Oases'));
		setup.oases.forEach((o, i) => oasisBox.appendChild(oasisRow(o, i, update)));
		oasisBox.appendChild(buildNearbyBlock(v, setup, update));

		const bldBox = el('div', 'bo__block');
		const bldTitle = el('div', 'bo__block-head');
		bldTitle.appendChild(el('span', 'bo__block-title', 'Buildings'));
		if (setup.buildings) {
			const reset = el('button', 'bo-link', 'Use game levels');
			reset.type = 'button';
			reset.disabled = !v.buildings;
			reset.addEventListener('click', () => update((s) => ({ ...s, buildings: null })));
			bldTitle.appendChild(reset);
		} else if (!v.buildings) {
			bldTitle.appendChild(el('span', 'bo__hint', 'Open the village centre to read levels'));
		}
		bldBox.appendChild(bldTitle);
		const grid = el('div', 'bo-blds');
		const levels = buildingLevels(v, setup);
		for (const b of EDIT_BUILDINGS) grid.appendChild(buildingCell(b, levels[b.gid], update));
		bldBox.appendChild(grid);

		const gold = el('label', 'lc-line bo-gold');
		gold.appendChild(el('span', 'lc-line__label', 'Gold +25%'));
		const goldChk = document.createElement('input');
		goldChk.type = 'checkbox';
		goldChk.className = 'switch';
		goldChk.checked = setup.gold;
		goldChk.addEventListener('change', () => {
			saveGold(v.host, goldChk.checked);
			render();
		});
		gold.appendChild(goldChk);

		const max20 = el('label', 'lc-line bo-gold');
		max20.appendChild(el('span', 'lc-line__label', 'Simulate to level 20'));
		const max20Chk = document.createElement('input');
		max20Chk.type = 'checkbox';
		max20Chk.className = 'switch';
		max20Chk.checked = max20Of(v);
		max20Chk.addEventListener('change', () => {
			saveMax20(v, max20Chk.checked);
			render();
		});
		max20.appendChild(max20Chk);

		const totals = el('div', 'bo__totals');
		totalBonus(v, setup).forEach((pct, r) => {
			const cell = el('span', pct > 0 ? 'is-set' : null);
			cell.append(resIcon(r), el('b', null, `${pct}%`));
			totals.appendChild(cell);
		});

		card.append(oasisBox, bldBox, gold, max20, totals);
		return card;
	}

	// --- Steps card ---------------------------------------------------------

	function stepCell(s) {
		const td = el('td', 'bo__field');
		if (s.kind === 'oasis') {
			td.append(el('span', null, s.from < s.to ? `${s.name} + oasis` : 'Take oasis'), oasisFaceFor(s.bonus));
		} else {
			td.append(resIcon(s.res), el('span', null, s.name));
		}
		return td;
	}

	function oasisFaceFor(bonus) {
		const type = Object.keys(OASES).find((k) => OASES[k].bonus.every((p, r) => p === bonus[r])) || '';
		return oasisFace(type);
	}

	function buildStepsCard(v, setup) {
		const card = el('section', 'card lc-card bo__steps');
		const head = el('div', 'lc-card__head');
		head.appendChild(el('span', 'lc-card__title', 'Next upgrades'));
		head.appendChild(el('span', 'bo__age', `Fields read ${formatAge(v.updatedAt)}`));
		card.appendChild(head);
		const steps = planFor(v, setup);
		if (!steps.length) {
			card.appendChild(el('div', 'bo__empty', 'Nothing left to upgrade.'));
			return card;
		}
		const table = el('table', 'bo__table');
		const thead = el('thead');
		const hr = el('tr');
		['#', 'Upgrade', 'Level', 'Cost', 'Payback (x1)'].forEach((h) => hr.appendChild(el('th', null, h)));
		thead.appendChild(hr);
		const tbody = el('tbody');
		// Fields with an upgrade already queued in game, above the plan.
		for (const f of v.fields.filter((x) => x.building && planner.FIELDS[x.gid])) {
			const tr = el('tr', 'is-queued');
			const name = el('td', 'bo__field');
			name.append(resIcon(planner.FIELDS[f.gid].res), el('span', null, planner.FIELDS[f.gid].name));
			tr.append(
				el('td', 'bo__n', '▸'),
				name,
				el('td', 'bo__lvl', `${f.level - 1} → ${f.level}`),
				el('td', 'bo__num', 'Upgrading'),
				el('td', 'bo__num', ''),
			);
			tbody.appendChild(tr);
		}
		steps.forEach((s, i) => {
			const tr = el('tr', [i === 0 ? 'is-next' : '', s.kind !== 'field' ? `is-${s.kind}` : ''].join(' ').trim() || null);
			tr.append(
				el('td', 'bo__n', String(i + 1)),
				stepCell(s),
				el('td', 'bo__lvl', s.from < s.to ? `${s.from} → ${s.to}` : '—'),
				el('td', 'bo__num', s.cost.toLocaleString()),
				el('td', 'bo__num', formatHours(s.payback)),
			);
			tbody.appendChild(tr);
		});
		table.append(thead, tbody);
		card.appendChild(table);
		card.appendChild(buildBoostBlock(v, setup));
		return card;
	}

	// When each boost building enters the plan (step number), or what it waits for.
	function buildBoostBlock(v, setup) {
		const box = el('div', 'bo__block bo-boosts');
		box.appendChild(el('span', 'bo__block-title', 'Boost buildings'));
		for (const b of planner.boostSchedule(v.fields, ownBonus(setup), planExtra(v, setup), BOOST_DEPTH, max20Of(v))) {
			const row = el('div', 'bo-boost');
			const name = el('span', 'bo-boost__name');
			name.append(resIcon(b.res), el('span', null, b.name));
			const lvl = el('span', 'bo-boost__lvl', b.level >= b.max ? `${b.level}` : `${b.level} → ${b.level + 1}`);
			let when;
			if (b.level >= b.max) when = el('span', 'bo-boost__when', 'Max');
			else if (b.step) when = el('span', `bo-boost__when${b.step <= STEPS ? ' is-soon' : ''}`, `Step ${b.step}`);
			else when = el('span', 'bo-boost__when is-blocked', b.blocker ? `Needs ${b.blocker.name} ${b.blocker.level}` : '—');
			if (b.step && b.blocker) when.title = `After ${b.blocker.name} ${b.blocker.level}`;
			row.append(name, lvl, when);
			box.appendChild(row);
		}
		return box;
	}

	// --- Starting guide (4-party farming) -------------------------------------

	const guide = window.TravianQoLGuide4P;
	let hideDone = false;
	let guideScroll = 0;

	const guideManual = (v) => new Set(guideStore[v.host]?.[v.id] || []);

	function saveGuideManual(v, set) {
		guideStore[v.host] = { ...(guideStore[v.host] || {}), [v.id]: [...set] };
		chrome.storage.local.set({ [GUIDE_PREFIX + v.host]: guideStore[v.host] }, flash);
	}

	/** Done state per step: detected from the game, or ticked by hand. */
	function guideState(v) {
		const manual = guideManual(v);
		return guide.STEPS.map((s) => {
			const auto = guide.isDone(s, v.fields, v.slots || {});
			return { step: s, auto: auto === true, done: auto === true || manual.has(s.id) };
		});
	}

	function guideRow(v, { step, auto, done }, isNext) {
		const tr = el('tr', [done ? 'is-done' : '', isNext ? 'is-next' : ''].join(' ').trim() || null);
		const box = document.createElement('input');
		box.type = 'checkbox';
		box.checked = done;
		box.disabled = auto;
		box.setAttribute('aria-label', step.label);
		box.addEventListener('change', () => {
			const set = guideManual(v);
			if (box.checked) set.add(step.id); else set.delete(step.id);
			saveGuideManual(v, set);
			render();
		});
		const check = el('td', 'bo__n');
		check.appendChild(box);
		const name = el('td', 'bo__field');
		name.appendChild(el('span', null, step.label));
		if (step.optional) name.appendChild(el('span', 'bo-tag', 'Optional'));
		const perCp = step.cost ? guide.costPerCp(step) : null;
		tr.append(
			check,
			name,
			el('td', 'bo__num', step.cost ? step.cost.toLocaleString() : ''),
			el('td', 'bo__num', perCp == null ? '' : perCp.toLocaleString()),
		);
		return tr;
	}

	function buildGuideCard(v) {
		const card = el('section', 'card lc-card bo__guide');
		const state = guideState(v);
		const next = state.findIndex((s) => !s.done && !s.step.optional);
		const core = state.filter((s) => !s.step.optional);
		const head = el('div', 'lc-card__head');
		head.appendChild(el('span', 'lc-card__title', 'Starting guide · 4 party farming'));
		head.appendChild(el('span', 'bo__age', `${core.filter((s) => s.done).length}/${core.length}`));
		const toggle = el('button', 'bo-link', hideDone ? 'Show done' : 'Hide done');
		toggle.type = 'button';
		toggle.addEventListener('click', () => { hideDone = !hideDone; render(); });
		head.appendChild(toggle);
		card.appendChild(head);
		if (!v.slots) card.appendChild(el('div', 'bo__hint bo__guide-hint', 'Open the village centre to read buildings'));
		const table = el('table', 'bo__table');
		const thead = el('thead');
		const hr = el('tr');
		['', 'Step', 'Cost', 'Net res/CP'].forEach((h) => hr.appendChild(el('th', null, h)));
		thead.appendChild(hr);
		const tbody = el('tbody');
		state.forEach((s, i) => {
			if (hideDone && s.done) return;
			tbody.appendChild(guideRow(v, s, i === next));
		});
		table.append(thead, tbody);
		const scroll = el('div', 'bo__guide-scroll');
		scroll.appendChild(table);
		scroll.addEventListener('scroll', () => { guideScroll = scroll.scrollTop; });
		card.appendChild(scroll);
		if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { scroll.scrollTop = guideScroll; });
		return card;
	}

	function render() {
		if (closeOpenPicker) closeOpenPicker(false);
		root.innerHTML = '';
		const v = current();
		if (!v) {
			root.appendChild(el('div', 'bo__empty card', 'Open a village\'s resources view in Travian to load its fields.'));
			return;
		}
		const setup = setupFor(v);
		const update = (change) => {
			saveSetup(v, change(setupFor(v), v));
			render();
		};
		// The guide leads until every required step is done.
		const cards = [buildBonusCard(v, setup, update), buildStepsCard(v, setup)];
		const guideCard = buildGuideCard(v);
		const finished = guideState(v).filter((s) => !s.step.optional).every((s) => s.done);
		root.append(...(finished ? [...cards, guideCard] : [guideCard, ...cards]));
	}

	select.addEventListener('change', () => {
		chrome.storage.local.set({ [PICK_KEY]: select.value });
		render();
	});

	// Snapshots arrive while the popup is open: refresh in place.
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local') return;
		if (!Object.keys(changes).some((k) => k.startsWith(FIELDS_PREFIX) || k.startsWith(TILES_PREFIX))) return;
		const keep = select.value;
		load().then(() => {
			fillSelect(keep);
			render();
		});
	});

	load().then(async (pick) => {
		fillSelect((await activeTabVillage()) || pick);
		render();
	});
})();
