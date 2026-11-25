/**
 * TRAVALARM - RESOURCE DELIVERIES FOR FNPC
 *
 * Reads returning raids (rally point overview) and incoming merchants
 * (marketplace delivery overview) from pages the user opens. Nothing is
 * fetched: each page replaces that village's cached list, and FNPC adds the
 * deliveries at their arrival times.
 */

const DELIVERIES_KEY = "_w4deliv";
/** Drop cached deliveries whose arrival is further away than this. */
const DELIVERY_MAX_AHEAD_MS = 48 * 60 * 60 * 1000;
const RALLY_RES_ICONS = ["r1", "r2", "r3", "r4"];
const MARKET_RES_ICONS = ["lumber_small", "clay_small", "iron_small", "crop_small"];

// `${serverTag}_${did}` -> { raids: Delivery[], merchants: Delivery[] },
// Delivery = { at: epoch ms, res: [w, c, i, cr] }.
let _deliveries = {};
try {
  api.storage.local.get(DELIVERIES_KEY).then((r) => {
    _deliveries = r?.[DELIVERIES_KEY] || {};
  });
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

function _isRallyOverview() {
  const q = new URLSearchParams(window.location.search);
  return (
    /^\/(build\.php|building)$/.test(window.location.pathname) &&
    q.get("tt") === "1" &&
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
  if (merchants) {
    let list = merchants.list;
    if (merchants.partial) {
      // "Show all" hides later deliveries: keep cached ones after the last shown.
      const last = list.reduce((m, d) => Math.max(m, d.at), 0);
      const later = (_deliveries[key]?.merchants || []).filter((d) => d.at > last + 10000);
      list = [...list, ...later];
    }
    _storeDeliveries(key, "merchants", list);
  }
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
