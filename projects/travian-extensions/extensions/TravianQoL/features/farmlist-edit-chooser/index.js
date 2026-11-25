// Farm-list edit chooser.
// The map tile dialog shows "Edit farm list (Already in several farm lists)"
// for a target that sits in more than one farm list, but its link only ever
// opens ONE of those slots. This feature adds one link per farm list that
// holds the target, so the user can pick which slot to edit.
//
// Data source: the game never tells the map dialog which other lists hold the
// target, so we keep a per-server index built passively from the Farm List
// page. Every rendered slot row carries its list id, slot id and target link;
// the page's bootstrap data lists each farm list's slot ids, which lets us
// drop deleted slots and tell which lists have not been opened yet. The
// native EDIT link in each map dialog adds one more known slot for free.
//
// Compliance note: nothing is fetched and no game function is called by the
// extension. The added links are copies of the native link with only the list
// and slot ids changed; the game runs them when the user clicks one. The troop
// and active-state presets are removed from the copies, so the game's edit
// dialog loads the chosen slot's own values instead of the first list's.
// Added rows reuse the game's own option class and inline styles only.
(function () {
	const STORE_PREFIX = 'travianQoL.farmSlots.';
	const SCAN_DELAY_MS = 150;
	const INDENT = '16px';

	// Game links already handled, and the nodes we added. Kept in the closure
	// so no marker class, attribute or stylesheet reaches the page.
	let handled = new WeakSet();
	const added = new Set();
	let observer = null;
	let scanTimer = null;
	let scanning = false;

	const storeKey = () => STORE_PREFIX + location.host;
	const isMapPage = () => /^\/(karte\.php|map|position_details\.php)/.test(location.pathname);
	const isFarmListPage = () => new URLSearchParams(location.search).get('tt') === '99';

	function cleanText(text) {
		return String(text ?? '')
			.replace(/[‪-‮‎‏⁦-⁩]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function readStore() {
		return new Promise((resolve) => {
			try {
				chrome.storage.local.get([storeKey()], (res) => resolve(res?.[storeKey()] || { lists: {} }));
			} catch (err) {
				console.warn('[TravianQoL] farm slot index unavailable', err);
				resolve(null);
			}
		});
	}

	async function updateStore(mutate) {
		const store = await readStore();
		if (!store) return null;
		const before = JSON.stringify(store);
		store.lists = store.lists || {};
		mutate(store);
		if (JSON.stringify(store) !== before) {
			store.updatedAt = Date.now();
			chrome.storage.local.set({ [storeKey()]: store });
		}
		return store;
	}

	function ensureList(store, listId) {
		store.lists[listId] = store.lists[listId] || { slots: {} };
		store.lists[listId].slots = store.lists[listId].slots || {};
		return store.lists[listId];
	}

	// --- Farm List page --------------------------------------------------

	function targetOf(row) {
		const href = row.querySelector('td.target a')?.getAttribute('href');
		if (!href) return null;
		const params = new URL(href, location.href).searchParams;
		const x = parseInt(params.get('x'), 10);
		const y = parseInt(params.get('y'), 10);
		return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
	}

	function readHeaders() {
		const lists = [];
		for (const wrapper of document.querySelectorAll('.farmListWrapper')) {
			const id = wrapper.querySelector('.dragAndDrop[data-list]')?.dataset.list;
			if (!/^\d+$/.test(id || '')) continue;
			const villageHeader = wrapper.closest('.villageWrapper')?.querySelector(':scope > .villageHeader');
			lists.push({
				id,
				name: cleanText(wrapper.querySelector('.farmListName .name')?.textContent),
				village: cleanText(villageHeader?.textContent),
			});
		}
		return lists;
	}

	// Slot ids per list from the page's bootstrap data: { listId: [slotIds] }.
	function readSlotStates() {
		const script = [...document.scripts].find(
			(s) => !s.src && s.textContent.includes('FarmList.render') && s.textContent.includes('"slotsStates"'),
		);
		if (!script) return null;
		const out = {};
		const listRe = /\{"id":(\d+),"name":"(?:[^"\\]|\\.)*","slotsAmount":\d+[\s\S]*?"slotsStates":\[([^\]]*)\]/g;
		for (const m of script.textContent.matchAll(listRe)) {
			out[m[1]] = [...m[2].matchAll(/"id":(\d+)/g)].map((s) => s[1]);
		}
		return Object.keys(out).length ? out : null;
	}

	function readRows() {
		const rows = [];
		for (const input of document.querySelectorAll('tr.slot input[data-farm-list-id][data-slot-id]')) {
			const { farmListId, slotId } = input.dataset;
			const target = targetOf(input.closest('tr'));
			if (/^\d+$/.test(farmListId) && /^\d+$/.test(slotId) && target) rows.push({ listId: farmListId, slotId, target });
		}
		return rows;
	}

	function mergeFarmListPage(store, headers, states, rows) {
		if (headers.length) {
			const ids = new Set(headers.map((h) => h.id));
			for (const id of Object.keys(store.lists)) if (!ids.has(id)) delete store.lists[id];
			headers.forEach((h, order) => Object.assign(ensureList(store, h.id), { name: h.name, village: h.village, order }));
		}
		for (const [listId, slotIds] of Object.entries(states || {})) {
			const list = ensureList(store, listId);
			const keep = new Set(slotIds);
			for (const slotId of Object.keys(list.slots)) if (!keep.has(slotId)) delete list.slots[slotId];
			list.slotIds = slotIds;
		}
		for (const { listId, slotId, target } of rows) ensureList(store, listId).slots[slotId] = target;
	}

	async function scanFarmListPage() {
		const headers = readHeaders();
		const rows = readRows();
		if (!headers.length && !rows.length) return;
		const states = readSlotStates();
		await updateStore((store) => mergeFarmListPage(store, headers, states, rows));
	}

	// --- Map tile dialog -------------------------------------------------

	function parseEditLink(onclick) {
		const listId = onclick.match(/listId:\s*(\d+)/)?.[1];
		const slotId = onclick.match(/editSlotIds:\s*\[\s*(\d+)/)?.[1];
		const coords = onclick.match(/coordinates:\s*\{\s*x:\s*(-?\d+)\s*,\s*y:\s*(-?\d+)\s*\}/);
		if (!listId || !slotId || !coords || !/SLOT_DIALOG_TYPE_EDIT/.test(onclick)) return null;
		return { listId, slotId, target: [Number(coords[1]), Number(coords[2])] };
	}

	// Copy of the native handler for another slot. Only digits are inserted;
	// the troop and active presets are removed so the dialog loads the slot.
	function editHandlerFor(nativeOnclick, listId, slotId) {
		return nativeOnclick
			.replace(/listId:\s*\d+/, `listId: ${Number(listId)}`)
			.replace(/editSlotIds:\s*\[[^\]]*\]/, `editSlotIds: [${Number(slotId)}]`)
			.replace(/,\s*selectedTroop:\s*\{[^}]*\}/, '')
			.replace(/,\s*selectedActive:\s*(true|false)/, '');
	}

	function slotFor(list, x, y) {
		return Object.entries(list.slots || {}).find(([, t]) => t[0] === x && t[1] === y)?.[0];
	}

	function matchingLists(store, parsed) {
		const [x, y] = parsed.target;
		return Object.entries(store.lists)
			.map(([listId, list]) => ({ listId, list, slotId: slotFor(list, x, y) }))
			.filter((entry) => entry.slotId)
			.sort((a, b) => (a.list.order ?? Infinity) - (b.list.order ?? Infinity));
	}

	// Lists whose slots are not all known. null when no list's slot ids are known.
	function unloadedCount(store) {
		const lists = Object.values(store.lists);
		if (!lists.some((l) => Array.isArray(l.slotIds))) return null;
		return lists.filter((l) => !Array.isArray(l.slotIds) || l.slotIds.some((id) => !(id in l.slots))).length;
	}

	function listLabel({ list, listId }) {
		const name = list.name || `List ${listId}`;
		return list.village ? `${list.village} - ${name}` : name;
	}

	function makeOption(nativeOption) {
		const option = document.createElement('div');
		option.className = nativeOption.className;
		option.style.paddingLeft = INDENT;
		added.add(option);
		return option;
	}

	function renderChooser(link, store, parsed) {
		const matches = matchingLists(store, parsed);
		// One known list: the native edit link already opens the right slot.
		if (matches.length <= 1) return;
		const nativeOption = link.closest('.option') || link.parentElement;
		const nativeOnclick = link.getAttribute('onclick');
		let anchor = nativeOption;
		for (const entry of matches) {
			const option = makeOption(nativeOption);
			const a = document.createElement('a');
			a.className = link.className;
			a.setAttribute('onclick', editHandlerFor(nativeOnclick, entry.listId, entry.slotId));
			a.textContent = listLabel(entry);
			option.appendChild(a);
			anchor.after(option);
			anchor = option;
		}
		const missing = unloadedCount(store);
		if (missing === 0) return;
		const hint = makeOption(nativeOption);
		hint.style.fontSize = '11px';
		hint.style.opacity = '0.8';
		hint.textContent = missing
			? `${missing} farm list${missing === 1 ? "" : "s"} not loaded: expand ${missing === 1 ? "it" : "them"} once on the Farm List page`
			: 'Open the Farm List page once to load all farm lists';
		anchor.after(hint);
	}

	async function scanMapDialogs() {
		for (const details of document.querySelectorAll('.farmListDetails')) {
			const link = details.closest('a');
			if (!link || handled.has(link)) continue;
			handled.add(link);
			const parsed = parseEditLink(link.getAttribute('onclick') || '');
			if (!parsed) continue;
			const store = await updateStore((s) => {
				ensureList(s, parsed.listId).slots[parsed.slotId] = parsed.target;
			});
			if (store && link.isConnected) renderChooser(link, store, parsed);
		}
	}

	// --- Wiring ------------------------------------------------------------

	async function scan() {
		if (scanning) return;
		scanning = true;
		try {
			if (isFarmListPage()) await scanFarmListPage();
			if (isMapPage()) await scanMapDialogs();
		} catch (err) {
			console.warn('[TravianQoL] farm-list edit chooser scan failed', err);
		} finally {
			scanning = false;
		}
	}

	// Throttle, not debounce: other widgets mutate the page constantly and
	// would keep a debounce from ever firing.
	function scheduleScan() {
		if (scanTimer) return;
		scanTimer = setTimeout(() => {
			scanTimer = null;
			scan();
		}, SCAN_DELAY_MS);
	}

	window.TravianQoL.register({
		id: 'farmlist-edit-chooser',
		label: 'Farm list edit chooser',
		description: 'On the map, a target that is in several farm lists gets one edit link per list. Lists become known after they are opened on the Farm List page.',
		init() {
			if (!isMapPage() && !isFarmListPage()) return;
			const root = (isFarmListPage() && document.getElementById('content')) || document.body;
			observer = new MutationObserver(scheduleScan);
			observer.observe(root, { childList: true, subtree: true });
			scheduleScan();
		},
		destroy() {
			observer?.disconnect();
			observer = null;
			clearTimeout(scanTimer);
			scanTimer = null;
			added.forEach((el) => el.remove());
			added.clear();
			handled = new WeakSet();
		},
	});
})();
