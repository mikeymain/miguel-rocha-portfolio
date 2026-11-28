// Build order.
// On the resources view (dorf1), marks the resource field with the best
// payback as the next upgrade: only that one field glows. While the account
// has one village, the starting guide (guide-4p.js) drives the glow instead:
// the field on the resources view, the building in the village centre. The step list and
// the per-village production bonus live in the QoL settings "Build order"
// tab; this script saves each village's field levels there and re-ranks when
// the bonus changes.
// Ranking: features/build-order/core.js.
//
// Compliance note: read-only DOM change plus extension storage. No clicks,
// no network calls.
(function () {
	const PLAN_DEPTH = 20; // steps planned so queued fields can be skipped
	const DEBOUNCE_MS = 150;
	// Per-host { villageId: [wood, clay, iron, crop] bonus % }.
	const BONUS_PREFIX = 'travianQoL.buildOrder.';
	// Per-host { villageId: { name, fields: [{slot, gid, level}], updatedAt } }.
	const FIELDS_PREFIX = 'travianQoL.buildFields.';
	// Per-host build queue size learned from the page (at least 1).
	const CAPACITY_PREFIX = 'travianQoL.buildQueueSize.';
	// Per-host { villageId: true } for villages simulated to level 20.
	const MAX20_PREFIX = 'travianQoL.buildMax20.';
	// Per-host { villageId: [starting guide step ids ticked by hand] }.
	const GUIDE_PREFIX = 'travianQoL.buildGuide.';
	const STYLE_ID = 'tqol-bo-style';
	const ORDER_ATTR = 'tqolBo';
	const CSS = `
#resourceFieldContainer a.resourceField[data-tqol-bo="1"] .labelLayer {
	box-shadow: 0 0 0 2px #ffd75e, 0 0 10px 4px rgba(255, 200, 40, .85);
	animation: tqol-bo-glow 1.4s ease-in-out infinite alternate;
}
@keyframes tqol-bo-glow {
	from { box-shadow: 0 0 0 2px #ffd75e, 0 0 6px 2px rgba(255, 200, 40, .6); }
	to   { box-shadow: 0 0 0 2px #ffd75e, 0 0 16px 7px rgba(255, 200, 40, 1); }
}
#villageContent .buildingSlot[data-tqol-bo="1"] {
	filter: drop-shadow(0 0 4px #ffd75e) drop-shadow(0 0 8px rgba(255, 200, 40, .85));
	animation: tqol-bo-pulse 1.4s ease-in-out infinite alternate;
}
@keyframes tqol-bo-pulse {
	from { filter: drop-shadow(0 0 3px #ffd75e) drop-shadow(0 0 5px rgba(255, 200, 40, .6)); }
	to   { filter: drop-shadow(0 0 5px #ffd75e) drop-shadow(0 0 12px rgba(255, 200, 40, 1)); }
}
@media (prefers-reduced-motion: reduce) {
	#resourceFieldContainer a.resourceField[data-tqol-bo="1"] .labelLayer,
	#villageContent .buildingSlot[data-tqol-bo="1"] { animation: none; }
}
`;

	let observer = null;
	let storageListener = null;
	let debounceTimer = null;
	let bonuses = [0, 0, 0, 0];
	let forceMax = false; // per-village "Simulate to level 20" toggle
	let lastSnapshot = '';
	let queueCapacity = 1;
	// Starting guide: ticks by hand and the part of the village snapshot the
	// other view saved (field levels for the village centre, building levels
	// for the resources view).
	let guideManual = new Set();
	let storedFields = null;
	let storedSlots = null;
	let guideReady = false;

	const isResourcesPage = () => /^\/(dorf1\.php|resources)$/.test(location.pathname);
	const isVillagePage = () => /^\/(dorf2\.php|village)$/.test(location.pathname);
	// Buildings the planner uses: boosts 5-9, main building 15, Hero's Mansion 37.
	const TRACKED_GIDS = [5, 6, 7, 8, 9, 15, 37];
	const bonusKey = () => BONUS_PREFIX + location.host;
	const fieldsKey = () => FIELDS_PREFIX + location.host;
	const capacityKey = () => CAPACITY_PREFIX + location.host;

	function activeVillage() {
		return document.querySelector('.villageList .listEntry.active, #sidebarBoxVillageList .listEntry.active');
	}
	function villageId() {
		return activeVillage()?.dataset?.did || 'default';
	}
	/** Villages in the sidebar list (0 if it is not shown). */
	function villageCount() {
		const ids = new Set();
		for (const el of document.querySelectorAll('.villageList .listEntry[data-did], #sidebarBoxVillageList .listEntry[data-did]')) ids.add(el.dataset.did);
		return ids.size;
	}
	// The starting guide drives the highlights until the second village is settled.
	const guideOn = () => !!window.TravianQoLGuide4P && villageCount() === 1;
	function villageName() {
		const el = activeVillage();
		const name = el?.querySelector('.name')?.textContent || el?.textContent || '';
		return name.replace(/[‪-‮‎‏⁦-⁩]/g, '').replace(/\s+/g, ' ').trim() || 'Village';
	}

	// Coordinate text from a .coordinateX/.coordinateY span: "(‭−‭6‬‬" -> -6.
	function coordOf(el) {
		const text = (el?.textContent || '').replace(/[()\s؜‎‏‪-‮⁦-⁩]/g, '').replace(/[−‒–]/g, '-');
		return /^-?\d+$/.test(text) ? Number(text) : NaN;
	}

	/** { x, y } of the active village from the sidebar, or {} if not shown. */
	function villageCoords() {
		const el = activeVillage();
		const x = coordOf(el?.querySelector('.coordinateX'));
		const y = coordOf(el?.querySelector('.coordinateY'));
		return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? { x, y } : {};
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

	// Village snapshot for the settings tab, merged so the resources view
	// (fields) and the village centre (buildings) each keep the other's part.
	// Written only when it changes.
	function saveSnapshot(part) {
		const id = villageId();
		const count = villageCount();
		const entry = { name: villageName(), ...villageCoords(), ...(count ? { count } : {}), ...part };
		const sig = id + JSON.stringify(entry);
		if (sig === lastSnapshot) return;
		lastSnapshot = sig;
		const key = fieldsKey();
		chrome.storage.local.get(key, (res) => {
			const all = res[key] || {};
			const stamp = part.fields ? { updatedAt: Date.now() } : { buildingsAt: Date.now() };
			chrome.storage.local.set({ [key]: { ...all, [id]: { ...(all[id] || {}), ...entry, ...stamp } } });
		});
	}

	/** Levels of the tracked buildings, queued upgrades counted; 0 if absent. */
	function readBuildings() {
		const out = Object.fromEntries(TRACKED_GIDS.map((g) => [g, 0]));
		for (const slot of document.querySelectorAll('#villageContent .buildingSlot[data-gid]')) {
			const gid = Number(slot.dataset.gid);
			if (!(gid in out)) continue;
			const a = slot.querySelector('a[data-level]');
			const level = Number(a?.dataset.level) + (a?.classList.contains('underConstruction') ? 1 : 0);
			if (Number.isFinite(level)) out[gid] = Math.max(out[gid], level);
		}
		return out;
	}

	// Buildings the starting guide checks: main building, warehouse, granary, smithy, rally
	// point, marketplace, embassy, barracks, stable, workshop, academy, cranny,
	// town hall, residence and the tribe walls.
	const GUIDE_GIDS = new Set([10, 11, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 31, 32, 33, 42, 43]);

	/** Levels of every guide building by gid (one entry per slot), queued upgrades counted. */
	function readSlots() {
		const out = {};
		for (const slot of document.querySelectorAll('#villageContent .buildingSlot[data-gid]')) {
			const gid = Number(slot.dataset.gid);
			if (!GUIDE_GIDS.has(gid)) continue;
			const a = slot.querySelector('a[data-level]');
			const level = Number(a?.dataset.level) + (a?.classList.contains('underConstruction') ? 1 : 0);
			if (Number.isFinite(level)) (out[gid] ||= []).push(level);
		}
		return out;
	}

	function scanVillage() {
		if (!document.querySelector('#villageContent .buildingSlot[data-gid]')) return;
		saveSnapshot({ buildings: readBuildings(), slots: readSlots() });
		renderVillage();
	}

	/** Guide buildings in the village centre: { gid, level, el }, queued upgrades counted. */
	function readBuildingEls() {
		const out = [];
		for (const el of document.querySelectorAll('#villageContent .buildingSlot[data-gid]')) {
			const gid = Number(el.dataset.gid);
			if (!GUIDE_GIDS.has(gid)) continue;
			const a = el.querySelector('a[data-level]');
			const level = Number(a?.dataset.level) + (a?.classList.contains('underConstruction') ? 1 : 0);
			if (Number.isFinite(level)) out.push({ gid, level, el });
		}
		return out;
	}

	/** { step, item } for the next starting guide step the game can show, or null. */
	function guideTarget(fields, slots) {
		const guide = window.TravianQoLGuide4P;
		const step = guide.nextStep(fields, slots, guideManual);
		const item = step && guide.firstUnmet(step, fields, slots);
		return item ? { step, item } : null;
	}

	// Village centre: while the guide drives, the building it wants next glows.
	function renderVillage() {
		let mark = null;
		if (guideOn() && storedFields) {
			const target = guideTarget(storedFields, readSlots());
			if (target?.item.k === 'b') mark = window.TravianQoLGuide4P.pickBuilding(target.item, readBuildingEls());
		}
		if (mark) injectStyle();
		for (const el of document.querySelectorAll('#villageContent .buildingSlot[data-tqol-bo]')) {
			if (!mark || el !== mark.el) delete el.dataset[ORDER_ATTR];
		}
		if (mark && mark.el.dataset[ORDER_ATTR] !== '1') mark.el.dataset[ORDER_ATTR] = '1';
	}

	/** Builds in progress; master builder "waiting" rows do not occupy a slot. */
	function queuedCount() {
		let n = 0;
		for (const row of document.querySelectorAll('.buildingList li')) {
			if (row.classList.contains('masterBuilder') || row.querySelector('.buildStart')) continue;
			if (row.querySelector('.timer')) n++;
		}
		return n;
	}

	// Queue size is not in the page, so learn it: the most builds ever seen
	// running at once on this host (1 without Plus, 2 with).
	function learnCapacity(queued) {
		if (queued <= queueCapacity) return;
		queueCapacity = queued;
		chrome.storage.local.set({ [capacityKey()]: queued });
	}

	function render() {
		if (!isResourcesPage()) return;
		const fields = readFields();
		if (!fields.length) return;
		// Wait for the guide ticks so the glow does not flash on the wrong field.
		if (!guideReady && guideOn()) return;
		// `building`: an upgrade to `level` is in the queue (shown in the settings tab).
		saveSnapshot({ fields: fields.map(({ el, slot, gid, level }) => ({ slot, gid, level, ...(el.classList.contains('underConstruction') ? { building: true } : {}) })) });
		const queued = queuedCount();
		learnCapacity(queued);
		const hasFreeSlot = queued < queueCapacity;
		// Plan deep enough to skip fields that already have an upgrade queued:
		// the glow goes to the first step on a field that is not being built.
		const building = new Set(fields.filter((f) => f.el.classList.contains('underConstruction')).map((f) => f.slot));
		let next = null;
		if (guideOn()) {
			// Starting guide: the field it wants next, not the best payback.
			const target = guideTarget(fields, storedSlots);
			const free = fields.filter((f) => !building.has(f.slot));
			next = hasFreeSlot && target?.item.k === 'f' ? window.TravianQoLGuide4P.pickField(target.item, free) : null;
		} else {
			const steps = window.TravianQoLBuildOrder.plan(fields, bonuses, PLAN_DEPTH, undefined, forceMax);
			next = hasFreeSlot ? steps.find((s) => s.kind === 'field' && !building.has(s.slot)) : null;
		}
		injectStyle();
		for (const f of fields) {
			const mark = next && f.slot === next.slot;
			if (mark && f.el.dataset[ORDER_ATTR] !== '1') f.el.dataset[ORDER_ATTR] = '1';
			else if (!mark && f.el.dataset[ORDER_ATTR]) delete f.el.dataset[ORDER_ATTR];
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

	/** Loads the guide ticks and the other view's snapshot, then calls `done`. */
	function loadGuideState(done) {
		const guideKey = GUIDE_PREFIX + location.host;
		const snapKey = fieldsKey();
		chrome.storage.local.get([guideKey, snapKey], (res) => {
			guideManual = new Set(res?.[guideKey]?.[villageId()] || []);
			const snap = res?.[snapKey]?.[villageId()];
			storedFields = snap?.fields || null;
			storedSlots = snap?.slots || null;
			guideReady = true;
			done();
		});
	}

	// Guide ticks edited in the settings tab, or the other view saved its part.
	function watchGuideState(onChange) {
		const guideKey = GUIDE_PREFIX + location.host;
		const snapKey = fieldsKey();
		return (changes, area) => {
			if (area !== 'local' || !(changes[guideKey] || changes[snapKey])) return;
			if (changes[guideKey]) guideManual = new Set(changes[guideKey].newValue?.[villageId()] || []);
			const snap = changes[snapKey]?.newValue?.[villageId()];
			if (snap) {
				storedFields = snap.fields || null;
				storedSlots = snap.slots || null;
			}
			onChange();
		};
	}

	function start() {
		const key = bonusKey();
		const maxKey = MAX20_PREFIX + location.host;
		loadGuideState(render);
		chrome.storage.local.get(maxKey, (res) => {
			forceMax = !!res?.[maxKey]?.[villageId()];
			render();
		});
		chrome.storage.local.get(capacityKey(), (cap) => {
			queueCapacity = Math.max(1, Number(cap?.[capacityKey()]) || 1);
			render();
		});
		chrome.storage.local.get(key, (res) => {
			applyBonuses(res[key]);
			render();
			const container = document.getElementById('resourceFieldContainer') || document.body;
			observer = new MutationObserver(schedule);
			observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
		});
		// Bonus edited in the settings tab: re-rank the highlighted fields.
		const onGuide = watchGuideState(render);
		storageListener = (changes, area) => {
			if (area !== 'local') return;
			onGuide(changes, area);
			if (changes[maxKey]) forceMax = !!changes[maxKey].newValue?.[villageId()];
			if (changes[key]) applyBonuses(changes[key].newValue);
			if (changes[key] || changes[maxKey]) render();
		};
		chrome.storage.onChanged?.addListener(storageListener);
	}

	function startVillage() {
		scanVillage();
		loadGuideState(renderVillage);
		storageListener = watchGuideState(renderVillage);
		chrome.storage.onChanged?.addListener(storageListener);
		const container = document.getElementById('villageContent') || document.body;
		observer = new MutationObserver(() => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(scanVillage, DEBOUNCE_MS);
		});
		observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-level'] });
	}

	// --- Map: tiles seen in tooltips and tile details --------------------
	// Per-host { "x|y": 0 | { b: bonus % [wood, clay, iron, crop], o: occupied } }.
	// The Build order tab reads it to rank the oases in annex range.
	const TILES_PREFIX = 'travianQoL.mapTiles.';
	const TILE_SELECTOR = '#tileDetails, .tippy-box[data-state="visible"]';
	const TILE_SAVE_MS = 500;
	const isMapPage = () => /^\/(karte\.php|map|position_details\.php)$/.test(location.pathname);
	let tileBuffer = {};
	let tileTimer = null;

	/** Bonus % per resource from "<i class="r4"></i> Crop 25%" pairs. */
	function readBonus(box, details) {
		const bonus = [0, 0, 0, 0];
		const icons = details ? box.querySelectorAll('#distribution tr .ico i') : box.querySelectorAll('.text i');
		for (const icon of icons) {
			const r = Number(icon.className.match(/\br([1-4])\b/)?.[1]);
			if (!r) continue;
			const text = details ? icon.closest('tr')?.querySelector('.val')?.textContent : icon.nextSibling?.textContent;
			const pct = Number((text || '').replace(/[‎‏‪-‮⁦-⁩]/g, '').match(/(\d+)\s*%/)?.[1]);
			if (pct) bonus[r - 1] += pct;
		}
		return bonus;
	}

	/** [key, value] for a tooltip or tile details box, or null if unreadable. */
	function readTile(box) {
		const details = box.id === 'tileDetails';
		const pair = box.querySelector('.coordinatesWrapper');
		const x = coordOf(pair?.querySelector('.coordinateX'));
		const y = coordOf(pair?.querySelector('.coordinateY'));
		if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return null;
		const bonus = readBonus(box, details);
		const title = (box.querySelector(details ? 'h1' : '.title')?.textContent || '').trim();
		if (!bonus.some(Boolean)) return /oasis/i.test(title) ? null : [`${x}|${y}`, 0];
		const occupied = /^occupied\b/i.test(title) || (details && !!box.querySelector('#village_info'));
		return [`${x}|${y}`, { b: bonus, o: occupied }];
	}

	function saveTiles() {
		const batch = tileBuffer;
		tileBuffer = {};
		const key = TILES_PREFIX + location.host;
		chrome.storage.local.get(key, (res) => {
			const all = res[key] || {};
			const changed = Object.entries(batch).filter(([k, v]) => JSON.stringify(all[k]) !== JSON.stringify(v));
			if (changed.length) chrome.storage.local.set({ [key]: { ...all, ...Object.fromEntries(changed) } });
		});
	}

	function inspectTile(box) {
		const tile = readTile(box);
		if (!tile) return;
		tileBuffer[tile[0]] = tile[1];
		clearTimeout(tileTimer);
		tileTimer = setTimeout(saveTiles, TILE_SAVE_MS);
	}

	function startMap() {
		document.querySelectorAll(TILE_SELECTOR).forEach(inspectTile);
		observer = new MutationObserver((records) => {
			for (const record of records) {
				const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
				const box = target?.closest(TILE_SELECTOR);
				if (box) inspectTile(box);
				for (const node of record.addedNodes) {
					if (node.nodeType !== 1) continue;
					if (node.matches(TILE_SELECTOR)) inspectTile(node);
					node.querySelectorAll(TILE_SELECTOR).forEach(inspectTile);
				}
			}
		});
		observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-state'] });
	}

	// The settings popup asks the active tab which village it shows.
	let messageListener = null;

	window.TravianQoL.register({
		id: 'build-order',
		label: 'Build order',
		description: 'Highlights the resource field with the best payback and numbers the next upgrades. Steps, oases and boost buildings are in the Build order tab.',
		init() {
			messageListener = (request, sender, sendResponse) => {
				if (request?.type !== 'TQOL_ACTIVE_VILLAGE') return false;
				sendResponse({ did: activeVillage()?.dataset?.did || null });
				return false;
			};
			chrome.runtime?.onMessage?.addListener(messageListener);
			const run = isResourcesPage() ? start : isVillagePage() ? startVillage : isMapPage() ? startMap : null;
			if (!run) return;
			if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
			else run();
		},
		destroy() {
			if (messageListener) chrome.runtime?.onMessage?.removeListener(messageListener);
			messageListener = null;
			observer?.disconnect();
			observer = null;
			if (storageListener) chrome.storage.onChanged?.removeListener(storageListener);
			storageListener = null;
			clearTimeout(debounceTimer);
			debounceTimer = null;
			if (tileTimer) saveTiles();
			clearTimeout(tileTimer);
			tileTimer = null;
			lastSnapshot = '';
			guideReady = false;
			document.getElementById(STYLE_ID)?.remove();
			document.querySelectorAll('[data-tqol-bo]').forEach((el) => delete el.dataset[ORDER_ATTR]);
		},
	});
})();
