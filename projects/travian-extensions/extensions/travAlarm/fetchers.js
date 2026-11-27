/**
 * TRAVIAN WATCHMAN PRO - REMOTE FETCHERS
 */

// ==========================================
// ACTIVE VILLAGE
// Travian keeps one active village per session on the server, and any request
// carrying `newdid=VID` switches it. A background fetch for another village
// moves the user: their next click or refresh lands on that village, and no
// restore request can close that race. INVARIANT: fetchers in this file only
// read the village the user is already on and never send `newdid=`.
// ==========================================

// Active village id from a sidebar. `root` may be a parsed DOM (a fetched page).
function _readDidFromSidebar(root = document) {
	const activeEntry = root.querySelector(
		".villageList .listEntry.active[data-did], #sidebarBoxVillageList .listEntry.active[data-did]",
	);
	const entryDid = activeEntry?.getAttribute("data-did");
	if (entryDid && /^\d+$/.test(entryDid)) return entryDid;
	const el = root.querySelector(
		".villageList .listEntry.active a[href*='newdid=']",
	);
	return el?.getAttribute("href")?.match(/newdid=(\d+)/)?.[1] || null;
}


// Last fetch time per `${host}|${key}`, kept in extension storage so a page
// reload or a second tab does not start a fetcher's cooldown over.
const FETCH_COOLDOWNS_KEY = "_w4fcd";
let _fetchCooldowns = {};
const _cooldownId = (key) => `${window.location.hostname}|${key}`;
try {
	api.storage.local.get(FETCH_COOLDOWNS_KEY).then((r) => {
		const stored = r?.[FETCH_COOLDOWNS_KEY] || {};
		const merged = { ..._fetchCooldowns };
		for (const [k, t] of Object.entries(stored)) {
			if (Number.isFinite(t) && !(merged[k] > t)) merged[k] = t;
		}
		_fetchCooldowns = merged;
	}).catch(() => {});
	api.storage.onChanged.addListener((changes, area) => {
		if (area === "local" && changes[FETCH_COOLDOWNS_KEY]) {
			_fetchCooldowns = { ...(changes[FETCH_COOLDOWNS_KEY].newValue || {}) };
		}
	});
} catch {
	/* storage unavailable: cooldowns are per page */
}

function _saveFetchCooldowns() {
	try {
		api.storage.local.set({ [FETCH_COOLDOWNS_KEY]: _fetchCooldowns }).catch(() => {});
	} catch {
		/* storage unavailable */
	}
}

/**
 * Returns true if the named fetcher is allowed to run (not already running and past cooldown).
 * Sets isFetching=true and records the time when it returns true.
 * @param {string} key - key in fetchState; unknown keys are added
 * @param {number} cooldownMs
 */
function canFetch(key, cooldownMs) {
	if (!isPlayerActive()) return false;
	const f = (fetchState[key] ??= { isFetching: false, lastTime: 0 });
	const now = Date.now();
	const last = Math.max(f.lastTime, _fetchCooldowns[_cooldownId(key)] || 0);
	if (f.isFetching || now - last < cooldownMs) return false;
	f.isFetching = true;
	f.lastTime = now;
	_fetchCooldowns = { ..._fetchCooldowns, [_cooldownId(key)]: now };
	_saveFetchCooldowns();
	return true;
}

function resetFetchCooldown(key) {
	if (fetchState[key]) fetchState[key].lastTime = 0;
	const { [_cooldownId(key)]: _dropped, ...rest } = _fetchCooldowns;
	_fetchCooldowns = rest;
	_saveFetchCooldowns();
}

/**
 * Reads a fill-time delay (ms) from a table cell.
 * Checks for a .timer span with a `value` attribute first, then parses text.
 * Returns 0 if no valid time found.
 * @param {Element} cell
 * @returns {number}
 */
function parseCellDelay(cell) {
	if (!cell) return 0;
	const timerSpan = cell.querySelector(".timer");
	if (timerSpan) {
		const val = (timerSpan.getAttribute("value") | 0) * 1000;
		if (val > 0) return val;
		// value=0 means server didn't populate it — fall through to text parse
		const timerTxt = timerSpan.textContent.trim();
		if (/\d+:\d+:\d+/.test(timerTxt)) return parseSmartDuration(timerTxt);
	}
	const txt = cell.textContent.trim();
	if (/\d+:\d+:\d+/.test(txt)) return parseSmartDuration(txt);
	return 0;
}

// ==========================================
// BACKGROUND PRODUCTION FETCHER
// ==========================================
async function fetchProductionData() {
	if (!canFetch("prod", 10000)) return;

	try {
		const res = await fetch("/village/statistics/resources/production");
		if (!res.ok) return;
		const text = await res.text();
		const parser = new DOMParser();
		const doc = parser.parseFromString(text, "text/html");

		const rows = doc.querySelectorAll("tbody tr");
		rows.forEach((row) => {
			if (row.classList.contains("sum") || row.querySelector(".empty")) return;
			const vilNode = row.querySelector(".vil a");
			if (!vilNode) return;

			const vName = cleanText(vilNode.innerText);

			const getVal = (selector) => {
				const el = row.querySelector(selector);
				if (!el) return 0;
				return parseInt(el.innerText.replace(/[^\d-]/g, ""), 10) || 0;
			};

			const pW = getVal(".lum");
			const pC = getVal(".clay");
			const pI = getVal(".iron");
			const pCr = getVal(".crop");
			const total = pW + pC + pI + pCr;

			const prodMap = { w: pW, c: pC, i: pI, cr: pCr };
			writeProdCache(`${serverTag}_${vName}`, total, prodMap);
		});

		scan(); // Re-trigger scan to update NPC text
	} catch {
		// Fetch errors are non-critical, silently ignore
	} finally {
		fetchState.prod.isFetching = false;
	}
}

// ==========================================
// TRAINING QUEUE FETCHER
// ==========================================
async function fetchTrainingData() {
	if (!canFetch("training", 30000)) return;

	const GID_NAMES = {
		19: "Barracks",
		20: "Stable",
		21: "Workshop",
		22: "Academy",
		29: "Great Barracks",
		30: "Great Stable",
		36: "Trapper",
		45: "Hospital",
		46: "Hospital",
	};

	try {
		const res = await fetch(
			window.location.origin + "/village/statistics/troops/training",
		);
		if (!res.ok) return;
		const text = await res.text();
		const doc = new DOMParser().parseFromString(text, "text/html");

		const table = doc.querySelector("table.under_progress");
		if (!table) return;

		// Parse header columns to get building GIDs
		const headerCells = table.querySelectorAll("thead th");
		const columns = [];
		headerCells.forEach((th, i) => {
			const icon = th.querySelector('i[class*="type"]');
			if (icon) {
				const match = icon.className.match(/type(\d+)/);
				if (match) columns.push({ colIdx: i, gid: match[1] });
			}
		});

		// Parse each village row
		const queueMap = {};
		table.querySelectorAll("tbody tr").forEach((row) => {
			const vilNode = row.querySelector(".villageName a");
			if (!vilNode) return;
			const vName = cleanText(vilNode.textContent);
			if (!vName) return;

			const cells = row.querySelectorAll("td");
			columns.forEach(({ colIdx, gid }) => {
				const cell = cells[colIdx];
				if (!cell) return;
				const durationSpan = cell.querySelector(".duration");
				if (!durationSpan) return;
				const seconds =
					(parseSmartDuration(durationSpan.textContent.trim()) ?? 0) / 1000;
				if (seconds <= 0) return;

				const buildingName = GID_NAMES[gid] || `Building ${gid}`;
				const key = `${buildingName}__${vName}`;
				if (!queueMap[key] || seconds > queueMap[key].seconds) {
					queueMap[key] = { buildingName, vName, seconds };
				}
			});
		});

		const newAlarms = [];
		const activeNames = [];

		Object.values(queueMap).forEach(({ buildingName, vName, seconds }) => {
			const alarmName = `🎓 ${buildingName} (${vName}) ${serverTag}`;
			activeNames.push(alarmName);
			newAlarms.push({
				name: alarmName,
				delay: seconds * 1000,
				customType: "training",
			});
		});

		if (newAlarms.length > 0) {
			await api.runtime.sendMessage({
				type: "REFRESH_ALARMS",
				buildings: newAlarms,
			});

			// Only clean up stale training alarms when we have a valid non-empty
			// snapshot — sending an empty activeNames would wipe all training alarms.
			api.runtime.sendMessage({
				type: "CLEAR_STALE_TRAINING",
				activeNames,
				serverTag,
			});
		}
	} catch {
		// Fetch errors are non-critical, silently ignore
	} finally {
		fetchState.training.isFetching = false;
	}
}

// ==========================================
// WAREHOUSE / GRANARY FETCHER (Storage Alarms)
// ==========================================
const STORAGE_THRESHOLD = 3600000; // 1h in ms

/**
 * Reads the "granary empty in" delay in ms from a page's stockBar crop
 * tooltip. Returns 0 if the page has no stockBar or no such timer.
 * @param {Document} doc
 * @returns {number}
 */
function readGranaryEmptyDelay(doc) {
	const sb = doc.getElementById("stockBar");
	if (!sb) return 0;
	const cropTip = Array.from(sb.querySelectorAll("[title]"))
		.map((el) => el.getAttribute("title"))
		.find((t) => t && t.includes("Empty in"));
	if (!cropTip) return 0;
	const inner = new DOMParser().parseFromString(cropTip, "text/html");
	const timer = inner.querySelector("span.timer, span[id^='timer']");
	const secs = parseInt(timer?.getAttribute("value"), 10) || 0;
	return secs > 0 ? secs * 1000 : 0;
}

async function fetchWarehouseData() {
	if (!canFetch("warehouse", 60000)) return;

	try {
		const res = await fetch(
			window.location.origin + "/village/statistics/resources/warehouse",
		);
		// An error page must not reach the stale-alarm cleanup below.
		if (!res.ok) return;
		const text = await res.text();
		const doc = new DOMParser().parseFromString(text, "text/html");

		const warehouseTable = doc.getElementById("warehouse");
		const newAlarms = [];
		const activeNames = [];

		if (warehouseTable) {
			const rows = warehouseTable.querySelectorAll("tbody tr");
			const starvingRows = [];
			rows.forEach((row) => {
				const cells = row.querySelectorAll("td");
				if (cells.length < 7) return;

				let vName = "Village";
				let vDid = null;
				const vilCell = row.querySelector(".vil") || cells[0];
				if (vilCell) {
					const aNode = vilCell.querySelector("a");
					vName = cleanText(aNode ? aNode.textContent : vilCell.textContent);
					const href = aNode?.getAttribute("href") || "";
					const m = href.match(/newdid=(\d+)/);
					if (m) vDid = m[1];
				}

				// Warehouse timer (column 5, index 4)
				const whCell = cells[4];
				if (whCell) {
					const whTxt = whCell.textContent.trim();
					const whAlreadyFull = whTxt === "-" || whTxt === "–";
					const delay = whAlreadyFull ? 0 : parseCellDelay(whCell);
					if ((whAlreadyFull || delay > 0) && delay < STORAGE_THRESHOLD) {
						const alarmName = `📦 Warehouse Full | ${vName} ${serverTag}`;
						activeNames.push(alarmName);
						newAlarms.push({ name: alarmName, delay, customType: "storage" });
					}
				}

				// Granary timer (column 7, index 6)
				// A cell text starting with "−" (U+2212) means crop production is
				// negative — the timer counts down to EMPTY, not FULL, and the
				// warehouse-stats value is unreliable. For those cases fetch dorf1
				// and read the stockBar crop tooltip's "Empty in" timer directly.
				const grCell = cells[6];
				if (grCell) {
					const grTxt = grCell.textContent.trim();
					const grAlreadyFull = grTxt === "-" || grTxt === "–";
					const grStarving =
						!grAlreadyFull && (grTxt.startsWith("−") || grTxt.startsWith("-"));
					if (grStarving) {
						starvingRows.push({ vName, vDid });
					} else {
						const delay = grAlreadyFull ? 0 : parseCellDelay(grCell);
						// A plain dash means the granary isn't filling — which happens
						// both when it's genuinely full (crop produced but capped) AND
						// when net crop production is 0 (stable below cap). Only the
						// former should fire a done "Granary Full" alarm; gate on the
						// cached net crop production so a 0-production village doesn't
						// spawn a bogus already-done alarm.
						const pm = readProdMap(`${serverTag}_${vName}`);
						const grCropProd = pm?.cr ?? null;
						const grFull = grAlreadyFull && grCropProd > 0;
						if ((grFull || delay > 0) && delay < STORAGE_THRESHOLD) {
							const alarmName = `📦 Granary Full | ${vName} ${serverTag}`;
							activeNames.push(alarmName);
							newAlarms.push({
								name: alarmName,
								delay,
								customType: "storage",
							});
						}
					}
				}
			});

			// Only the active village is measured, from this page's own stockBar.
			// Measuring another village would need `newdid=`, which moves the
			// user. Other starving villages keep their alarm until visited.
			const activeDid = _readDidFromSidebar();
			const activeName =
				typeof getActiveVillageName === "function" ? getActiveVillageName() : null;
			for (const { vName, vDid } of starvingRows) {
				const alarmName = `🌾 Granary Empty | ${vName} ${serverTag}`;
				const isActive = (vDid && vDid === activeDid) || vName === activeName;
				const delay = isActive ? readGranaryEmptyDelay(document) : 0;
				if (delay <= 0) {
					activeNames.push(alarmName);
				} else if (delay < STORAGE_THRESHOLD) {
					activeNames.push(alarmName);
					newAlarms.push({ name: alarmName, delay, customType: "storage" });
				}
			}
		} else {
			// Fallback: older layout
			const table =
				doc.getElementById("overview") ||
				doc.getElementById("resources") ||
				doc.querySelector("#content table");
			if (!table) {
				fetchState.warehouse.isFetching = false;
				return;
			}

			const rows = table.querySelectorAll("tbody tr");
			rows.forEach((row) => {
				const cells = row.querySelectorAll("td");
				const vilCell = row.querySelector(".vil") || cells[0];
				if (!vilCell) return;
				const aNode = vilCell.querySelector("a");
				const vName = cleanText(
					aNode ? aNode.textContent : vilCell.textContent,
				);

				cells.forEach((cell, idx) => {
					if (idx === 0) return;
					const txt = cell.textContent.trim();
					const alreadyFull = txt === "-" || txt === "–";
					const delay = alreadyFull ? 0 : parseCellDelay(cell);
					if ((!alreadyFull && delay <= 0) || delay >= STORAGE_THRESHOLD)
						return;
					const alarmName = `📦 Warehouse Full | ${vName} ${serverTag}`;
					if (!activeNames.includes(alarmName)) {
						activeNames.push(alarmName);
						newAlarms.push({ name: alarmName, delay, customType: "storage" });
					}
				});
			});
		}

		if (newAlarms.length > 0) {
			await api.runtime.sendMessage({
				type: "REFRESH_ALARMS",
				buildings: newAlarms,
			});
		}

		// Always send cleanup after a successful fetch — empty activeNames is
		// authoritative: it means no storage is near-full, so all storage alarms
		// for this server should be cleared (including fired/silenced ones).
		api.runtime.sendMessage({
			type: "CLEAR_STALE_STORAGE",
			activeNames,
			serverTag,
		});
	} catch {
		// Fetch errors are non-critical, silently ignore
	} finally {
		fetchState.warehouse.isFetching = false;
	}
}

// ==========================================
// CELEBRATIONS FETCHER
// ==========================================
async function fetchCelebrationsData() {
	if (!canFetch("celebrations", 60000)) return;

	try {
		const res = await fetch(
			window.location.origin + "/village/statistics/culturepoints",
		);
		if (!res.ok) return;
		const text = await res.text();
		const doc = new DOMParser().parseFromString(text, "text/html");

		const table = doc.getElementById("culture_points");
		if (!table) return;

		const newAlarms = [];
		const activeNames = [];

		table.querySelectorAll("tbody tr").forEach((row) => {
			const vilNode = row.querySelector(".vil");
			const celNode = row.querySelector(".cel");
			if (!vilNode || !celNode) return;

			const aNode = vilNode.querySelector("a");
			const vName = cleanText(aNode ? aNode.textContent : vilNode.textContent);
			const delay = parseCellDelay(celNode);

			if (delay > 0) {
				const alarmName = `🎉 Celebrations Ends In | ${vName} ${serverTag}`;
				activeNames.push(alarmName);
				newAlarms.push({ name: alarmName, delay, customType: "culture" });
			}
		});

		if (newAlarms.length > 0) {
			await api.runtime.sendMessage({
				type: "REFRESH_ALARMS",
				buildings: newAlarms,
			});
		}

		// Always clean up stale/duplicate celebration alarms after a
		// successful fetch — even when no active celebrations remain.
		// keepExpired in the handler preserves fired alarms for user dismissal.
		api.runtime.sendMessage({
			type: "CLEAR_STALE_CELEBRATIONS",
			activeNames,
			serverTag,
		});
	} catch {
		// Fetch errors are non-critical, silently ignore
	} finally {
		fetchState.celebrations.isFetching = false;
	}
}

// ==========================================
// DUAL-ALARM ATTACK SYSTEM (REMOTE FETCH)
// ==========================================

function scanForSidebarAttacksAndFetch() {
	const listEntries = document.querySelectorAll(".villageList .listEntry");
	// No village-list sidebar rendered on this page (reports, statistics,
	// fullscreen map, or a mid-re-render frame) → we have zero visibility into
	// incoming attacks. Absence of `.attack` markers here is NOT evidence the
	// attack ended; leave the background lifecycle unchanged.
	if (listEntries.length === 0) return;

	// Only the active village's rally point is read: reading another village's
	// needs `newdid=`, which moves the user (see ACTIVE VILLAGE above). Attacks
	// on other villages are picked up when the user visits them.
	// The incoming marker is an inner icon: `<span class="incomingTroops"><svg
	// class="attack">`. A hero icon or an unrelated tooltip cannot negate it.
	const active = Array.from(listEntries).find((entry) =>
		entry.classList.contains("active"),
	);
	if (!active || !active.querySelector(".incomingTroops svg.attack")) return;
	const vid = active.getAttribute("data-did") || null;

	const now = Date.now();
	if (isFetchingRally || !isPlayerActive() || now - lastRallyFetchTime <= 60000)
		return;
	lastRallyFetchTime = now;

	fetchAndParseRallyPoint(vid)
		.then((alarms) => {
			if (alarms && alarms.length > 0)
				api.runtime.sendMessage({ type: "REFRESH_ALARMS", buildings: alarms });
		})
		.catch(() => {});

	// Absence in a cached sidebar is not an authoritative cancellation.
	// The background expires known attacks at their recorded impact time.
}

// Fetch attack observations for detection and imminent-warning phases.
// Reads the ACTIVE village's rally point; `vid` only labels the alarms.
async function fetchAndParseRallyPoint(vid) {
	isFetchingRally = true;

	const url =
		window.location.origin + "/build.php?gid=16&tt=1&filter=1&subfilters=1";

	try {
		const response = await fetch(url);
		if (!response.ok) return [];
		const text = await response.text();
		const observedAt = Date.now();
		const parser = new DOMParser();
		const doc = parser.parseFromString(text, "text/html");

		const foundAlarms = [];
		const infoBodies = doc.querySelectorAll("tbody.infos");

		// 1) Collect all attacks
		const attacks = [];
		infoBodies.forEach((infoBody) => {
			const timer = infoBody.querySelector(".timer");
			if (!timer) return;
			const seconds = parseInt(timer.getAttribute("value"), 10);
			if (isNaN(seconds) || seconds <= 0) return;

			let headlineText = "Unknown Attack";
			let sibling = infoBody.previousElementSibling;
			while (sibling) {
				if (sibling.tagName === "THEAD") {
					const headline = sibling.querySelector(".troopHeadline");
					if (headline) headlineText = cleanText(headline.textContent || "");
					break;
				}
				sibling = sibling.previousElementSibling;
			}
			attacks.push({ headlineText, seconds });
		});

		// A "wave" is defined by IMPACT proximity, not detection proximity:
		// attacks of the same headline whose impacts land within WAVE_WINDOW_S
		// of each other are real cata-wave patterns and collapse into one
		// alarm. Anything spaced further apart in impact time stays as
		// distinct alarms (even if they were detected in the same fetch).
		attacks.sort((a, b) => a.seconds - b.seconds);
		const WAVE_WINDOW_S = 5;
		const clusters = [];
		attacks.forEach((atk) => {
			const last = clusters.findLast(cluster => cluster.headlineText === atk.headlineText);
			if (
				last &&
				last.headlineText === atk.headlineText &&
				atk.seconds - last.firstSeconds <= WAVE_WINDOW_S
			) {
				last.count++;
				last.lastSeconds = atk.seconds;
			} else {
				clusters.push({
					headlineText: atk.headlineText,
					firstSeconds: atk.seconds,
					lastSeconds: atk.seconds,
					count: 1,
				});
			}
		});

		// Always report observations. The background owns durable deduplication;
		// a tab's cached alarm list must not control notification state.
		const pad = n => String(n).padStart(2, "0");
		const villageId = String(vid || _readDidFromSidebar(doc) || "CURRENT");
		clusters.forEach(({ headlineText, firstSeconds, lastSeconds, count }) => {
			const impactAt = observedAt + firstSeconds * 1000;
			const impactDate = new Date(impactAt);
			const impactStr = `${pad(impactDate.getHours())}:${pad(impactDate.getMinutes())}:${pad(impactDate.getSeconds())}`;
			const waveLabel = count > 1 ? ` (wave ×${count})` : "";
			const attackScope = JSON.stringify([window.location.hostname, villageId, headlineText]);
			const shared = { customType: "attack", attackScope, impactAt, waveEndAt: observedAt + lastSeconds * 1000, waveCount: count };
			if (firstSeconds > 20) {
				foundAlarms.push({ ...shared,
					name: `⚠️ Attack Imminent: ${headlineText}${waveLabel} @ ${impactStr} ${serverTag}`,
					attackPhase: "imminent", dueAt: impactAt - 20000,
					delay: firstSeconds * 1000 - 20000,
				});
			}
			const village = (headlineText.match(/(?:attacks|raids)\s+(.+)/i) || [])[1] || headlineText;
			foundAlarms.push({ ...shared,
				name: `🚨 Attack on ${village}${waveLabel} @ ${impactStr} ${serverTag}`,
				attackPhase: "detected", dueAt: observedAt, delay: 0,
			});
		});

		return foundAlarms;
	} catch (e) {
		// silenced
		return [];
	} finally {
		isFetchingRally = false;
	}
}

// ==========================================
// HERO FETCHER
// ==========================================

// Hero status codes from Travian GQL schema
const HERO_STATUS = {
	IDLE: 1,
	REVIVING: 2,
	TRAVEL_ADVENTURE: 50,
	TRAVEL_OASIS: 4,
	TRAVEL_REINFORCE: 5,
	TRAVEL_RAID: 6,
	TRAVEL_ATTACK: 3,
	RETURN_ADVENTURE: 8,
	RETURN_OTHER: 9,
};

/**
 * Fetches /hero/adventures, extracts the pre-rendered viewData JSON, and
 * upserts a hero alarm. Works from any page — no live DOM dependency.
 */
async function fetchHeroData() {
	if (!canFetch("hero", 60000)) return;

	try {
		const res = await fetch(window.location.origin + "/hero/adventures");
		if (!res.ok) return;
		const html = await res.text();

		// Extract the viewData JSON using brace-depth counting
		const viewDataIdx = html.indexOf("viewData: ");
		if (viewDataIdx === -1) return;
		const jsonStart = viewDataIdx + "viewData: ".length;

		let depth = 0,
			i = jsonStart,
			inStr = false,
			escape = false;
		for (; i < html.length && i < jsonStart + 100000; i++) {
			const c = html[i];
			if (escape) {
				escape = false;
				continue;
			}
			if (c === "\\" && inStr) {
				escape = true;
				continue;
			}
			if (c === '"') {
				inStr = !inStr;
				continue;
			}
			if (inStr) continue;
			if (c === "{") depth++;
			else if (c === "}") {
				depth--;
				if (depth === 0) break;
			}
		}

		let heroData;
		try {
			const parsed = JSON.parse(html.substring(jsonStart, i + 1));
			heroData = parsed?.data?.ownPlayer?.hero;
		} catch {
			return;
		}

		if (!heroData) return;

		const status = heroData.status;
		const homeVillage = heroData.homeVillage?.name || "";

		// No status or hero is idle/reviving — clear stale alarms
		if (
			!status ||
			status.status === HERO_STATUS.IDLE ||
			status.status === HERO_STATUS.REVIVING
		) {
			api.runtime.sendMessage({
				type: "CLEAR_STALE_HERO",
				activeNames: [],
				serverTag,
			});
			return;
		}

		const arrivalIn = status.arrivalIn; // seconds
		if (!arrivalIn || arrivalIn <= 0) return;
		const delayMs = arrivalIn * 1000 + 2000;

		const isReturning =
			status.status === HERO_STATUS.RETURN_ADVENTURE ||
			status.status === HERO_STATUS.RETURN_OTHER;

		// Hero always returns home — use homeVillage for all alarms
		const villagePart = homeVillage ? ` | ${homeVillage}` : "";

		// Target village name (only set when hero is travelling to a village,
		// e.g. attacks/raids). status.onWayTo.village.name is the destination.
		const targetVillage = status.onWayTo?.village?.name || "";

		let actionLabel;
		switch (status.status) {
			case HERO_STATUS.TRAVEL_ADVENTURE:
				actionLabel = "Going to Adventure";
				break;
			case HERO_STATUS.RETURN_ADVENTURE:
				actionLabel = "Returning";
				break;
			case HERO_STATUS.TRAVEL_OASIS:
				actionLabel = "Going to Oasis";
				break;
			case HERO_STATUS.TRAVEL_REINFORCE:
				actionLabel = "Reinforcing";
				break;
			case HERO_STATUS.TRAVEL_RAID:
			case HERO_STATUS.TRAVEL_ATTACK:
				actionLabel = targetVillage
					? `Attacking ${targetVillage}`
					: "Attacking";
				break;
			default:
				actionLabel = "Returning";
		}

		const alarmName = `⚔️ ${actionLabel}${villagePart} ${serverTag}`;

		await api.runtime.sendMessage({
			type: "REFRESH_ALARMS",
			buildings: [
				{
					name: alarmName,
					delay: delayMs,
					customType: "hero",
					noSound: !isReturning,
				},
			],
		});

		api.runtime.sendMessage({
			type: "CLEAR_STALE_HERO",
			activeNames: [alarmName],
			serverTag,
		});
	} catch {
		// Fetch errors are non-critical
	} finally {
		fetchState.hero.isFetching = false;
	}
}
