// WorldWatch service worker: polls map.sql for each watched world.
importScripts("lib/mapsql.js", "lib/db.js", "lib/core.js", "lib/croppers.js");

const ALARM = "worldwatch-poll";
const HOST_GAP_MS = 3000;
const KEYS = { hosts: "wwHosts", status: "wwStatus", settings: "wwSettings" };

let running = Promise.resolve();
let cropperWrites = Promise.resolve();

async function saveCroppers(host, observations) {
	const { wwCroppers = {} } = await chrome.storage.local.get("wwCroppers");
	const tiles = wwCroppers[host] || {};
	let changed = false;
	for (const { x, y } of observations) {
		const id = `${x}|${y}`;
		if (tiles[id]) continue;
		tiles[id] = { x, y, seenAt: Date.now() };
		changed = true;
	}
	if (!changed) return;
	wwCroppers[host] = tiles;
	await chrome.storage.local.set({ wwCroppers });
}

function queueCroppers(host, tiles, sendResponse) {
	if (!host || !Array.isArray(tiles) || !tiles.length || !tiles.every((tile) =>
		tile && Number.isSafeInteger(tile.x) && Number.isSafeInteger(tile.y))) return false;
	const write = cropperWrites.then(() => saveCroppers(host, tiles));
	cropperWrites = write.catch(() => {});
	write.then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
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

async function pollHosts(only) {
	const { hosts, settings } = await readState();
	const targets = only ? hosts.filter((h) => only.includes(h)) : hosts;
	for (let i = 0; i < targets.length; i++) {
		if (i) await sleep(HOST_GAP_MS);
		const result = await WWCore.pollHost(targets[i], {
			fetch: (url, init) => fetch(url, init),
			store: WWDb,
			now: () => Date.now(),
			cap: settings.cap,
		});
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
function queuePoll(only) {
	running = running.then(() => pollHosts(only)).catch(() => {});
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
		const url = new URL(sender.url);
		const { x, y } = msg;
		if (url.protocol !== "https:" || !["/map", "/karte.php"].includes(url.pathname) ||
			!WWCore.normalizeHost(url.hostname) || url.hostname === "ts1.x1.europe.travian.com" ||
			![x, y].every(Number.isSafeInteger)) return false;
		return queueCroppers(url.hostname, [{ x, y }], sendResponse);
	}
	if (msg.type === "ww-cropper-batch" && sender.url === chrome.runtime.getURL("map-capture.html")) {
		return queueCroppers(WWCroppers.mapResponseHost(msg.url), msg.tiles, sendResponse);
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
