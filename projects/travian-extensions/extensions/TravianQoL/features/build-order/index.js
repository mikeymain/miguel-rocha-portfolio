// Build order.
// On the resources view (dorf1), marks the resource field with the best
// payback as the next upgrade: only that one field glows. While the account
// has one village, the starting guide (guide-4p.js) drives the glow instead:
// the field or village on the resources view, the building in the village centre. The step list and
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
	const LAYOUT_KEY = 'travianQoL.buildGuideLayout';
	const SLOT_SELECTOR = '#villageContent .buildingSlot:not(.top)';
	const SLOT_HINT_ID = 'tqol-bo-slot-hint';
	const STYLE_ID = 'tqol-bo-style';
	const ORDER_ATTR = 'tqolBo';
	const CSS = `
#resourceFieldContainer a.village[data-tqol-bo="1"] {
	border-radius: 50%;
}
#resourceFieldContainer a.resourceField[data-tqol-bo="1"] .labelLayer,
#resourceFieldContainer a.village[data-tqol-bo="1"] {
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
#villageContent .buildingSlot[data-gid="0"][data-tqol-bo="1"] .buildingShape,
#villageContent .buildingSlot[data-gid="0"][data-tqol-bo="1"] .buildingShape path {
	visibility: visible;
	opacity: 1;
}
#villageContent .buildingSlot[data-gid="0"][data-tqol-bo="1"] .buildingShape path {
	fill: rgba(255, 215, 94, .35);
	stroke: #ffd75e;
	stroke-width: 3;
}
#content .buildingWrapper[data-tqol-bo="1"],
#content .titleInHeader[data-tqol-bo="1"] {
	outline: 2px solid #ffd75e;
	outline-offset: 2px;
}
#tqol-bo-slot-hint { margin-block: 10px; color: #ffd75e; font-weight: bold; }
@keyframes tqol-bo-pulse {
	from { filter: drop-shadow(0 0 3px #ffd75e) drop-shadow(0 0 5px rgba(255, 200, 40, .6)); }
	to   { filter: drop-shadow(0 0 5px #ffd75e) drop-shadow(0 0 12px rgba(255, 200, 40, 1)); }
}
@media (prefers-reduced-motion: reduce) {
	#resourceFieldContainer a.resourceField[data-tqol-bo="1"] .labelLayer,
	#resourceFieldContainer a.village[data-tqol-bo="1"],
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
	let storedLayout = {};
	let referenceLayout = {};
	let guideReady = false;

	const isResourcesPage = () => /^\/(dorf1\.php|resources)$/.test(location.pathname);
	const isVillagePage = () => /^\/(dorf2\.php|village)$/.test(location.pathname);
	const isSlotPage = () => /^\/(build\.php|building|slot)$/.test(location.pathname);
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
	function readSlots(buildings) {
		const out = {};
		for (const { gid, level } of buildings) {
			if (GUIDE_GIDS.has(gid)) (out[gid] ||= []).push(level);
		}
		return out;
	}

	function scanVillage() {
		const buildings = readBuildingEls();
		const slots = readSlots(buildings);
		if (buildings.length) {
			const layout = Object.fromEntries(buildings.filter((b) => b.slot).map(({ slot, gid, level, building }) => [slot, { gid, level, building }]));
			saveSnapshot({ buildings: readBuildings(), slots, layout });
		}
		renderVillage(buildings, slots);
	}

	/** Village slots with their effective level, including any upgrade in progress. */
	function readBuildingEls() {
		const out = [];
		for (const el of document.querySelectorAll(SLOT_SELECTOR)) {
			const gid = Number(el.dataset.gid ?? el.className.match(/\bg(\d+)\b/)?.[1]);
			const slot = Number(el.dataset.aid ?? el.className.match(/\ba(\d+)\b/)?.[1]) || 0;
			const a = el.querySelector('a[data-level]');
			const building = !!el.querySelector('.underConstruction') || el.classList.contains('underConstruction');
			const level = gid === 0 ? 0 : Number(a?.dataset.level) + Number(building);
			if (Number.isInteger(gid) && Number.isFinite(level)) out.push({ gid, slot, level, building, el });
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

	function pickBuildingSlot(item, buildings) {
		const gids = [].concat(item.g);
		const matching = buildings.filter((b) => gids.includes(b.gid));
		const existing = window.TravianQoLGuide4P.pickBuilding(item, matching.filter((b) => !b.building));
		if (existing || matching.length >= item.n) return existing;
		const empty = buildings.filter((b) => b.gid === 0 && !b.building);
		const fixed = gids.length > 1 ? 40 : { 15: 26, 16: 39 }[item.g];
		if (fixed) return empty.find((b) => b.slot === fixed);
		const ordinary = empty.filter((b) => b.slot >= 19 && b.slot <= 38 && b.slot !== 26);
		return ordinary.find((b) => gids.includes(referenceLayout[b.slot]))
			|| ordinary.find((b) => !referenceLayout[b.slot])
			|| ordinary[0];
	}

	function markTargets(...targets) {
		for (const marked of document.querySelectorAll('[data-tqol-bo]')) {
			if (!targets.includes(marked)) delete marked.dataset[ORDER_ATTR];
		}
		for (const el of targets) {
			if (!el) continue;
			injectStyle();
			if (el.dataset[ORDER_ATTR] !== '1') el.dataset[ORDER_ATTR] = '1';
		}
	}

	function renderVillage(buildings, slots) {
		const target = guideOn() && storedFields ? guideTarget(storedFields, slots) : null;
		const next = target?.item.k === 'b' && pickBuildingSlot(target.item, buildings);
		const wallTop = next?.slot === 40 && document.querySelector('#villageContent .buildingSlot.a40.top');
		markTargets(next?.el, wallTop);
	}

	function renderSlot() {
		const oldHint = document.getElementById(SLOT_HINT_ID);
		const slot = Number(new URLSearchParams(location.search).get('id'));
		const target = guideOn() && storedFields && storedSlots ? guideTarget(storedFields, storedSlots) : null;
		const buildings = Object.entries(storedLayout).map(([slot, b]) => ({ ...b, slot: Number(slot) }));
		const next = target?.item.k === 'b' && pickBuildingSlot(target.item, buildings);
		if (!next || next.slot !== slot) {
			oldHint?.remove();
			markTargets();
			return;
		}
		const card = [].concat(target.item.g).map((gid) => document.getElementById('contract_building' + gid)).find(Boolean);
		const firstCard = document.querySelector('#content .buildingWrapper');
		markTargets(card || (!firstCard && document.querySelector('#content .titleInHeader')));
		if (!firstCard) {
			oldHint?.remove();
			return;
		}
		const hint = oldHint || document.createElement('p');
		const label = 'Starting guide · ' + target.step.label;
		hint.id = SLOT_HINT_ID;
		if (hint.textContent !== label) hint.textContent = label;
		if (hint.nextElementSibling !== firstCard) firstCard.before(hint);
		injectStyle();
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
		let village = null;
		if (guideOn()) {
			// Show the guide's next field even while the previous step is building.
			const target = guideTarget(fields, storedSlots);
			const free = fields.filter((f) => !building.has(f.slot));
			next = target?.item.k === 'f' ? window.TravianQoLGuide4P.pickField(target.step, target.item, free) : null;
			if (target?.item.k === 'b') village = document.querySelector('#resourceFieldContainer a.village.buildingView');
		} else {
			const steps = window.TravianQoLBuildOrder.plan(fields, bonuses, PLAN_DEPTH, undefined, forceMax);
			next = hasFreeSlot ? steps.find((s) => s.kind === 'field' && !building.has(s.slot)) : null;
		}
		markTargets(village || fields.find((f) => f.slot === next?.slot)?.el);
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
		chrome.storage.local.get([guideKey, snapKey, LAYOUT_KEY], (res) => {
			guideManual = new Set(res?.[guideKey]?.[villageId()] || []);
			const snap = res?.[snapKey]?.[villageId()];
			storedFields = snap?.fields || null;
			storedSlots = snap?.slots || null;
			storedLayout = snap?.layout || {};
			referenceLayout = res?.[LAYOUT_KEY] || {};
			guideReady = true;
			done();
		});
	}

	// Guide ticks edited in the settings tab, or the other view saved its part.
	function watchGuideState(onChange) {
		const guideKey = GUIDE_PREFIX + location.host;
		const snapKey = fieldsKey();
		return (changes, area) => {
			if (area !== 'local' || !(changes[guideKey] || changes[snapKey] || changes[LAYOUT_KEY])) return;
			if (changes[guideKey]) guideManual = new Set(changes[guideKey].newValue?.[villageId()] || []);
			if (changes[LAYOUT_KEY]) referenceLayout = changes[LAYOUT_KEY].newValue || {};
			if (changes[snapKey]) {
				const snap = changes[snapKey].newValue?.[villageId()];
				storedFields = snap?.fields || null;
				storedSlots = snap?.slots || null;
				storedLayout = snap?.layout || {};
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
		const update = () => {
			if (isVillagePage()) {
				document.getElementById(SLOT_HINT_ID)?.remove();
				scanVillage();
			} else if (isSlotPage()) renderSlot();
		};
		loadGuideState(update);
		storageListener = watchGuideState(update);
		chrome.storage.onChanged?.addListener(storageListener);
		const container = document.getElementById('content') || document.body;
		observer = new MutationObserver(() => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(update, DEBOUNCE_MS);
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

	// --- Map: whole map/position responses from OasisCalc ------------------
	// OasisCalc (same author) wraps Travian.api in the page and re-sends each
	// map/position response as this document event, detail = JSON string.
	// Listening from the isolated world adds no page-visible code; without
	// OasisCalc only the tooltip reader above records tiles.
	const MAP_FEED_EVENT = 'oasiscalc:map-data:v1';
	const MAP_SIZE = 401;
	const BIDI = /[‎‏‪-‮⁦-⁩]/g;
	let mapFeedListener = null;
	const wrapCoord = (n) => (((n + 200) % MAP_SIZE) + MAP_SIZE) % MAP_SIZE - 200;

	/** Tile objects ({ position, text | t | title }) anywhere in a response. */
	function feedTiles(obj) {
		const out = [];
		const seen = new Set();
		(function visit(value, depth) {
			if (!value || typeof value !== 'object' || depth > 12 || seen.has(value)) return;
			seen.add(value);
			if (Array.isArray(value)) { value.forEach((v) => visit(v, depth + 1)); return; }
			if (value.position && ('text' in value || 't' in value || 'title' in value)) { out.push(value); return; }
			if (value.position && value.tile && typeof value.tile === 'object') { visit({ ...value.tile, position: value.position }, depth + 1); return; }
			for (const k of ['tiles', 'elements', 'data', 'response']) visit(value[k], depth + 1);
		})(obj, 0);
		return out;
	}

	/**
	 * [key, value] for a map/position tile, or null if unreadable.
	 * Oasis bonus tokens: "{a:r1} {a.r1} 25%" (r1 lumber .. r4 crop); valleys
	 * use the same tokens without "%". {k.fo} free oasis, {k.bt} occupied.
	 */
	function feedTile(tile) {
		const x = Number(tile.position?.x);
		const y = Number(tile.position?.y);
		if (tile.position?.x == null || tile.position?.y == null || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return null;
		const text = String(typeof tile.text === 'string' ? tile.text : typeof tile.t === 'string' ? tile.t : '').replace(BIDI, '');
		const title = typeof tile.title === 'string' ? tile.title : '';
		const key = `${wrapCoord(x)}|${wrapCoord(y)}`;
		const isOasis = /\{k\.(?:fo|bt)\}/.test(title + text) || /^(?:unoccupied|occupied) oasis\b/i.test(title.trim());
		if (!isOasis) return [key, 0];
		const bonus = [0, 0, 0, 0];
		for (const m of text.matchAll(/\{a:r([1-4])\}[^%<]*?(\d+)\s*%/g)) bonus[m[1] - 1] += Number(m[2]);
		if (!bonus.some(Boolean)) return null;
		const occupied = /\{k\.bt\}/.test(title + text) || Number(tile.uid) > 0
			|| /\{k\.(?:spieler|allianz)\}/.test(text) || /^occupied oasis\b/i.test(title.trim());
		return [key, { b: bonus, o: occupied }];
	}

	function onMapFeed(e) {
		if (typeof e.detail !== 'string') return;
		let data;
		try { data = JSON.parse(e.detail); } catch { return; }
		let added = false;
		for (const tile of feedTiles(data)) {
			const entry = feedTile(tile);
			if (!entry) continue;
			tileBuffer[entry[0]] = entry[1];
			added = true;
		}
		if (!added) return;
		clearTimeout(tileTimer);
		tileTimer = setTimeout(saveTiles, TILE_SAVE_MS);
	}

	function startMap() {
		mapFeedListener = onMapFeed;
		document.addEventListener(MAP_FEED_EVENT, mapFeedListener);
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
			const run = isResourcesPage() ? start : isVillagePage() || isSlotPage() ? startVillage : isMapPage() ? startMap : null;
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
			if (mapFeedListener) document.removeEventListener(MAP_FEED_EVENT, mapFeedListener);
			mapFeedListener = null;
			if (tileTimer) saveTiles();
			clearTimeout(tileTimer);
			tileTimer = null;
			lastSnapshot = '';
			guideReady = false;
			document.getElementById(STYLE_ID)?.remove();
			document.getElementById(SLOT_HINT_ID)?.remove();
			document.querySelectorAll('[data-tqol-bo]').forEach((el) => delete el.dataset[ORDER_ATTR]);
		},
	});
})();
