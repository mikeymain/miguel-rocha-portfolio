/**
 * db-view.js — Oasis database modal: search, filter, sort, and open the
 * filtered oases in background tabs (tabs are created by background.js).
 */

const DB_OPEN_CONFIRM_AT = 10; // ask before opening this many tabs or more
const DB_OPEN_MAX = 50; // hard cap per click; background.js enforces it too
const DB_MAP_LIMIT = Math.floor(MAP_SIZE / 2);
const DB_BONUS_NAMES = { 1: "Lumber", 2: "Clay", 3: "Iron", 4: "Crop" };
const DB_AGE_LIMITS = {
  any: Infinity,
  "1h": 3600e3,
  "6h": 6 * 3600e3,
  "24h": 24 * 3600e3,
  "7d": 7 * 24 * 3600e3,
};
// Default direction per column: 1 = ascending, -1 = descending.
const DB_SORT_DEFAULT_DIR = { loc: 1, dist: 1, type: 1, animals: -1, res: -1, seen: 1 };
const DB_SORT_LAST = Infinity; // unknown values always sort last

let _dbSort = { key: "dist", dir: 1 };
let _dbShown = []; // filtered + sorted rows currently listed

/** "12|-34", "12/-34", "(12 | -34)" → {x, y}; null when invalid or off-map. */
function parseCoordInput(text) {
  const clean = String(text || "")
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/−/g, "-");
  const m = clean.match(/^\s*\(?\s*(-?\d+)\s*[|/,;\s]\s*(-?\d+)\s*\)?\s*$/);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (Math.abs(x) > DB_MAP_LIMIT || Math.abs(y) > DB_MAP_LIMIT) return null;
  return { x, y };
}

/** "1:25,4:25" → [{r: 1, pct: 25}, {r: 4, pct: 25}] */
function parseBonusTypes(bonus) {
  if (!bonus) return [];
  return String(bonus)
    .split(",")
    .map((part) => part.split(":").map(Number))
    .filter(([r, pct]) => DB_BONUS_NAMES[r] && Number.isFinite(pct))
    .map(([r, pct]) => ({ r, pct }));
}

function _dbGarrison(animals) {
  let count = 0;
  let res = 0;
  const names = [];
  animals.forEach((a) => {
    const stats = ANIMAL_STATS[a.id];
    count += a.count;
    res += (stats?.res || 0) * a.count;
    names.push(`${a.count} ${stats?.name || a.id}`);
  });
  return { count, res, garrison: names.join(" · ") };
}

/**
 * One row per stored oasis key. Animal data comes from the persisted scan map;
 * oases without it (never scanned with animals, cleared or occupied) have none.
 */
function buildDbRows(keys, results, bonuses, origin) {
  const rows = [];
  for (const key of keys) {
    const [x, y] = key.split("|").map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    const dx = torusDelta(x, origin.x);
    const dy = torusDelta(y, origin.y);
    const entry = results.get(key);
    const animals = entry && Array.isArray(entry.animals) ? entry.animals : [];
    const scannedAt = Number(entry?.scannedAt);
    rows.push({
      key,
      x,
      y,
      dist: Math.sqrt(dx * dx + dy * dy),
      animals,
      ..._dbGarrison(animals),
      scannedAt: Number.isFinite(scannedAt) && scannedAt > 0 ? scannedAt : 0,
      types: parseBonusTypes(bonuses.get(key)),
    });
  }
  return rows;
}

function _dbMatchesQuery(row, query) {
  if (!query) return true;
  const coordQuery = query.replace(/[()\s]/g, "");
  return `${row.x}|${row.y}`.includes(coordQuery) || row.garrison.toLowerCase().includes(query);
}

/**
 * filter: { query, type: "any"|"1".."4"|"none", state: "all"|"animals"|"nodata",
 *           radius: number (0 = no limit), maxAge: ms (Infinity = any) }
 */
function filterDbRows(rows, filter, now = Date.now()) {
  const query = String(filter.query || "").trim().toLowerCase();
  const typeId = /^[1-4]$/.test(filter.type || "") ? Number(filter.type) : 0;
  return rows.filter((row) => {
    if (filter.radius > 0 && row.dist > filter.radius) return false;
    if (filter.state === "animals" && row.count === 0) return false;
    if (filter.state === "nodata" && row.count > 0) return false;
    if (filter.type === "none" && row.types.length) return false;
    if (typeId && !row.types.some((t) => t.r === typeId)) return false;
    if (Number.isFinite(filter.maxAge) && (!row.scannedAt || now - row.scannedAt > filter.maxAge)) return false;
    return _dbMatchesQuery(row, query);
  });
}

function _dbSortValue(row, key, now) {
  switch (key) {
    case "loc":
      return row.x * 1000 + row.y;
    case "type":
      return row.types.length ? row.types[0].r * 1000 - row.types[0].pct : DB_SORT_LAST;
    case "animals":
      return row.count;
    case "res":
      return row.res;
    case "seen":
      return row.scannedAt ? now - row.scannedAt : DB_SORT_LAST;
    case "dist":
    default:
      return row.dist;
  }
}

/** Returns a new sorted array; unknown values sort last, ties break on distance. */
function sortDbRows(rows, key, dir, now = Date.now()) {
  return [...rows].sort((a, b) => {
    const va = _dbSortValue(a, key, now);
    const vb = _dbSortValue(b, key, now);
    if (va !== vb) {
      if (va === DB_SORT_LAST) return 1;
      if (vb === DB_SORT_LAST) return -1;
      return (va - vb) * dir;
    }
    return a.dist - b.dist;
  });
}

function _dbTypeHTML(types) {
  if (!types.length) return '<span class="_vpdb-dim">—</span>';
  return types
    .map((t) => `<span class="_vpdb-type _vpdb-type-${t.r}">${escapeHTML(DB_BONUS_NAMES[t.r])} ${escapeHTML(String(t.pct))}%</span>`)
    .join("");
}

function _dbRowHTML(o, now) {
  const age = o.scannedAt ? getObservationAge(o, now) : null;
  const seenCls = age ? (age.stale ? "_vphp-mid" : "_vphp-ok") : "_vpdb-dim";
  const seen = age ? age.label || "now" : "—";
  const dash = '<span class="_vpdb-dim">—</span>';
  return (
    `<div class="_vpmodal-item" role="row">` +
    `<a role="cell" href="/position_details.php?x=${o.x}&y=${o.y}" target="_blank" class="_vpmodal-coords">${o.x}|${o.y}</a>` +
    `<span role="cell" class="_vpmodal-dist">${escapeHTML(o.dist.toFixed(1))}</span>` +
    `<span role="cell" class="_vpdb-types">${_dbTypeHTML(o.types)}</span>` +
    `<span role="cell" class="_vpmodal-gar" title="${escapeHTML(o.garrison)}">${o.count ? escapeHTML(o.garrison) : dash}</span>` +
    `<span role="cell" class="_vpdb-res">${o.res ? escapeHTML(o.res.toLocaleString()) : dash}</span>` +
    `<span role="cell" class="_vpdb-seen ${seenCls}">${escapeHTML(seen)}</span>` +
    `</div>`
  );
}

function _dbReadFilter() {
  const radius = parseFloat(document.getElementById("_vpdb-radius")?.value);
  return {
    query: document.getElementById("_vpdb-q")?.value || "",
    type: document.getElementById("_vpdb-type")?.value || "any",
    state: document.getElementById("_vpdb-state")?.value || "all",
    radius: Number.isFinite(radius) && radius > 0 ? radius : 0,
    maxAge: DB_AGE_LIMITS[document.getElementById("_vpdb-age")?.value] ?? Infinity,
  };
}

function _dbOrigin() {
  const parsed = parseCoordInput(document.getElementById("_vpdb-xy")?.value);
  if (parsed) return parsed;
  const { cx, cy } = getCoords();
  return { x: cx, y: cy };
}

function _dbUpdateSortHeaders() {
  document.querySelectorAll("._vpdb-sort").forEach((btn) => {
    const active = btn.dataset.sort === _dbSort.key;
    const dir = _dbSort.dir > 0 ? "ascending" : "descending";
    btn.classList.toggle("active", active);
    btn.dataset.dir = active ? (_dbSort.dir > 0 ? "asc" : "desc") : "";
    btn.closest("[role=columnheader]")?.setAttribute("aria-sort", active ? dir : "none");
  });
}

function _dbUpdateFooter(total, radius) {
  const shown = document.getElementById("_vpdb-shown");
  if (shown) shown.textContent = `${_dbShown.length} / ${total}`;
  const openBtn = document.getElementById("_vpdb-open");
  if (!openBtn || openBtn.dataset.busy) return;
  const n = Math.min(_dbShown.length, DB_OPEN_MAX);
  openBtn.disabled = !radius || n === 0;
  openBtn.textContent = `Open ${n}`;
  openBtn.title = radius ? `Max ${DB_OPEN_MAX} per click` : "Set a radius";
}

function renderDbList() {
  const list = document.getElementById("_vpdb-list");
  if (!list) return;
  const now = Date.now();
  const filter = _dbReadFilter();
  const xyInput = document.getElementById("_vpdb-xy");
  if (xyInput) {
    const bad = !!xyInput.value.trim() && !parseCoordInput(xyInput.value);
    xyInput.classList.toggle("_vpdb-invalid", bad);
    xyInput.setAttribute("aria-invalid", String(bad));
  }

  const rows = buildDbRows(knownOases, resultsMap, oasisBonuses, _dbOrigin());
  _dbShown = sortDbRows(filterDbRows(rows, filter, now), _dbSort.key, _dbSort.dir, now);
  _dbUpdateSortHeaders();

  if (!rows.length) {
    list.innerHTML = '<div class="_vpresults-empty">Empty</div>';
  } else if (!_dbShown.length) {
    list.innerHTML = '<div class="_vpresults-empty">No oases match the filters.</div>';
  } else {
    list.innerHTML = _dbShown.map((o) => _dbRowHTML(o, now)).join("");
  }
  _dbUpdateFooter(rows.length, filter.radius);
}

function _dbFillOriginSelect() {
  const sel = document.getElementById("_vpdb-from");
  const xy = document.getElementById("_vpdb-xy");
  if (!sel || !xy) return;
  const villages = getVillages();
  const { cx, cy } = getCoords();
  const current = `${cx}|${cy}`;
  sel.innerHTML =
    villages
      .map((v) => `<option value="${escapeHTML(v.x)}|${escapeHTML(v.y)}">${escapeHTML(v.name)} (${escapeHTML(v.x)}|${escapeHTML(v.y)})</option>`)
      .join("") + '<option value="custom">Coordinate</option>';
  const keepCustom = sel.dataset.custom === "1" && parseCoordInput(xy.value);
  if (keepCustom) {
    sel.value = "custom";
    return;
  }
  sel.value = villages.some((v) => `${v.x}|${v.y}` === current) ? current : "custom";
  xy.value = current;
}

function openDbOases() {
  const btn = document.getElementById("_vpdb-open");
  const total = _dbShown.length;
  if (!total || !btn || btn.dataset.busy) return;
  const take = _dbShown.slice(0, DB_OPEN_MAX);
  if (total > DB_OPEN_MAX) {
    if (!confirm(`Open the first ${DB_OPEN_MAX} of ${total} oases (current sort) in new tabs?`)) return;
  } else if (total >= DB_OPEN_CONFIRM_AT) {
    if (!confirm(`Open ${total} oases in new tabs?`)) return;
  }
  btn.dataset.busy = "1";
  btn.disabled = true;
  btn.textContent = "Opening…";
  const done = (error) => {
    delete btn.dataset.busy;
    renderDbList();
    const shown = document.getElementById("_vpdb-shown");
    if (error && shown) shown.textContent = error;
  };
  try {
    Promise.resolve(
      browser.runtime.sendMessage({
        type: "oasiscalc:openOases",
        coords: take.map(({ x, y }) => ({ x, y })),
      }),
    )
      .then((reply) => done(reply && reply.ok ? "" : "Could not open tabs"))
      .catch(() => done("Could not open tabs. Reload the page."));
  } catch (_) {
    done("Could not open tabs. Reload the page.");
  }
}

function _dbLoadBonuses(modal) {
  // Oasis types are saved by every map scan but not loaded on this page.
  Promise.resolve(browser.storage.local.get(BONUS_KEY))
    .then((data) => {
      const stored = data?.[BONUS_KEY];
      if (!stored || typeof stored !== "object") return;
      for (const [k, v] of Object.entries(stored)) {
        if (typeof v === "string" && !oasisBonuses.has(k)) oasisBonuses.set(k, v);
      }
      if (modal.style.display === "flex") renderDbList();
    })
    .catch(() => {});
}

function viewDatabase() {
  const modal = document.getElementById("_vpdb-modal");
  const dialog = modal?.querySelector("._vpmodal-dialog");
  if (!modal || !dialog) return;
  dialog.classList.remove("_vpmodal-errors");
  document.getElementById("_vpmodal-title").innerText = "OASIS DATABASE";
  updateDBCount();
  const radius = document.getElementById("_vpdb-radius");
  if (radius && radius.value === "") radius.value = document.getElementById("_vpradius")?.value || "";
  _dbFillOriginSelect();
  renderDbList();
  modal.style.display = "flex";
  _dbLoadBonuses(modal);
}

function closeDatabaseView() {
  document.getElementById("_vpdb-modal").style.display = "none";
}

function initDatabaseView() {
  const tools = document.getElementById("_vpdb-tools");
  if (!tools) return;
  tools.addEventListener("input", (e) => {
    if (e.target.id === "_vpdb-xy") {
      const sel = document.getElementById("_vpdb-from");
      const val = e.target.value.trim();
      const isVillage = !!sel && [...sel.options].some((o) => o.value === val && o.value !== "custom");
      if (sel) {
        sel.value = isVillage ? val : "custom";
        sel.dataset.custom = isVillage ? "" : "1";
      }
    }
    renderDbList();
  });
  tools.addEventListener("change", (e) => {
    if (e.target.id === "_vpdb-from") {
      e.target.dataset.custom = e.target.value === "custom" ? "1" : "";
      if (e.target.value !== "custom") document.getElementById("_vpdb-xy").value = e.target.value;
      else document.getElementById("_vpdb-xy").focus();
    }
    renderDbList();
  });
  document.querySelector("._vpdb-colhead")?.addEventListener("click", (e) => {
    const btn = e.target.closest("._vpdb-sort");
    if (!btn) return;
    const key = btn.dataset.sort;
    _dbSort = _dbSort.key === key ? { key, dir: -_dbSort.dir } : { key, dir: DB_SORT_DEFAULT_DIR[key] || 1 };
    renderDbList();
  });
  document.getElementById("_vpdb-open")?.addEventListener("click", openDbOases);
}
