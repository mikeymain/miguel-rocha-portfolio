// WorldWatch service worker: polls map.sql for each watched world.
if (typeof importScripts === "function") importScripts("lib/mapsql.js", "lib/db.js", "lib/core.js", "lib/croppers.js", "lib/map-scan.js");

const ALARM = "worldwatch-poll";
const HOST_GAP_MS = 3000;
const KEYS = { hosts: "wwHosts", status: "wwStatus", settings: "wwSettings" };

let running = Promise.resolve();
let cropperWrites = Promise.resolve();
const scan = WWMapScan.create(chrome.tabs);

async function saveTiles(host, observations, fromMap) {
	const oasisKey = `wwOasis:${host}`;
	const data = await chrome.storage.local.get(fromMap ? ["wwCroppers", oasisKey] : "wwCroppers");
	const { wwCroppers = {} } = data;
	const tiles = wwCroppers[host] || {};
	const oases = data[oasisKey] || {};
	const updates = {};
	const seenAt = Date.now();
	for (const { x, y, cropper, crop, occupied, bonuses, valley, claimed } of observations) {
		const id = `${x}|${y}`;
		if (cropper && !tiles[id]) {
			tiles[id] = { x, y, seenAt: Date.now() };
			updates.wwCroppers = wwCroppers;
		}
		const old = oases[id];
		if (!fromMap) continue;
		const knownBonuses = bonuses && Object.keys(bonuses).length ? bonuses : old?.bonuses;
		// Positive timestamps mark valleys, negative ones owned tiles. Legacy 0 means coverage only.
		const observation = typeof occupied === "boolean" ? {
			crop: knownBonuses ? knownBonuses[4] || 0 : crop || old?.crop || null,
			occupied, ...(knownBonuses && { bonuses: knownBonuses }), seenAt,
		} :
			claimed ? -seenAt : valley || cropper ? seenAt : old ?? 0;
		if (old !== observation) {
			oases[id] = observation;
			updates[oasisKey] = oases;
		}
	}
	if (updates.wwCroppers || (!wwCroppers[host] && observations.some((tile) => tile.bonuses || tile.valley))) {
		wwCroppers[host] = tiles;
		updates.wwCroppers = wwCroppers;
	}
	if (Object.keys(updates).length) await chrome.storage.local.set(updates);
}

function queueTiles(host, tiles, sendResponse, mapSender) {
	if (!host || !Array.isArray(tiles) || !tiles.length || tiles.length > 2000) return false;
	const valid = tiles.filter((tile) =>
		tile && [tile.x, tile.y].every((n) => Number.isInteger(n) && Math.abs(n) <= 200) &&
		(!mapSender || ([0, 25, 50].includes(tile.crop) && (!tile.crop || typeof tile.occupied === "boolean"))));
	if (!valid.length) return false;
	const write = cropperWrites.then(() => saveTiles(host, valid, Boolean(mapSender)));
	cropperWrites = write.catch(() => {});
	write.then(() => {
		if (mapSender) scan.observe(mapSender.tab?.id, mapSender.url, valid);
		sendResponse({ ok: true });
	}, () => sendResponse({ ok: false }));
	return true;
}

async function readState() {
	const data = await chrome.storage.local.get([KEYS.hosts, KEYS.status, KEYS.settings]);
	return {
		hosts: Array.isArray(data[KEYS.hosts]) ? data[KEYS.hosts] : [],
		status: data[KEYS.status] || {},
		settings: WWCore.normalizeSettings(data[KEYS.settings]),
	};
}

async function ensureAlarm() {
	const { settings } = await readState();
	const existing = await chrome.alarms.get(ALARM);
	if (!existing || existing.periodInMinutes !== settings.intervalMin) {
		await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: settings.intervalMin });
	}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollHosts(only, capturedBody) {
	const { hosts, settings } = await readState();
	const targets = only ? hosts.filter((h) => only.includes(h)) : hosts;
	for (let i = 0; i < targets.length; i++) {
		if (i) await sleep(HOST_GAP_MS);
		const deps = {
			fetch: (url, init) => fetch(url, init),
			store: WWDb,
			now: () => Date.now(),
			cap: settings.cap,
		};
		const result = capturedBody === undefined
			? await WWCore.pollHost(targets[i], deps)
			: await WWCore.recordSnapshot(targets[i], deps, () => capturedBody);
		const { status } = await readState();
		const prev = status[targets[i]] || {};
		const next = {
			...prev,
			lastCheckedAt: result.lastCheckedAt,
			error: result.error,
			...(result.error ? {} : { lastChangeAt: result.lastChangeAt, snapshots: result.snapshots }),
		};
		await chrome.storage.local.set({ [KEYS.status]: { ...status, [targets[i]]: next } });
	}
}

// Serialises polls so two never overlap.
function queuePoll(only, capturedBody) {
	running = running.then(() => pollHosts(only, capturedBody)).catch(() => {});
	return running;
}

chrome.runtime.onInstalled.addListener(() => {
	ensureAlarm();
});
chrome.runtime.onStartup.addListener(() => {
	ensureAlarm();
});
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === ALARM) queuePoll();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (!msg || typeof msg.type !== "string") return false;
	if (msg.type === "ww-cropper") {
		if (!sender.url || sender.frameId !== 0) return false;
		const url = URL.parse(sender.url);
		const { x, y } = msg;
		if (!WWCore.canScanMap(url) ||
			![x, y].every(Number.isSafeInteger)) return false;
		return queueTiles(url.hostname, [{ x, y, cropper: true }], sendResponse);
	}
	if (msg.type === "ww-tile-batch" || msg.type === "ww-map-sql") {
		if (!sender.url || sender.frameId !== 0 || typeof msg.url !== "string") return false;
		const page = URL.parse(sender.url);
		const response = URL.parse(msg.url);
		if (!WWCore.isMapPage(page) || response?.origin !== page.origin) return false;
		if (msg.type === "ww-tile-batch") {
			return queueTiles(WWCroppers.mapResponseHost(msg.url), msg.tiles, sendResponse, sender);
		}
		if (response.pathname !== "/map.sql" || typeof msg.body !== "string" ||
			!msg.body.length || msg.body.length > WWCore.MAX_MAP_RESPONSE_CHARS) return false;
		queuePoll([page.hostname], msg.body).then(() => sendResponse({ ok: true }));
		return true;
	}
	if (["ww-scan-start", "ww-scan-stop", "ww-scan-status"].includes(msg.type)) {
		if (sender.url !== chrome.runtime.getURL("popup.html") || !Number.isInteger(msg.tabId)) return false;
		const { tabId } = msg;
		if (msg.type === "ww-scan-start") {
			scan.start(tabId, msg.centre, msg.radius).then(sendResponse, (err) => sendResponse({ error: err.message }));
			return true;
		}
		sendResponse(msg.type === "ww-scan-stop" ? scan.stop(tabId) : scan.status(tabId));
		return false;
	}
	if (msg.type === "ww-poll") {
		const only = Array.isArray(msg.hosts) ? msg.hosts : null;
		queuePoll(only).then(() => sendResponse({ ok: true }));
		return true;
	}
	if (msg.type === "ww-settings") {
		ensureAlarm().then(() => sendResponse({ ok: true }));
		return true;
	}
	return false;
});
