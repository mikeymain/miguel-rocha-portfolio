/**
 * TRAVALARM - RESOURCE DELIVERIES FOR FNPC
 *
 * Reads returning raids (rally point overview) and incoming merchants
 * (marketplace delivery overview) for the active village: from pages the
 * user opens, and from a background fetch while an FNPC time is shown (at
 * most once per cooldown). Each read replaces that village's cached list,
 * and FNPC adds the deliveries at their arrival times.
 */

const DELIVERIES_KEY = "_w4deliv";
/** Drop cached deliveries whose arrival is further away than this. */
const DELIVERY_MAX_AHEAD_MS = 48 * 60 * 60 * 1000;
const RALLY_RES_ICONS = ["r1", "r2", "r3", "r4"];
const MARKET_RES_ICONS = ["lumber_small", "clay_small", "iron_small", "crop_small"];

// `${serverTag}_${did}` -> { raids: Delivery[], merchants: Delivery[] },
// Delivery = { at: epoch ms, res: [w, c, i, cr] }.
let _deliveries = {};
// Writes rebuild the whole stored object, so none may happen before it loads.
let _deliveriesLoaded = false;
let deliveriesReady = Promise.resolve();
try {
  deliveriesReady = api.storage.local.get(DELIVERIES_KEY).then((r) => {
    _deliveries = r?.[DELIVERIES_KEY] || {};
    _deliveriesLoaded = true;
  }).catch(() => {});
  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[DELIVERIES_KEY]) {
      _deliveries = changes[DELIVERIES_KEY].newValue || {};
    }
  });
} catch {
  /* storage unavailable: FNPC uses production only */
}

const _digits = (el) => parseInt((el?.textContent || "").replace(/\D/g, ""), 10) || 0;

/** Resource amounts next to the given icon classes, in [w, c, i, cr] order. */
function _readIconValues(root, icons) {
  return icons.map((cls) => {
    const icon = root.querySelector(`i.${cls}`);
    if (!icon) return 0;
    const next = icon.nextElementSibling;
    return _digits(next?.classList.contains("value") ? next : icon.parentElement?.querySelector(".value"));
  });
}

/** Returning troops with a bounty, from the rally point overview. */
function parseReturningRaids(root, observedAt) {
  const out = [];
  root.querySelectorAll("table.troop_details.inReturn").forEach((table) => {
    const timer = table.querySelector("tbody.infos .timer[value]");
    const secs = parseInt(timer?.getAttribute("value"), 10);
    const res = table.querySelector("tbody.infos .res");
    if (!(secs > 0) || !res) return;
    const amounts = _readIconValues(res, RALLY_RES_ICONS);
    if (amounts.some((v) => v > 0)) out.push({ at: observedAt + secs * 1000, res: amounts });
  });
  return out;
}

/** "01:57:44" -> seconds, or NaN. */
function _clockSeconds(text) {
  const m = (text || "").match(/(\d+):(\d{2}):(\d{2})/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : NaN;
}

/**
 * Incoming merchant deliveries, from the marketplace delivery overview.
 * The incoming group is the one with the "Expected total" footer; returning
 * own merchants (`.delivery.return`) carry nothing into the village.
 * Returns null when the page has no delivery overview.
 */
function parseIncomingMerchants(root, observedAt) {
  const overview = root.querySelector(".deliveriesOverview");
  if (!overview) return null;
  const group = Array.from(overview.querySelectorAll(".group")).find((g) => g.querySelector(".listFooter"));
  const out = [];
  group?.querySelectorAll(".delivery:not(.return)").forEach((d) => {
    const secs = _clockSeconds(d.querySelector(".arriveInAt")?.textContent);
    if (!(secs > 0)) return;
    const amounts = _readIconValues(d, MARKET_RES_ICONS);
    if (amounts.some((v) => v > 0)) out.push({ at: observedAt + secs * 1000, res: amounts });
  });
  return { list: out, partial: !!group?.querySelector(".showAll") };
}

// The village view links the rally point as /slot?id=39 with no tab, so a
// missing `tt` can still be the Overview the game remembered.
function _isRallyOverview() {
  const tt = new URLSearchParams(window.location.search).get("tt");
  return (
    /^\/(build\.php|building|slot)$/.test(window.location.pathname) &&
    (tt === "1" || (tt === null && !!document.querySelector("table.troop_details"))) &&
    !!document.querySelector("#build.gid16")
  );
}

// Arrival times shift by up to a second between scans; compare rounded.
const _deliverySig = (list) =>
  JSON.stringify(list.map((d) => [Math.round(d.at / 10000), d.res]));

function _storeDeliveries(key, kind, list) {
  const now = Date.now();
  const kept = list
    .filter((d) => d.at > now && d.at - now < DELIVERY_MAX_AHEAD_MS)
    .sort((a, b) => a.at - b.at);
  const prev = _deliveries[key]?.[kind] || [];
  if (_deliverySig(prev.filter((d) => d.at > now)) === _deliverySig(kept)) return;
  const pruned = {};
  for (const [k, v] of Object.entries(_deliveries)) {
    const raids = (v.raids || []).filter((d) => d.at > now);
    const merchants = (v.merchants || []).filter((d) => d.at > now);
    if (raids.length || merchants.length) pruned[k] = { raids, merchants };
  }
  const entry = { ...(pruned[key] || { raids: [], merchants: [] }), [kind]: kept };
  if (entry.raids.length || entry.merchants.length) pruned[key] = entry;
  else delete pruned[key];
  _deliveries = pruned;
  api.storage.local.set({ [DELIVERIES_KEY]: pruned }).catch(() => {});
}

/** Caches deliveries shown on the current page for the active village. */
function scanDeliveries() {
  if (!_deliveriesLoaded) return;
  const did = _readDidFromSidebar();
  if (!did) return;
  const key = `${serverTag}_${did}`;
  const now = Date.now();

  if (_isRallyOverview()) {
    const raids = parseReturningRaids(document, now);
    // A filtered view without returning troops says nothing about them.
    if (raids.length > 0 || !window.location.search.includes("filter")) {
      _storeDeliveries(key, "raids", raids);
    }
  }

  const merchants = parseIncomingMerchants(document, now);
  if (merchants) _storeMerchants(key, merchants);
}

function _storeMerchants(key, merchants) {
  let list = merchants.list;
  if (merchants.partial) {
    // "Show all" hides later deliveries: keep cached ones after the last shown.
    const last = list.reduce((m, d) => Math.max(m, d.at), 0);
    const later = (_deliveries[key]?.merchants || []).filter((d) => d.at > last + 10000);
    list = [...list, ...later];
  }
  _storeDeliveries(key, "merchants", list);
}

// Background refresh, so FNPC does not depend on the user opening the rally
// point or marketplace. Both pages are read for the active village only
// (no `newdid=`, see fetchers.js), at most once per cooldown across tabs.
const DELIVERY_FETCH_COOLDOWN_MS = 5 * 60 * 1000;
// Randomised waits before each request, so a fetch never follows a page load
// or the previous request at a fixed, instant delay.
const DELIVERY_FETCH_START_MS = 6000;
const DELIVERY_FETCH_GAP_MS = 4000;
const _waitJittered = (ms) => new Promise((resolve) => setTimeout(resolve, jitterMs(ms)));
const RALLY_INCOMING_URL = "/build.php?gid=16&tt=1&filter=1";
const MARKET_DELIVERIES_URL = "/build.php?gid=17&t=5";

/** Fetched page as a parsed document, or null on an error page. */
async function _fetchGamePage(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  const text = await res.text();
  return { doc: new DOMParser().parseFromString(text, "text/html"), observedAt: Date.now() };
}

/**
 * Re-reads returning raids and incoming merchants for the active village.
 * A page that belongs to another village (switched in another tab) or that
 * is not the rally point / delivery overview leaves the cache unchanged.
 */
async function fetchDeliveries() {
  if (!_deliveriesLoaded) return;
  // The passive scan already reads these pages when they are open.
  if (_isRallyOverview() || document.querySelector(".deliveriesOverview")) return;
  const did = _readDidFromSidebar();
  if (!did) return;
  const fetchKey = `deliveries_${did}`;
  if (!canFetch(fetchKey, jitterMs(DELIVERY_FETCH_COOLDOWN_MS))) return;
  const key = `${serverTag}_${did}`;
  // Stop if the tab was hidden or the user switched village during a wait.
  const stillWanted = () => isPlayerActive() && _readDidFromSidebar() === did;
  try {
    await _waitJittered(DELIVERY_FETCH_START_MS);
    if (!stillWanted()) return;
    const rally = await _fetchGamePage(RALLY_INCOMING_URL);
    if (rally?.doc.querySelector("#build.gid16") && _readDidFromSidebar(rally.doc) === did) {
      _storeDeliveries(key, "raids", parseReturningRaids(rally.doc, rally.observedAt));
    }
    await _waitJittered(DELIVERY_FETCH_GAP_MS);
    if (!stillWanted()) return;
    const market = await _fetchGamePage(MARKET_DELIVERIES_URL);
    if (market && _readDidFromSidebar(market.doc) === did) {
      const merchants = parseIncomingMerchants(market.doc, market.observedAt);
      if (merchants) _storeMerchants(key, merchants);
    }
  } catch {
    /* network errors keep the cached deliveries */
  } finally {
    fetchState[fetchKey].isFetching = false;
  }
  if (typeof scan === "function") scan();
}

/** Upcoming deliveries for the active village as FNPC events. */
function upcomingDeliveries() {
  const did = _readDidFromSidebar();
  if (!did) return [];
  const entry = _deliveries[`${serverTag}_${did}`];
  if (!entry) return [];
  const now = Date.now();
  return [...(entry.raids || []), ...(entry.merchants || [])]
    .filter((d) => d.at > now && Array.isArray(d.res))
    .map((d) => ({ inHours: (d.at - now) / 3600000, res: d.res }));
}
