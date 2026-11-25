// Farm-list bounty sort.
// When the user picks "By bounty" from Travian's sort menu, we enter a
// persistent "bounty mode" that sorts every farm list on the page by:
//   * Last raid bounty, DESCENDING by default (most profitable first).
//     Picking "By bounty" again while the mode is on flips the direction.
//   * Distance from the sending village, ASCENDING, as a tie-breaker.
//
// Mode persistence is important because Travian's React tree re-renders the
// slot rows in response to all sorts of unrelated actions (opening a context
// menu, navigating between lists, periodic refreshes) and each re-render
// reverts row order back to React's own state. A single sort-on-click is not
// enough — we install a MutationObserver per tbody that re-applies the sort
// whenever the rows reorder, for as long as bounty mode is active. Picking
// any other sort (a column header, a non-bounty option in the lastRaid
// menu) turns the mode off. The active flag is stored in chrome.storage.local
// so it survives page navigation within the same Chrome profile.
//
// Enabled first: clicking the empty header above the slot state column toggles
// a second, persistent mode that moves disabled slots (tr.slot.disabled) below
// the enabled ones. It is a stable grouping, so each group keeps the current
// order (native column sort or bounty sort). Both modes live in this module
// because two independent sorters on the same rows would undo each other.
//
// Compliance note: we only reorder existing <tr> elements inside the page's
// own table. No raids are sent, no events are dispatched to game endpoints,
// no timers run. Equivalent to the user clicking column headers manually.
// The header toggle reuses the game's own sorting-arrow markup and classes.
(function () {
	const STATE_KEY = 'travianQoL.bountySort.active';
	const DIR_KEY = 'travianQoL.bountySort.dir'; // 'desc' | 'asc'
	const ENABLED_KEY = 'travianQoL.enabledSort.active';
	const RESORT_DELAY_MS = 120;
	let active = false;
	let enabledFirst = false;
	const headerControls = new Set(); // our toggles inside th.state
	let dir = 'desc';
	let applying = false; // re-entry guard for our own appendChild calls
	let clickHandler = null;
	let storageListener = null;
	let rootObserver = null; // single subtree observer that survives re-renders
	let resortTimer = null;

	function parseNum(text) {
		if (!text) return NaN;
		// Strip Travian's invisible bidi markers and any non-numeric formatting
		// (commas, dots used as thousands separators) so we can compare as ints.
		const cleaned = String(text).replace(/[‪-‮⁦-⁩​-‏]/g, '').replace(/[^\d.-]/g, '');
		return cleaned ? parseFloat(cleaned) : NaN;
	}

	function readRow(slot) {
		const bounty = parseNum(slot.querySelector('.lastRaidBounty .value')?.textContent);
		// The .distance cell holds the number in a plain <span> with no class,
		// not a .value span like the bounty cells do. Read the cell text
		// directly to stay robust to either layout.
		const distance = parseNum(
			slot.querySelector('.distance .value')?.textContent ??
				slot.querySelector('.distance')?.textContent,
		);
		return { bounty, distance, disabled: slot.classList.contains('disabled') };
	}

	// Rows without a bounty always go last, whichever the direction.
	function byBounty(rowData) {
		const missing = dir === 'asc' ? Infinity : -Infinity;
		return rowData.slice().sort((a, b) => {
			const aB = Number.isFinite(a.bounty) ? a.bounty : missing;
			const bB = Number.isFinite(b.bounty) ? b.bounty : missing;
			if (aB !== bB) return dir === 'asc' ? aB - bB : bB - aB;
			const aD = Number.isFinite(a.distance) ? a.distance : Infinity;
			const bD = Number.isFinite(b.distance) ? b.distance : Infinity;
			return aD - bD;
		});
	}

	// Stable: each group keeps its current order.
	function enabledFirstOrder(rowData) {
		return [...rowData.filter((r) => !r.disabled), ...rowData.filter((r) => r.disabled)];
	}

	function sortTable(table) {
		const tbody = table.querySelector('tbody');
		if (!tbody) return;
		const rows = [...tbody.querySelectorAll(':scope > tr.slot')];
		if (rows.length < 2) return;
		const rowData = rows.map((row) => ({ row, ...readRow(row) }));
		let sorted = active ? byBounty(rowData) : rowData;
		if (enabledFirst) sorted = enabledFirstOrder(sorted);
		// Quick check: if the rows are already in the desired order, skip the
		// appendChild loop entirely. Avoids triggering our own observer.
		const identical = sorted.every((s, i) => s.row === rowData[i].row);
		if (identical) return;
		// Moving rows must not move the page. Browser scroll anchoring picks a
		// visible row as anchor and scrolls to follow it when we move it, which
		// made the page jump whenever a farm list was opened. Exclude the rows
		// from anchor selection and restore the scroll position as a backup.
		tbody.style.overflowAnchor = 'none';
		const { scrollX, scrollY } = window;
		for (const { row } of sorted) tbody.appendChild(row);
		// The "Add target" row and any other non-.slot trailing row belong
		// at the very bottom of the list — our loop above would otherwise
		// push them above the sorted slots.
		const trailing = tbody.querySelectorAll(':scope > tr:not(.slot)');
		for (const t of trailing) tbody.appendChild(t);
		if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY);
	}

	const isSorting = () => active || enabledFirst;

	// Toggle in the empty th.state header: a copy of the game's sorting arrow,
	// greyed out (game class "inactive") while the mode is off.
	function ensureHeaderControls() {
		for (const th of document.querySelectorAll('table.slots thead th.state')) {
			let control = [...headerControls].find((c) => c.parentElement === th);
			if (!control) {
				control = document.createElement('div');
				control.style.cursor = 'pointer';
				control.title = 'Enabled first';
				control.innerHTML = '<svg viewBox="0 0 10 5" class="sortingArrow up"><path d="M0 5l5-5 5 5z"></path></svg>';
				th.appendChild(control);
				headerControls.add(control);
			}
			control.firstElementChild.classList.toggle('inactive', !enabledFirst);
		}
		for (const c of headerControls) if (!c.isConnected) headerControls.delete(c);
	}

	function sortNow() {
		if (applying) return;
		applying = true;
		try {
			ensureHeaderControls();
			if (isSorting()) for (const t of document.querySelectorAll('table.slots')) sortTable(t);
		} finally {
			applying = false;
		}
	}

	function sortAll() {
		sortNow();
		startRootObserver();
	}

	function startRootObserver() {
		if (rootObserver) return;
		// Watch ONE stable ancestor for the whole subtree instead of binding to
		// each <tbody>. Travian's React tree frequently REPLACES the table/tbody
		// (periodic farm-list refresh, returning raids, village switch, …); a
		// per-tbody observer is left watching a detached node and silently dies,
		// so the order reverts to native until the user re-picks the sort. A
		// subtree observer on a node that outlives those re-renders keeps working.
		//
		// Scope the root to the farm-list panel, NOT document.body: other
		// extensions on the page (e.g. an alarm widget that rebuilds itself a few
		// times a second) fire a constant stream of unrelated childList mutations
		// that would perpetually reset our debounce and starve the re-sort. The
		// rally-point panel only mutates when the farm lists themselves change.
		const root =
			document.querySelector('.buildRallyPointFarmList') ||
			document.getElementById('content') ||
			document.body;
		if (!root) return;
		rootObserver = new MutationObserver(() => {
			if (applying) return;
			// Header toggle must come back after re-renders even with no sort on.
			if (!isSorting()) {
				applying = true;
				try { ensureHeaderControls(); } finally { applying = false; }
				return;
			}
			// Sort at once: the observer runs before the browser paints, so a
			// newly opened farm list never shows its native order first. A
			// debounced second pass then sorts the FINAL order of a multi-step
			// re-render. sortTable() early-returns when already sorted, so
			// mutations caused by our own appendChild converge without looping.
			sortNow();
			clearTimeout(resortTimer);
			resortTimer = setTimeout(() => {
				if (isSorting() && !applying) sortNow();
			}, RESORT_DELAY_MS);
		});
		rootObserver.observe(root, { childList: true, subtree: true });
	}

	function setActive(value) {
		if (active === value) return;
		active = value;
		chrome.storage.local.set({ [STATE_KEY]: value });
		if (value) sortAll();
	}

	// True for the exact "Bounty" (last-raid bounty) sort — NOT "Total bounty"
	// or "Average bounty", which are separate options that must not activate us.
	function isBountyText(text) {
		return /\bbounty\b/.test(text) && !/total|average|sum/.test(text);
	}

	function classifySortClick(ev) {
		// Returns 'bounty' if the click activates bounty sort, 'other' if it
		// activates any other sort (which should turn bounty mode off), or
		// null if the click is unrelated to sorting.
		// 1) A click on a sortable column header → some other sort is active.
		const sortableTh = ev.target.closest('th.sortable');
		if (sortableTh) return 'other';
		// 2) A click on an option inside Travian's lastRaid sort menu. The menu
		//    is portalled out to `.contextMenuWrapper > .contextMenu.sorting`
		//    with one anchor per option (a.bounty, a.combatResult, a.lastRaid,
		//    a.totalBounty, a.nextAttack, …). Exactly one of them — the
		//    last-raid "Bounty" pick — turns bounty mode on; EVERY other option
		//    turns it off. The previous keyword allow-list silently missed
		//    "Combat result", "Next attack" and "Total bounty", which left
		//    bounty mode stuck on and fighting the user's actual choice.
		const option = ev.target.closest(
			'.contextMenu.sorting a, .contextMenuWrapper .contextMenu a',
		);
		if (option) {
			const text = (option.textContent || '').trim().toLowerCase();
			return option.matches('a.bounty') || isBountyText(text) ? 'bounty' : 'other';
		}
		// 3) Fallback for other skins/layouts: text-based detection within any
		//    menu-shaped container. (The .sorting link inside th.lastRaid that
		//    merely opens the menu has no text, so it correctly yields null.)
		const candidate = ev.target.closest('a, button, li, [role="menuitem"], [class*="dropdown"] *, [class*="menu"] *');
		if (!candidate) return null;
		const text = (candidate.textContent || '').toLowerCase();
		if (!text) return null;
		if (isBountyText(text)) return 'bounty';
		if (candidate.closest('.contextMenuWrapper, [class*="contextMenu" i], [class*="dropdown" i], [class*="menu" i]')) {
			if (/(sort|time|raid|name|population|distance|troops|combat|attack|result|bounty)/.test(text)) return 'other';
		}
		return null;
	}

	function setDir(value) {
		dir = value === 'asc' ? 'asc' : 'desc';
		chrome.storage.local.set({ [DIR_KEY]: dir });
	}

	function setEnabledFirst(value) {
		enabledFirst = !!value;
		chrome.storage.local.set({ [ENABLED_KEY]: enabledFirst });
		sortAll();
	}

	function onClick(ev) {
		const stateTh = ev.target.closest('table.slots thead th.state');
		if (stateTh && [...headerControls].some((c) => stateTh.contains(c))) {
			setEnabledFirst(!enabledFirst);
			return;
		}
		const kind = classifySortClick(ev);
		if (kind === 'bounty') {
			// First pick: high to low. Picking it again: flip the direction.
			if (active) {
				setDir(dir === 'desc' ? 'asc' : 'desc');
				sortAll();
			} else {
				setDir('desc');
				setActive(true);
			}
		} else if (kind === 'other') setActive(false);
	}

	window.TravianQoL.register({
		id: 'farmlist-bounty-sort',
		label: 'Farm list sorting',
		description: 'When "By bounty" is selected, keeps targets sorted by last bounty (high to low; pick it again for low to high) with distance as a tie-breaker, until another sort is chosen. The arrow above the slot state column toggles enabled targets first.',
		init() {
			// Page-scope guard: only run on the farm list page.
			const url = location.pathname + location.search;
			// build.php was renamed to /building; accept both.
			const onFarmListUrl = /^\/(build\.php|building)\b/.test(url) && /\btt=99\b/.test(url);
			const hasFarmListDom = document.querySelector('.farmListWrapper, .raidList, [class*="raidList"], [class*="farmList"]') !== null;
			if (!onFarmListUrl && !hasFarmListDom) return;

			if (clickHandler) return;
			clickHandler = onClick;
			document.addEventListener('click', clickHandler, true);

			// Restore the persisted active state and start observing/sorting.
			// Start the re-render observer either way so an activation later in
			// the session is honoured even if the lists were empty at load.
			chrome.storage.local.get([STATE_KEY, DIR_KEY, ENABLED_KEY], (res) => {
				active = !!res[STATE_KEY];
				enabledFirst = !!res[ENABLED_KEY];
				dir = res[DIR_KEY] === 'asc' ? 'asc' : 'desc';
				sortAll();
			});

			// Watch for the flag changing in another tab (or via options).
			storageListener = (changes, area) => {
				if (area !== 'local') return;
				if (changes[DIR_KEY]) dir = changes[DIR_KEY].newValue === 'asc' ? 'asc' : 'desc';
				if (changes[STATE_KEY]) active = !!changes[STATE_KEY].newValue;
				if (changes[ENABLED_KEY]) enabledFirst = !!changes[ENABLED_KEY].newValue;
				if (changes[ENABLED_KEY] || (active && (changes[STATE_KEY] || changes[DIR_KEY]))) sortAll();
			};
			chrome.storage.onChanged.addListener(storageListener);
		},
		destroy() {
			if (clickHandler) {
				document.removeEventListener('click', clickHandler, true);
				clickHandler = null;
			}
			if (storageListener) {
				chrome.storage.onChanged.removeListener(storageListener);
				storageListener = null;
			}
			if (rootObserver) {
				rootObserver.disconnect();
				rootObserver = null;
			}
			clearTimeout(resortTimer);
			resortTimer = null;
			headerControls.forEach((c) => c.remove());
			headerControls.clear();
			active = false;
			enabledFirst = false;
		},
	});
})();
