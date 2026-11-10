// Service worker — only purpose is to expose OasisCalc's known-oases database
// to other locally installed Travian extensions (FarmList Pro) via the
// externally_connectable bridge declared in manifest.json.
//
// Storage layout (set by content scripts on /karte.php):
//   db_<hostname>      — array of "x|y" strings (keys of the knownOases Set)
//   sc_<hostname>      — scan-result entries (Map serialized as Array of [k, v])
//
// The reply is intentionally minimal: an array of {x, y} pairs for the
// requested host. The caller filters by radius/center on its side.

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
	if (!msg || typeof msg !== 'object') return;

	if (msg.type === 'oasiscalc:exportOases') {
		(async () => {
			try {
				const host = String(msg.host || '').trim();
				if (!host) { sendResponse({ ok: false, error: 'host is required' }); return; }
				const key = `db_${host}`;
				const stored = await chrome.storage.local.get(key);
				const raw = stored[key] || [];
				const oases = [];
				for (const k of raw) {
					if (typeof k !== 'string') continue;
					const [xs, ys] = k.split('|');
					const x = parseInt(xs, 10);
					const y = parseInt(ys, 10);
					if (Number.isFinite(x) && Number.isFinite(y)) oases.push({ x, y });
				}
				sendResponse({ ok: true, host, oases });
			} catch (e) {
				sendResponse({ ok: false, error: e.message });
			}
		})();
		return true;
	}

	// Export scan results (oases with their detected animal composition) for the
	// given host. Used by FarmList Pro's animals column on oasis lists.
	if (msg.type === 'oasiscalc:exportScan') {
		(async () => {
			try {
				const host = String(msg.host || '').trim();
				if (!host) { sendResponse({ ok: false, error: 'host is required' }); return; }
				const key = `sc_${host}`;
				const stored = await chrome.storage.local.get(key);
				const raw = stored[key] || [];
				const oases = [];
				for (const entry of raw) {
					// resultsMap was serialized as Array<[k, v]> where v = {x, y, animals: [{id, count}]}
					const v = Array.isArray(entry) ? entry[1] : entry;
					if (!v || typeof v.x !== 'number' || typeof v.y !== 'number') continue;
					const animals = Array.isArray(v.animals)
						? v.animals.filter(a => a && Number.isFinite(a.id) && Number.isFinite(a.count) && a.count > 0)
						: [];
					oases.push({ x: v.x, y: v.y, animals });
				}
				sendResponse({ ok: true, host, oases });
			} catch (e) {
				sendResponse({ ok: false, error: e.message });
			}
		})();
		return true;
	}

	if (msg.type === 'oasiscalc:listHosts') {
		(async () => {
			try {
				const all = await chrome.storage.local.get(null);
				const hosts = Object.keys(all)
					.filter(k => k.startsWith('db_'))
					.map(k => k.slice(3));
				sendResponse({ ok: true, hosts });
			} catch (e) {
				sendResponse({ ok: false, error: e.message });
			}
		})();
		return true;
	}
});

// "Open N" in the oasis database: the content script sends coordinates only.
// URLs are built here from the sender tab's own Travian origin, so a message
// can never open an arbitrary site. Tabs open one at a time with a gap to
// avoid a burst of game requests.
const OPEN_OASES_MAX = 50;
const OPEN_OASES_MAP_LIMIT = 200;
const OPEN_OASES_GAP_MS = [350, 750];

function buildOasisTabUrls(senderUrl, coords) {
	let origin;
	try {
		const url = new URL(senderUrl);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
		if (!/(^|\.)travian\.com$/i.test(url.hostname)) return null;
		origin = url.origin;
	} catch (_) {
		return null;
	}
	if (!Array.isArray(coords)) return null;
	const urls = [];
	const seen = new Set();
	for (const c of coords) {
		if (urls.length >= OPEN_OASES_MAX) break;
		const x = c && c.x;
		const y = c && c.y;
		if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
		if (Math.abs(x) > OPEN_OASES_MAP_LIMIT || Math.abs(y) > OPEN_OASES_MAP_LIMIT) continue;
		const key = `${x}|${y}`;
		if (seen.has(key)) continue;
		seen.add(key);
		urls.push(`${origin}/position_details.php?x=${x}&y=${y}`);
	}
	return urls;
}

async function openOasisTabs(urls, tab) {
	const [minGap, maxGap] = OPEN_OASES_GAP_MS;
	for (let i = 0; i < urls.length; i++) {
		if (i) await new Promise(r => setTimeout(r, minGap + Math.random() * (maxGap - minGap)));
		try {
			await chrome.tabs.create({ url: urls[i], active: false, windowId: tab.windowId, index: tab.index + 1 + i });
		} catch (e) {
			console.warn('[OasisCalc] Could not open oasis tab', e);
		}
	}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (!msg || msg.type !== 'oasiscalc:openOases') return;
	if (sender.id !== chrome.runtime.id || !sender.tab) {
		sendResponse({ ok: false, error: 'invalid sender' });
		return;
	}
	const urls = buildOasisTabUrls(sender.tab.url || sender.url, msg.coords);
	if (!urls || !urls.length) {
		sendResponse({ ok: false, error: 'no valid oases' });
		return;
	}
	sendResponse({ ok: true, count: urls.length });
	openOasisTabs(urls, sender.tab);
});
