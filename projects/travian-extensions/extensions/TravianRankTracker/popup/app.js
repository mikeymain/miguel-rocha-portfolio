/**
 * Rank Tracker popup — entry point.
 *
 * Owns startup, server detection, data loading, the Now/History tabs,
 * popup zoom, playtime and the rank-tier dialog. Rendering lives in
 * now-view.js and history-view.js; shared state in format.js.
 */

/** Statistics pages whose DOM can be read directly instead of fetched. */
const SCRAPE_PATHS = ["/statistics/general", "/statistics/player/top10"];
const TOP10_PATH = "/statistics/player/top10";

/** Popup zoom bounds (body.style.zoom). */
const APP_ZOOM_MIN = 0.5;
const APP_ZOOM_MAX = 2.0;
const APP_ZOOM_STEP = 0.1;

document.addEventListener("DOMContentLoaded", startPopup);

/* ── Startup ─────────────────────────────────────────────────────────── */

/** Initialise controls, detect the server and load data. */
async function startPopup() {
	initTabs();
	initBackupRestore();
	initTiersDialog();
	initHistoryControls();

	// Opened as a tab only to show the file picker: restore must not race
	// this page's own collection.
	if (new URLSearchParams(window.location.search).get("action") === "import") {
		setTimeout(() => document.getElementById("file-input")?.click(), 500);
		return;
	}

	const prefs = await api.storage.local.get(["serverUrl", "serverUrls", "velocityMode", "appZoom"]);
	initAppZoom(prefs.appZoom);
	if (prefs.velocityMode !== undefined) popupState.isVelocityMode = prefs.velocityMode;

	const tab = (await api.tabs.query({ active: true, currentWindow: true }))[0];
	const tabOrigin = await registerTravianTab(tab, prefs);
	const serverOrigin = tabOrigin || (isTravianOrigin(prefs.serverUrl) ? prefs.serverUrl : null);

	if (!serverOrigin) {
		renderNowState("empty", "Open a Travian tab, then reopen this popup.");
		setStatus("", "idle");
		return;
	}

	popupState.activeServerOrigin = serverOrigin;
	const storageKey = appHistoryKey(serverOrigin);
	updatePlaytime(serverOrigin, false).catch(() => {});

	await loadBaseline(serverOrigin);

	setStatus("Updating…", "busy");
	renderNowState("loading");
	const lastRefreshAt = await loadFromStorage(storageKey, serverOrigin);

	if (!document.getElementById("view-hist")?.hidden) {
		loadGraph((await syncHistoryControls()) || "all", storageKey);
	}

	// A refresh under OPEN_REFRESH_SKIP_MS ago is fresh enough: keep the stored snapshot.
	if (lastRefreshAt != null && Date.now() - lastRefreshAt < OPEN_REFRESH_SKIP_MS) {
		await updatePlaytime(serverOrigin);
		return;
	}

	await refreshNow(tabOrigin ? tab : null, serverOrigin, storageKey);
	await updatePlaytime(serverOrigin);
}

/**
 * Register the active tab's server when it is a Travian origin.
 *
 * @returns {Promise<string|null>} The tab's origin, or null.
 */
async function registerTravianTab(tab, prefs) {
	if (!tab?.url || !(tab.url.includes("travian.") || tab.url.includes("travian-"))) return null;
	try {
		const origin = new URL(tab.url).origin;
		if (!isTravianOrigin(origin)) return null;
		const knownServers = prefs.serverUrls || (prefs.serverUrl ? [prefs.serverUrl] : []);
		if (!knownServers.includes(origin)) knownServers.push(origin);
		await api.storage.local.set({ serverUrl: origin, serverUrls: knownServers });
		return origin;
	} catch (_) {
		return null;
	}
}

/** Load the "since last open" baseline and whether its cooldown expired. */
async function loadBaseline(serverOrigin) {
	const key = `baseline_${serverOrigin}`;
	const stored = (await api.storage.local.get([key]))[key];
	if (stored && stored.timestamp != null) {
		popupState.baselineSnapshot = stored.data || null;
		popupState.baselineExpired = Date.now() - stored.timestamp >= BASELINE_COOLDOWN_MS;
	} else {
		popupState.baselineSnapshot = null;
		popupState.baselineExpired = true; // no baseline yet: capture one this open
	}
}

/**
 * Re-pin the baseline to fresh data once its cooldown has elapsed. The
 * values shown in this popup keep using the baseline loaded at start.
 */
async function maybeUpdateBaseline(serverOrigin, data) {
	if (!serverOrigin || !data || !popupState.baselineExpired) return;
	await api.storage.local.set({ [`baseline_${serverOrigin}`]: { timestamp: Date.now(), data } });
	popupState.baselineExpired = false;
}

/* ── Data loading ────────────────────────────────────────────────────── */

/**
 * Collect fresh data: read the active statistics page when one is open on
 * this server, otherwise fetch every endpoint.
 */
async function refreshNow(tab, serverOrigin, storageKey) {
	const url = tab?.url ? new URL(tab.url) : null;
	if (url && url.origin === serverOrigin && SCRAPE_PATHS.includes(url.pathname)) {
		await scrapeActiveScreen(tab.id, serverOrigin, storageKey, url.pathname === TOP10_PATH);
	} else {
		await fetchAndRender(serverOrigin, storageKey);
	}
}

/** Fetch all endpoints, then render or show the failure. */
async function fetchAndRender(serverOrigin, storageKey) {
	const { data, status } = await fetchAllEndpoints(serverOrigin, api, storageKey);

	if (status === "logged_out") {
		setStatus("Session expired", "error");
		renderNowState("error", "Session expired. Log in to Travian, then reopen.");
		return;
	}
	if (status === "fetch_error" || !data) {
		setStatus("Update failed", "error");
		renderNowState("error", "Could not reach the server. Check the Travian tab, then reopen.");
		return;
	}

	const hist = (await api.storage.local.get([storageKey]))[storageKey] || [];
	renderUI(data, hist); // also sets "Updated HH:MM"
	await maybeUpdateBaseline(serverOrigin, data);
}

/**
 * Read the open statistics page's DOM instead of making HTTP requests.
 * `processHtmlData` renders through the global `renderUI`.
 */
async function scrapeActiveScreen(tabId, serverOrigin, storageKey, weekly = false) {
	try {
		const result = await api.scripting.executeScript({
			target: { tabId },
			func: () => document.documentElement.outerHTML,
		});
		if (!result?.[0]) throw new Error("Empty script result");

		const merged = await processHtmlData(result[0].result, api, serverOrigin, storageKey, false, weekly);
		await maybeUpdateBaseline(serverOrigin, merged);
	} catch (_) {
		await fetchAndRender(serverOrigin, storageKey);
	}
}

/** Render the last stored snapshot without network access. */
async function loadFromStorage(storageKey, serverOrigin) {
	if (!storageKey) return;
	const latestKey = `latest_${serverOrigin}`;
	const res = await api.storage.local.get([storageKey, latestKey]);
	const hist = res[storageKey] || [];
	const data = res[latestKey] || (hist.length > 0 ? hist[hist.length - 1] : { top10: [] });
	if (data.timestamp) renderUI(data, hist);
	return data.timestamp || null;
}

/**
 * Show time since the server started (statistics timeline) and time since
 * you joined. Join anchors, in order: first system message in the inbox,
 * first-seen time, oldest history entry.
 * `allowFetch` false draws from storage only, so the chip shows at open
 * instead of waiting for the network refresh and inbox fetch.
 */
async function updatePlaytime(serverOrigin, allowFetch = true) {
	const el = document.getElementById("playtime");
	if (!el || !serverOrigin) return;

	const gameStartKey = `gameStart_${serverOrigin}`;
	const firstSeenKey = `firstSeen_${serverOrigin}`;
	const serverStartKey = `serverStart_${serverOrigin}`;
	const histKey = appHistoryKey(serverOrigin);
	const res = await api.storage.local.get([gameStartKey, firstSeenKey, serverStartKey, histKey]);

	const serverEl = document.getElementById("servertime");
	const serverStart = res[serverStartKey];
	const showServer = (joinedAt) => {
		if (!serverEl) return;
		const serverElapsed = Date.now() - serverStart;
		serverEl.textContent = serverStart > 0 && serverElapsed > 0
			? `Server: ${formatDuration(serverElapsed)} · ${Math.floor(serverElapsed / 3600000)}h`
			: "";
		const gap = joinedAt - serverStart;
		serverEl.title = serverStart > 0 && Number.isFinite(gap)
			? `Joined ${formatDuration(Math.abs(gap))} ${gap < 0 ? "before" : "after"} server start`
			: "Time since server start";
	};
	showServer(NaN);

	let anchor = res[gameStartKey];
	if (anchor == null && allowFetch) anchor = await fetchGameStart(serverOrigin, api);
	if (anchor == null) anchor = res[firstSeenKey];
	if (anchor == null) {
		const hist = res[histKey] || [];
		anchor = hist.length > 0 ? hist[0].timestamp : null;
	}

	if (anchor == null) {
		el.textContent = "";
		return;
	}
	showServer(anchor);
	const elapsed = Date.now() - anchor;
	el.textContent = `Playtime: ${formatDuration(elapsed)} · ${Math.floor(elapsed / 3600000)}h`;
}

/* ── Tabs ────────────────────────────────────────────────────────────── */

/** Wire the Now/History tabs: click, arrow keys, sliding indicator. */
function initTabs() {
	const tabs = [document.getElementById("tab-now"), document.getElementById("tab-hist")];
	if (tabs.some((t) => !t)) return;

	tabs.forEach((tab) => tab.addEventListener("click", () => selectTab(tab.id)));
	tabs[0].parentElement.addEventListener("keydown", (e) => {
		if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
		e.preventDefault();
		const current = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
		const next = e.key === "Home" ? tabs[0]
			: e.key === "End" ? tabs[tabs.length - 1]
				: tabs[(current + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
		next.focus();
		selectTab(next.id);
	});
	syncTabs("tab-now");
	requestAnimationFrame(() => moveTabIndicator());
}

/** Reflect the selected tab in ARIA, tabindex and panel visibility. */
function syncTabs(selectedId) {
	for (const [tabId, viewId] of [["tab-now", "view-now"], ["tab-hist", "view-hist"]]) {
		const tab = document.getElementById(tabId);
		const view = document.getElementById(viewId);
		const selected = tabId === selectedId;
		tab?.setAttribute("aria-selected", String(selected));
		if (tab) tab.tabIndex = selected ? 0 : -1;
		if (view) view.hidden = !selected;
	}
	moveTabIndicator();
}

/** Tab-bar padding that `.tabs-indicator` already offsets by in CSS. */
const TAB_BAR_PADDING_PX = 10;

/** Position `.tabs-indicator` under the selected tab via CSS variables. */
function moveTabIndicator() {
	const active = document.querySelector('.tab[aria-selected="true"]');
	const bar = active?.parentElement;
	if (!bar) return;
	bar.style.setProperty("--tab-x", `${active.offsetLeft - TAB_BAR_PADDING_PX}px`);
	bar.style.setProperty("--tab-w", `${active.offsetWidth}px`);
}

/** Switch views. Now re-collects data; History redraws the graph. */
async function selectTab(tabId) {
	const wasSelected = document.getElementById(tabId)?.getAttribute("aria-selected") === "true";
	syncTabs(tabId);
	const origin = popupState.activeServerOrigin;
	if (!origin || wasSelected) return;
	const storageKey = appHistoryKey(origin);

	if (tabId === "tab-now") {
		setStatus("Updating…", "busy");
		const tab = (await api.tabs.query({ active: true, currentWindow: true }))[0];
		await refreshNow(tab, origin, storageKey);
		return;
	}

	const { graphFilter } = await api.storage.local.get(["graphFilter"]);
	await syncHistoryControls();
	loadGraph(graphFilter || "all", storageKey);
}

/* ── Popup zoom ──────────────────────────────────────────────────────── */

/** Chrome's popup size limit in CSS pixels. */
const APP_POPUP_W = 800;
const APP_POPUP_H = 600;

/**
 * Zoom the body and size it so the zoomed popup still fills exactly
 * 800x600; a zoom above 1 would otherwise overflow and show scrollbars.
 */
function applyAppZoom(zoom) {
	const style = document.body.style;
	style.zoom = zoom;
	style.width = `${APP_POPUP_W / zoom}px`;
	style.height = `${APP_POPUP_H / zoom}px`;
}

/** Ctrl+wheel and Ctrl +/-/0 scale the popup; the level is saved. */
function initAppZoom(savedZoom) {
	if (savedZoom) applyAppZoom(savedZoom);
	const current = () => parseFloat(document.body.style.zoom) || 1.0;
	const setZoom = async (value) => {
		const zoom = Math.max(APP_ZOOM_MIN, Math.min(Math.round(value * 10) / 10, APP_ZOOM_MAX));
		applyAppZoom(zoom);
		await api.storage.local.set({ appZoom: zoom });
	};

	window.addEventListener("wheel", (e) => {
		if (!e.ctrlKey) return;
		e.preventDefault();
		setZoom(current() + (e.deltaY < 0 ? APP_ZOOM_STEP : -APP_ZOOM_STEP));
	}, { passive: false });

	window.addEventListener("keydown", (e) => {
		if (!e.ctrlKey) return;
		const steps = { "=": APP_ZOOM_STEP, "+": APP_ZOOM_STEP, "-": -APP_ZOOM_STEP };
		if (e.key in steps) {
			e.preventDefault();
			setZoom(current() + steps[e.key]);
		} else if (e.key === "0") {
			e.preventDefault();
			setZoom(1.0);
		}
	});
}

/* ── Rank-tier dialog ────────────────────────────────────────────────── */

/** Build the tier list from RANK_TIERS and wire open/close. */
function initTiersDialog() {
	const dialog = document.getElementById("tiers-dialog");
	const list = document.getElementById("tiers-list");
	if (!dialog || !list) return;

	const top10 = appTierRow("Top 10", "rank 1–10", null);
	top10.classList.add("is-top10");
	const rows = RANK_TIERS.map((tier) => appTierRow(
		tier.name.charAt(0).toUpperCase() + tier.name.slice(1),
		tier.maxPct >= 1 ? "Rest" : `Top ${+(tier.maxPct * 100).toFixed(2)}%`,
		tier.color,
	));
	list.replaceChildren(top10, ...rows);

	document.getElementById("btn-tiers")?.addEventListener("click", () => dialog.showModal());
	document.getElementById("btn-tiers-close")?.addEventListener("click", () => dialog.close());
}

/** One `li.tier-item` row. */
function appTierRow(name, range, color) {
	const item = h("li", "tier-item");
	const swatch = h("span", "swatch");
	if (color) {
		swatch.style.setProperty("--c", color);
		item.style.setProperty("--c", color);
	}
	item.append(swatch, h("span", "tier-name", name), h("span", "tier-range", range));
	return item;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function appHistoryKey(origin) {
	return `history_${origin}`;
}


function appSetText(id, text) {
	const el = document.getElementById(id);
	if (el) el.textContent = text;
}
