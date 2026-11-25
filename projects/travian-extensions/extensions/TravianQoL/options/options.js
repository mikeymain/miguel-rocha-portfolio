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
	function activateTab(tab) {
		tabs.forEach((t) => {
			const active = t === tab;
			t.classList.toggle('is-active', active);
			t.setAttribute('aria-selected', active ? 'true' : 'false');
			t.setAttribute('tabindex', active ? '0' : '-1');
		});
		panels.forEach((p) => p.classList.toggle('is-active', p.id === `tab-${tab.dataset.tab}`));
	}
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
		{ id: 'farm', name: 'Farm lists', col: 0, ids: ['farmlist-multi-select', 'farmlist-bounty-sort', 'farmlist-edit-chooser'] },
		{ id: 'reports', name: 'Reports', col: 0, ids: ['report-opener', 'loot-calc'] },
		{ id: 'hero', name: 'Hero', col: 0, ids: ['adventure-sort'] },
		{ id: 'resources', name: 'Resources', col: 1, ids: ['village-resource-total', 'resource-full-time', 'trade-route-production', 'upgrade-values'] },
		{ id: 'tools', name: 'Tools', col: 1, ids: ['todolist'] },
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
	const BASE_TRIBES = {
		Romans: [['Legionnaire', 50], ['Praetorian', 20], ['Imperian', 50], ['Equites Imperatoris', 100], ['Equites Caesaris', 70]],
		Teutons: [['Clubswinger', 60], ['Axeman', 50], ['Paladin', 110], ['Teutonic Knight', 80]],
		Gauls: [['Phalanx', 35], ['Swordsman', 45], ['Theutates Thunder', 75], ['Druidrider', 35], ['Haeduan', 65]],
		Egyptians: [['Slave Militia', 15], ['Ash Warden', 50], ['Khopesh Warrior', 45], ['Anhur Guard', 50], ['Resheph Chariot', 70]],
		Huns: [['Mercenary', 50], ['Bowman', 30], ['Steppe Rider', 75], ['Marksman', 105], ['Marauder', 80]],
		Spartans: [['Hoplite', 60], ['Shieldsman', 40], ['Twinsteel Therion', 50], ['Elpida Rider', 110], ['Corinthian Crusher', 80]],
	};

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

	async function renderServerSettings(server) {
		const isGlobal = server === LC_GLOBAL;
		const tribeKeys = Object.keys(BASE_TRIBES);
		const keys = ['auto_enabled', 'tribe', 'debug', 'offset_x', 'offset_y'].map((s) => lcKey(s, server));
		// Global units are read in both modes: in per-server mode they name the
		// value the "(none)" option actually falls back to.
		keys.push(...tribeKeys.map((t) => lcKey('auto_unit', LC_GLOBAL, t)));
		if (!isGlobal) keys.push(lcKey('auto_unit', server));
		const res = await chrome.storage.local.get(keys);

		const autoEnabled = res[lcKey('auto_enabled', server)] ?? true;
		const debug = res[lcKey('debug', server)] ?? false;
		const offX = res[lcKey('offset_x', server)] ?? DEFAULT_OFFSET_X;
		const offY = res[lcKey('offset_y', server)] ?? DEFAULT_OFFSET_Y;
		// In global scope the tribe select picks *which tribe's* default unit
		// you are editing; land on one that already has a unit saved.
		const tribe = isGlobal
			? tribeKeys.find((t) => res[lcKey('auto_unit', server, t)]) || 'Teutons'
			: res[lcKey('tribe', server)] || 'Teutons';

		settingsRoot.innerHTML = '';

		if (isGlobal) {
			const note = document.createElement('div');
			note.className = 'lc-note';
			note.textContent = 'Applies to servers without their own settings.';
			settingsRoot.appendChild(note);
		}

		// Bind label -> input via `for`/`id` so screen readers announce the
		// label when the select gains focus.
		const tribeRow = document.createElement('div');
		tribeRow.className = 'lc-row';
		const tribeLbl = document.createElement('label');
		tribeLbl.htmlFor = 'lc-tribe';
		tribeLbl.textContent = isGlobal ? 'Default unit for tribe' : 'Tribe';
		tribeRow.appendChild(tribeLbl);
		const tribeSel = document.createElement('select');
		tribeSel.id = 'lc-tribe';
		for (const t of tribeKeys) {
			const opt = document.createElement('option');
			opt.value = t;
			opt.textContent = t;
			if (t === tribe) opt.selected = true;
			tribeSel.appendChild(opt);
		}
		tribeRow.appendChild(tribeSel);

		const unitRow = document.createElement('div');
		unitRow.className = 'lc-row';
		const unitLbl = document.createElement('label');
		unitLbl.htmlFor = 'lc-unit';
		unitLbl.textContent = 'Default unit';
		unitRow.appendChild(unitLbl);
		const unitSel = document.createElement('select');
		unitSel.id = 'lc-unit';
		function fillUnits(forTribe) {
			const selected = isGlobal
				? res[lcKey('auto_unit', server, forTribe)] || ''
				: res[lcKey('auto_unit', server)] || '';
			const builtin = BUILTIN_DEFAULT_UNIT[forTribe];
			const fallback = res[lcKey('auto_unit', LC_GLOBAL, forTribe)] || builtin;
			unitSel.innerHTML = '';
			const blank = document.createElement('option');
			blank.value = '';
			if (isGlobal) blank.textContent = builtin ? `(built-in: ${builtin})` : '(none)';
			else blank.textContent = fallback ? `(use default: ${fallback})` : '(none)';
			unitSel.appendChild(blank);
			for (const [name, cap] of BASE_TRIBES[forTribe] || []) {
				const opt = document.createElement('option');
				opt.value = name;
				opt.textContent = `${name} (${cap})`;
				if (name === selected) opt.selected = true;
				unitSel.appendChild(opt);
			}
		}
		fillUnits(tribe);
		unitRow.appendChild(unitSel);

		const autoRow = document.createElement('label');
		autoRow.className = 'lc-row lc-row--check';
		const autoChk = document.createElement('input');
		autoChk.type = 'checkbox';
		autoChk.className = 'switch';
		autoChk.checked = !!autoEnabled;
		autoRow.append(autoChk, document.createTextNode('Unit badges on report pages'));

		const debugRow = document.createElement('label');
		debugRow.className = 'lc-row lc-row--check';
		const debugChk = document.createElement('input');
		debugChk.type = 'checkbox';
		debugChk.className = 'switch';
		debugChk.checked = !!debug;
		debugRow.append(debugChk, document.createTextNode('Debug logging'));

		const offRow = document.createElement('div');
		offRow.className = 'lc-row';
		const offLbl = document.createElement('label');
		offLbl.htmlFor = 'lc-offx';
		offLbl.textContent = 'Badge offset X / Y';
		offRow.appendChild(offLbl);
		const offXInput = document.createElement('input');
		offXInput.type = 'number';
		offXInput.id = 'lc-offx';
		offXInput.value = offX;
		offXInput.className = 'lc-num';
		offXInput.setAttribute('aria-label', 'Badge X offset');
		const offYInput = document.createElement('input');
		offYInput.type = 'number';
		offYInput.value = offY;
		offYInput.className = 'lc-num';
		offYInput.setAttribute('aria-label', 'Badge Y offset');
		offRow.append(offXInput, offYInput);

		settingsRoot.append(tribeRow, unitRow, autoRow, debugRow, offRow);

		// Global view only: name the servers that shadow this default, and
		// offer to drop their overrides so it takes effect everywhere.
		if (isGlobal) {
			const overrideRow = document.createElement('div');
			overrideRow.className = 'lc-override';
			unitRow.after(overrideRow);
			const renderOverrides = async () => {
				const overrides = await findUnitOverrides();
				overrideRow.innerHTML = '';
				overrideRow.hidden = overrides.length === 0;
				if (overrides.length === 0) return;
				const text = document.createElement('span');
				text.textContent =
					`${overrides.length} server${overrides.length === 1 ? '' : 's'} ignore this default, ` +
					`having a unit of their own: ${overrides.map((o) => `${o.host} (${o.unit})`).join(', ')}.`;
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'btn';
				btn.textContent = 'Clear server overrides';
				btn.onclick = async () => {
					await chrome.storage.local.remove(overrides.map((o) => `tlw_auto_unit_${o.host}`));
					flashSaved();
					renderOverrides();
				};
				overrideRow.append(text, btn);
			};
			renderOverrides();
		}

		// Persist on change. We write each setting individually so partial
		// edits are immediately visible to the in-page feature.
		tribeSel.onchange = () => {
			// Global scope: the tribe select is a filter, not a saved setting.
			if (!isGlobal) chrome.storage.local.set({ [lcKey('tribe', server)]: tribeSel.value }, flashSaved);
			fillUnits(tribeSel.value);
		};
		unitSel.onchange = () => {
			const key = lcKey('auto_unit', server, tribeSel.value);
			res[key] = unitSel.value;
			chrome.storage.local.set({ [key]: unitSel.value }, flashSaved);
		};
		autoChk.onchange = () => chrome.storage.local.set({ [lcKey('auto_enabled', server)]: autoChk.checked }, flashSaved);
		debugChk.onchange = () => chrome.storage.local.set({ [lcKey('debug', server)]: debugChk.checked }, flashSaved);
		offXInput.oninput = () => {
			const v = parseInt(offXInput.value, 10);
			if (Number.isFinite(v)) chrome.storage.local.set({ [lcKey('offset_x', server)]: v }, flashSaved);
		};
		offYInput.oninput = () => {
			const v = parseInt(offYInput.value, 10);
			if (Number.isFinite(v)) chrome.storage.local.set({ [lcKey('offset_y', server)]: v }, flashSaved);
		};
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
