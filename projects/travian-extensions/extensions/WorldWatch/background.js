// WorldWatch service worker: polls map.sql for each watched world.
importScripts("lib/mapsql.js", "lib/db.js", "lib/core.js");

const ALARM = "worldwatch-poll";
const HOST_GAP_MS = 3000;
const KEYS = { hosts: "wwHosts", status: "wwStatus", settings: "wwSettings" };

let running = Promise.resolve();

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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	if (!msg || typeof msg.type !== "string") return false;
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
