// Options page: renders one toggle per registered feature, plus a separate
// "Loot Calculator" tab that edits LootCalc's per-server settings.
//
// We do NOT call feature.init() here — the options page is not a Travian tab,
// so feature init would have nothing useful to do. We only read/write the
// enabled-map; the content script applies it on each Travian page. Same
// rationale for loot-calc: this page just edits chrome.storage.local values,
// and the in-page loot-calc feature picks them up on next load.
(function () {
	const KEY = window.TravianQoL.STORAGE_KEY;

	// ---- Tabs ----
	// Keep aria-selected in sync with the visual is-active state so screen
	// readers and assistive tech announce the active tab correctly.
	const tabs = document.querySelectorAll('.tabs__item[data-tab]');
	const panels = document.querySelectorAll('.panel');
	const lastTabKey = 'travianQoL.popup.lastTab';
	function activateTab(tab) {
		localStorage.setItem(lastTabKey, tab.dataset.tab);
		tabs.forEach((t) => {
			const active = t === tab;
			t.classList.toggle('is-active', active);
			t.setAttribute('aria-selected', active ? 'true' : 'false');
			t.setAttribute('tabindex', active ? '0' : '-1');
		});
		panels.forEach((p) => p.classList.toggle('is-active', p.id === `tab-${tab.dataset.tab}`));
	}
	const lastTab = localStorage.getItem(lastTabKey);
	const savedTab = [...tabs].find(tab => tab.dataset.tab === lastTab);
	if (savedTab) activateTab(savedTab);
	tabs.forEach((tab) => {
		tab.addEventListener('click', () => activateTab(tab));
		// Arrow-key navigation between tabs — standard WAI-ARIA tablist pattern.
		tab.addEventListener('keydown', (e) => {
			const list = [...tabs];
			const i = list.indexOf(tab);
			if (e.key === 'ArrowRight') {
				e.preventDefault();
				const next = list[(i + 1) % list.length];
				next.focus(); activateTab(next);
			} else if (e.key === 'ArrowLeft') {
				e.preventDefault();
				const prev = list[(i - 1 + list.length) % list.length];
				prev.focus(); activateTab(prev);
			} else if (e.key === 'Home') {
				e.preventDefault();
				list[0].focus(); activateTab(list[0]);
			} else if (e.key === 'End') {
				e.preventDefault();
				list[list.length - 1].focus(); activateTab(list[list.length - 1]);
			}
		});
	});

	// Header save indicator: flashes after every persisted change.
	const saveStatus = document.getElementById('save-status');
	const saveText = saveStatus?.querySelector('.bar__status-text');
	let saveFlashTimer = null;
	function flashSaved() {
		if (!saveStatus || !saveText) return;
		saveStatus.classList.remove('is-saving');
		void saveStatus.offsetWidth; // restart the pulse animation
		saveStatus.classList.add('is-saving');
		saveText.textContent = 'Saving';
		clearTimeout(saveFlashTimer);
		saveFlashTimer = setTimeout(() => {
			saveStatus.classList.remove('is-saving');
			saveText.textContent = 'Saved';
		}, 1200);
	}

	const versionEl = document.getElementById('app-version');
	if (versionEl) versionEl.textContent = `v${chrome.runtime.getManifest().version}`;

	// ---- Features tab ----
	// Features are grouped here by id so the feature modules stay untouched.
	// Any id missing from GROUPS lands in "Other", so new features still show.
	const ICONS = {
		farm: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
		reports: '<path d="M4 4h16v16H4z"/><path d="M4 8l8 5 8-5"/>',
		resources: '<path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 16.5 5.5 21l2-7.5L2 9h7z"/>',
		hero: '<circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z"/>',
		tools: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
	};
	const GROUPS = [
		{ id: 'farm', name: 'Farm lists', col: 0, ids: ['farmlist-multi-select', 'farmlist-bounty-sort', 'farmlist-raid-fill', 'farmlist-edit-chooser'] },
		{ id: 'reports', name: 'Reports', col: 0, ids: ['report-opener', 'loot-calc'] },
		{ id: 'hero', name: 'Hero', col: 0, ids: ['adventure-sort'] },
		{ id: 'resources', name: 'Resources', col: 1, ids: ['village-resource-total', 'resource-full-time', 'trade-route-production', 'upgrade-values', 'build-order'] },
		{ id: 'tools', name: 'Tools', col: 1, ids: ['todolist', 'smithy-efficiency'] },
	];

	const featuresRoot = document.getElementById('features');
	const featureCountEl = document.getElementById('feature-active-count');
	const allFeatures = window.TravianQoL.features;
	const isOn = (enabled, id) => enabled[id] !== false;

	function groupedFeatures() {
		const byId = new Map(allFeatures.map((f) => [f.id, f]));
		const used = new Set();
		const groups = GROUPS.map((g) => {
			const features = g.ids.map((id) => byId.get(id)).filter(Boolean);
			features.forEach((f) => used.add(f.id));
			return { ...g, features };
		});
		const rest = allFeatures.filter((f) => !used.has(f.id));
		if (rest.length) groups.push({ id: 'tools', name: 'Other', col: 1, features: rest });
		return groups.filter((g) => g.features.length);
	}

	function svgIcon(paths) {
		const span = document.createElement('span');
		span.className = 'group__icon';
		span.setAttribute('aria-hidden', 'true');
		// Static, hard-coded markup from ICONS only.
		span.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
		return span;
	}

	function makeSwitch(label) {
		const cb = document.createElement('input');
		cb.type = 'checkbox';
		cb.className = 'switch';
		if (label) cb.setAttribute('aria-label', label);
		return cb;
	}

	function renderFeatures(enabled) {
		const save = () => chrome.storage.sync.set({ [KEY]: enabled }, flashSaved);
		const groupViews = [];

		function refresh() {
			const active = allFeatures.filter((f) => isOn(enabled, f.id)).length;
			featureCountEl.innerHTML = '';
			const b = document.createElement('b');
			b.textContent = String(active);
			featureCountEl.append(b, `/${allFeatures.length} on`);
			for (const v of groupViews) {
				const on = v.features.filter((f) => isOn(enabled, f.id)).length;
				const all = on === v.features.length;
				v.count.textContent = `${on}/${v.features.length}`;
				v.toggle.checked = all;
				v.toggle.indeterminate = on > 0 && !all;
				v.el.classList.toggle('is-all-on', all);
				for (const r of v.rows) {
					r.cb.checked = isOn(enabled, r.id);
					r.row.classList.toggle('is-on', r.cb.checked);
				}
			}
		}

		function setMany(ids, value) {
			for (const id of ids) enabled[id] = value;
			save();
			refresh();
		}

		function buildRow(feature) {
			const row = document.createElement('label');
			row.className = 'feature';
			if (feature.description) row.title = feature.description;
			const label = document.createElement('span');
			label.className = 'feature__label';
			label.textContent = feature.label || feature.id;
			row.appendChild(label);
			// Features without destroy() cannot be torn down live.
			if (typeof feature.destroy !== 'function') {
				const tag = document.createElement('span');
				tag.className = 'feature__tag';
				tag.textContent = 'Refresh';
				tag.title = 'Takes effect after a page reload';
				row.appendChild(tag);
			}
			const cb = makeSwitch();
			cb.addEventListener('change', () => setMany([feature.id], cb.checked));
			row.appendChild(cb);
			return { id: feature.id, row, cb };
		}

		function buildGroup(g) {
			const el = document.createElement('section');
			el.className = 'group';
			const head = document.createElement('div');
			head.className = 'group__head';
			const name = document.createElement('span');
			name.className = 'group__name';
			name.textContent = g.name;
			const count = document.createElement('span');
			count.className = 'group__count';
			const toggle = makeSwitch(`All ${g.name}`);
			toggle.addEventListener('change', () => setMany(g.features.map((f) => f.id), toggle.checked));
			head.append(svgIcon(ICONS[g.id] || ICONS.tools), name, count, toggle);
			el.appendChild(head);
			const rows = g.features.map(buildRow);
			rows.forEach((r) => el.appendChild(r.row));
			return { el, count, toggle, rows, features: g.features };
		}

		featuresRoot.innerHTML = '';
		const cols = [0, 1].map(() => {
			const c = document.createElement('div');
			c.className = 'groups__col';
			featuresRoot.appendChild(c);
			return c;
		});
		for (const g of groupedFeatures()) {
			const view = buildGroup(g);
			cols[g.col].appendChild(view.el);
			groupViews.push(view);
		}

		const allIds = allFeatures.map((f) => f.id);
		document.getElementById('features-all-on').onclick = () => setMany(allIds, true);
		document.getElementById('features-all-off').onclick = () => setMany(allIds, false);
		refresh();
	}
	chrome.storage.sync.get([KEY], (res) => {
		renderFeatures(res[KEY] || {});
	});

	// ---- Loot Calculator tab ----
	// Per-server keys look like `tlw_<setting>_<hostname>`. We discover every
	// hostname we've ever stored anything for and present them in a dropdown,
	// headed by a "Default (all servers)" entry stored under the `global`
	// pseudo-hostname that every server falls back to.
	const LC_SETTING_KEYS = ['auto_unit', 'auto_enabled', 'tribe', 'debug', 'offset_x', 'offset_y'];
	const DEFAULT_OFFSET_X = 3;
	const DEFAULT_OFFSET_Y = 0;

	// Unit caps mirror features/loot-calc/index.js. Shown next to each name so
	// the dropdown reads the same as the in-page calculator.
	// Third value: the unit's slot (1-10) in the tribe's game sprite strip.
	const BASE_TRIBES = {
		Romans: [['Legionnaire', 50, 1], ['Praetorian', 20, 2], ['Imperian', 50, 3], ['Equites Imperatoris', 100, 5], ['Equites Caesaris', 70, 6]],
		Teutons: [['Clubswinger', 60, 1], ['Axeman', 50, 3], ['Paladin', 110, 5], ['Teutonic Knight', 80, 6]],
		Gauls: [['Phalanx', 35, 1], ['Swordsman', 45, 2], ['Theutates Thunder', 75, 4], ['Druidrider', 35, 5], ['Haeduan', 65, 6]],
		Egyptians: [['Slave Militia', 15, 1], ['Ash Warden', 50, 2], ['Khopesh Warrior', 45, 3], ['Anhur Guard', 50, 5], ['Resheph Chariot', 70, 6]],
		Huns: [['Mercenary', 50, 1], ['Bowman', 30, 2], ['Steppe Rider', 75, 4], ['Marksman', 105, 5], ['Marauder', 80, 6]],
		Spartans: [['Hoplite', 60, 1], ['Shieldsman', 40, 3], ['Twinsteel Therion', 50, 4], ['Elpida Rider', 110, 5], ['Corinthian Crusher', 80, 6]],
	};
	// Game sprite strip per tribe: 16x16 icons stacked vertically (options/units/).
	const UNIT_SHEET = {
		Romans: 'roman', Teutons: 'teuton', Gauls: 'gaul',
		Egyptians: 'egyptian', Huns: 'hun', Spartans: 'spartan',
	};
	const UNIT_ICON_PX = 16;
	function unitIcon(tribe, slot) {
		const i = document.createElement('span');
		i.className = 'unit-ico';
		i.setAttribute('aria-hidden', 'true');
		i.style.backgroundImage = `url(units/${UNIT_SHEET[tribe]}_small.png)`;
		i.style.backgroundPosition = `0 -${(slot - 1) * UNIT_ICON_PX}px`;
		return i;
	}

	// Mirrors BUILTIN_DEFAULT_UNIT in features/loot-calc/index.js.
	const BUILTIN_DEFAULT_UNIT = {
		Romans: 'Equites Imperatoris',
		Teutons: 'Clubswinger',
		Gauls: 'Theutates Thunder',
		Egyptians: 'Resheph Chariot',
		Huns: 'Steppe Rider',
		Spartans: 'Hoplite',
	};

	// Sentinel for the "Default (all servers)" entry in the server dropdown.
	// Its settings live under the `global` scope and are the fallback the
	// content script uses on any server that has no override of its own --
	// which is what makes a brand-new server work without opening the
	// in-page calculator first.
	const LC_GLOBAL = '__global__';

	const serverSelect = document.getElementById('lc-server');
	const settingsRoot = document.getElementById('lc-settings');

	// Global defaults are stored under the pseudo-server `global`, except the
	// default unit, which is per tribe (`tlw_auto_unit_global_<Tribe>`) so a
	// Teuton server and a Gaul server can each start with a sensible unit.
	function lcKey(setting, server, tribe) {
		if (server === LC_GLOBAL) {
			return setting === 'auto_unit' ? `tlw_auto_unit_global_${tribe}` : `tlw_${setting}_global`;
		}
		return `tlw_${setting}_${server}`;
	}

	function isGlobalScope(server) {
		return server === 'global' || server.startsWith('global_');
	}

	function discoverServers() {
		return new Promise((resolve) => {
			chrome.storage.local.get(null, (all) => {
				const servers = new Set();
				for (const k of Object.keys(all)) {
					// Match tlw_<setting>_<server> where <setting> is one of our known keys.
					for (const s of LC_SETTING_KEYS) {
						const prefix = `tlw_${s}_`;
						if (k.startsWith(prefix)) {
							const server = k.slice(prefix.length);
							// Skip the global-scope keys: they are the
							// "Default (all servers)" entry, not a server.
							if (!isGlobalScope(server)) servers.add(server);
							break;
						}
					}
				}
				resolve([...servers].sort());
			});
		});
	}

	// Servers with their own `tlw_auto_unit_<host>` ignore the global default
	// entirely. That precedence is right, but silent: the global view has to
	// say so, or changing the default there looks like it does nothing.
	async function findUnitOverrides() {
		const all = await chrome.storage.local.get(null);
		const prefix = 'tlw_auto_unit_';
		const found = [];
		for (const [k, v] of Object.entries(all)) {
			if (!k.startsWith(prefix) || !v) continue;
			const host = k.slice(prefix.length);
			if (isGlobalScope(host)) continue;
			found.push({ host, unit: v });
		}
		return found.sort((a, b) => a.host.localeCompare(b.host));
	}

	// Hostname of the Travian tab the user is on, or null. Note this needs no
	// "tabs" permission: tab.url is populated for any tab the extension holds a
	// host permission for, which is exactly the Travian domains. (Passing a
	// `url` filter to query() *would* require it, so we filter ourselves.)
	async function detectCurrentServer() {
		try {
			const tabs = await chrome.tabs.query({});
			const travian = tabs.filter((t) => t.url && /^https?:\/\/[^/]*\.travian\.[a-z.]+(\/|$)/i.test(t.url));
			if (travian.length === 0) return null;
			// The active tab wins; otherwise just take the first Travian tab.
			const tab = travian.find((t) => t.active) || travian[0];
			return new URL(tab.url).hostname;
		} catch {
			return null;
		}
	}

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text != null) node.textContent = text;
		return node;
	}

	// A selectable row/chip backed by a real radio input (keyboard + SR friendly).
	function radioOption(name, value, checked, className) {
		const label = el('label', className);
		const input = document.createElement('input');
		input.type = 'radio';
		input.name = name;
		input.value = value;
		input.checked = checked;
		input.className = 'sr-radio';
		label.appendChild(input);
		return { label, input };
	}

	function buildOffsetRow(server, offX, offY) {
		const row = el('div', 'lc-line');
		row.appendChild(el('span', 'lc-line__label', 'Badge position'));
		const inputs = el('div', 'lc-offset');
		const make = (axis, value, setting, origin) => {
			const wrap = el('label', 'lc-offset__field');
			wrap.appendChild(el('span', 'lc-offset__axis', axis));
			const input = document.createElement('input');
			input.type = 'number';
			input.className = 'lc-num';
			input.value = value - origin;
			input.setAttribute('aria-label', `Badge position ${axis}`);
			input.oninput = () => {
				const v = parseInt(input.value, 10);
				if (Number.isFinite(v)) chrome.storage.local.set({ [lcKey(setting, server)]: origin + v }, flashSaved);
			};
			wrap.appendChild(input);
			return wrap;
		};
		inputs.append(make('X', offX, 'offset_x', DEFAULT_OFFSET_X), make('Y', offY, 'offset_y', DEFAULT_OFFSET_Y));
		row.appendChild(inputs);
		return row;
	}

	function buildOverrideNotice() {
		const box = el('div', 'lc-override');
		const render = async () => {
			const overrides = await findUnitOverrides();
			box.innerHTML = '';
			box.hidden = overrides.length === 0;
			if (overrides.length === 0) return;
			box.appendChild(el('span', null,
				`${overrides.length} server${overrides.length === 1 ? '' : 's'} use their own unit: ` +
				overrides.map((o) => `${o.host} (${o.unit})`).join(', ')));
			const btn = el('button', 'btn', 'Clear server overrides');
			btn.type = 'button';
			btn.onclick = async () => {
				await chrome.storage.local.remove(overrides.map((o) => `tlw_auto_unit_${o.host}`));
				flashSaved();
				render();
			};
			box.appendChild(btn);
		};
		render();
		return box;
	}

	async function renderServerSettings(server) {
		const isGlobal = server === LC_GLOBAL;
		const tribeKeys = Object.keys(BASE_TRIBES);
		const keys = ['auto_enabled', 'tribe', 'offset_x', 'offset_y'].map((s) => lcKey(s, server));
		// Global units are read in both modes: in per-server mode they name the
		// value the "default" option falls back to.
		keys.push(...tribeKeys.map((t) => lcKey('auto_unit', LC_GLOBAL, t)));
		if (!isGlobal) keys.push(lcKey('auto_unit', server), lcKey('auto_enabled', LC_GLOBAL), lcKey('offset_x', LC_GLOBAL), lcKey('offset_y', LC_GLOBAL));
		const res = await chrome.storage.local.get(keys);

		// Same fallback chain as features/loot-calc: server, then global, then on.
		const autoEnabled = res[lcKey('auto_enabled', server)] ?? res[lcKey('auto_enabled', LC_GLOBAL)] ?? true;
		const offX = res[lcKey('offset_x', server)] ?? res[lcKey('offset_x', LC_GLOBAL)] ?? DEFAULT_OFFSET_X;
		const offY = res[lcKey('offset_y', server)] ?? res[lcKey('offset_y', LC_GLOBAL)] ?? DEFAULT_OFFSET_Y;
		// In global scope the tribe picks *which tribe's* default unit you are
		// editing (a filter, not a saved setting); land on one with a unit saved.
		let tribe = isGlobal
			? tribeKeys.find((t) => res[lcKey('auto_unit', server, t)]) || 'Teutons'
			: res[lcKey('tribe', server)] || 'Teutons';

		settingsRoot.innerHTML = '';

		// --- Left card: tribe + default unit ---
		const unitCard = el('section', 'card lc-card');
		const unitHead = el('div', 'lc-card__head');
		unitHead.appendChild(el('span', 'lc-card__title', 'Default unit'));
		if (isGlobal) unitHead.appendChild(el('span', 'lc-card__hint', 'Servers without own settings'));
		unitCard.appendChild(unitHead);

		const tribeGrid = el('div', 'lc-tribes');
		tribeGrid.setAttribute('role', 'radiogroup');
		tribeGrid.setAttribute('aria-label', 'Tribe');
		const unitList = el('div', 'lc-units');
		unitList.setAttribute('role', 'radiogroup');
		unitList.setAttribute('aria-label', 'Default unit');

		for (const t of tribeKeys) {
			const { label, input } = radioOption('lc-tribe', t, t === tribe, 'lc-tribe');
			label.append(unitIcon(t, 1), el('span', null, t));
			input.onchange = () => {
				tribe = t;
				if (!isGlobal) chrome.storage.local.set({ [lcKey('tribe', server)]: t }, flashSaved);
				fillUnits();
			};
			tribeGrid.appendChild(label);
		}

		function fillUnits() {
			const unitKey = lcKey('auto_unit', server, tribe);
			const selected = res[unitKey] || '';
			const builtin = BUILTIN_DEFAULT_UNIT[tribe];
			const fallback = isGlobal ? builtin : res[lcKey('auto_unit', LC_GLOBAL, tribe)] || builtin;
			unitList.innerHTML = '';

			const def = radioOption('lc-unit', '', selected === '', 'lc-unit lc-unit--default');
			def.label.append(
				el('span', 'lc-unit__name', isGlobal ? 'Built-in' : 'Use default'),
				el('span', 'lc-unit__cap', fallback || '—'),
			);
			unitList.appendChild(def.label);

			const maxCap = Math.max(...(BASE_TRIBES[tribe] || []).map((u) => u[1]));
			for (const [name, cap, slot] of BASE_TRIBES[tribe] || []) {
				const opt = radioOption('lc-unit', name, name === selected, 'lc-unit');
				const bar = el('span', 'lc-unit__bar');
				bar.style.setProperty('--fill', `${Math.round((cap / maxCap) * 100)}%`);
				opt.label.append(unitIcon(tribe, slot), el('span', 'lc-unit__name', name), bar, el('span', 'lc-unit__cap', String(cap)));
				unitList.appendChild(opt.label);
			}

			unitList.querySelectorAll('input').forEach((input) => {
				input.onchange = () => {
					res[unitKey] = input.value;
					chrome.storage.local.set({ [unitKey]: input.value }, flashSaved);
				};
			});
		}
		fillUnits();
		unitCard.append(tribeGrid, unitList);

		// --- Right column: report badges (+ override notice in global view) ---
		const side = el('div', 'lc-side');
		const badgeCard = el('section', 'card lc-card');
		const badgeHead = el('div', 'lc-card__head');
		badgeHead.appendChild(el('span', 'lc-card__title', 'Report badges'));
		badgeCard.appendChild(badgeHead);

		const autoRow = el('label', 'lc-line');
		autoRow.appendChild(el('span', 'lc-line__label', 'Show on reports'));
		const autoChk = document.createElement('input');
		autoChk.type = 'checkbox';
		autoChk.className = 'switch';
		autoChk.checked = !!autoEnabled;
		autoChk.onchange = () => chrome.storage.local.set({ [lcKey('auto_enabled', server)]: autoChk.checked }, flashSaved);
		autoRow.appendChild(autoChk);
		badgeCard.append(autoRow, buildOffsetRow(server, offX, offY));
		side.appendChild(badgeCard);
		if (isGlobal) side.appendChild(buildOverrideNotice());

		settingsRoot.append(unitCard, side);
	}

	async function initLootCalcTab() {
		const servers = await discoverServers();
		const current = await detectCurrentServer();
		// A server visited for the first time has no keys yet, so discovery
		// misses it — add it so its settings are editable right away.
		if (current && !servers.includes(current)) {
			servers.push(current);
			servers.sort();
		}

		serverSelect.innerHTML = '';
		// "Default (all servers)" is always present, so the default unit can be
		// set before ever visiting a new server. It is not the initial
		// selection though: the server being played is the useful one to land
		// on, and editing the default by accident is the confusing case.
		const globalOpt = document.createElement('option');
		globalOpt.value = LC_GLOBAL;
		globalOpt.textContent = 'Default (all servers)';
		serverSelect.appendChild(globalOpt);
		for (const s of servers) {
			const opt = document.createElement('option');
			opt.value = s;
			opt.textContent = s === current ? `${s} (current)` : s;
			serverSelect.appendChild(opt);
		}

		const initial = current || LC_GLOBAL;
		serverSelect.value = initial;
		serverSelect.onchange = () => renderServerSettings(serverSelect.value);
		renderServerSettings(initial);
	}
	initLootCalcTab();
})();
