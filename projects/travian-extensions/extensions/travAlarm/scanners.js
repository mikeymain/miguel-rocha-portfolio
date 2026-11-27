/**
 * TRAVIAN WATCHMAN PRO - SCANNERS
 */

// ==========================================
// SCAN UTILITIES
// ==========================================

/** Extracts a village name from a table row, checking .vil then td:first-child. */
function getVillageNameFromRow(row) {
  const vilCell =
    row.querySelector(".vil") || row.querySelector("td:first-child");
  if (!vilCell) return "Village";
  const a = vilCell.querySelector("a");
  return cleanText((a ?? vilCell).innerText);
}

const NPC_MSG_STYLE =
  "display: inline-block; font-family: Arial, Helvetica, Verdana, sans-serif; font-size: 12px; color: #777777; font-weight: bold; margin-left: 10px; white-space: nowrap;";

// Building pages: build.php was renamed to /building (resource fields: /slot).
function isBuildingPage() {
  return /^\/(build\.php|building|slot)$/.test(window.location.pathname);
}

function isResourcesPage() {
  const href = window.location.href;
  const search = window.location.search;
  return (
    href.includes("/village/statistics/resources") ||
    (href.includes("dorf3.php") &&
      (search.includes("s=0") || !search.includes("s=")))
  );
}

/** Calls fn(...args) swallowing any thrown error — scan errors are non-critical. */
function tryScan(fn, ...args) {
  try {
    return fn(...args);
  } catch {
    return null;
  }
}

// ==========================================
// CORE LOGIC: MAIN SCAN LOOP
// ==========================================

function scan() {
  if (typeof timerWidget !== "undefined" && timerWidget) {
    const isMap = /^\/(karte\.php|map)$/.test(window.location.pathname);
    const isFull =
      new URLSearchParams(window.location.search).get("fullscreen") === "1";
    timerWidget.style.display = isMap && isFull ? "none" : "";
  }

  try {
    const villageMap = scanVillages();
    const activeVillage = getActiveVillageName();
    const found = [];
    let matchedBuildingIds = null;

    scanProduction(activeVillage);
    tryScan(scanDeliveries);
    scanNPCBuild(activeVillage);

    const scanResult = tryScan(scanBuildings, activeVillage);
    if (scanResult) {
      found.push(...scanResult.newBuildings);
      matchedBuildingIds = scanResult.matchedIds;
    }

    const resStatus = tryScan(scanResources);
    if (resStatus && resStatus.length > 0) found.push(...resStatus);

    // Deep Attack Scanner
    tryScan(scanForSidebarAttacksAndFetch);

    // Training queue on-page trigger
    const isTrainingStatsPage = window.location.pathname.includes(
      "/village/statistics/troops/training",
    );
    const isTrainingBuildingPage =
      isBuildingPage() &&
      !!document.querySelector(".trainBuilding");
    if (isTrainingStatsPage || isTrainingBuildingPage) {
      tryScan(fetchTrainingData);
    }

    // Settler/Chieftain training on-page trigger (Residence/Palace only —
    // expansion units never appear on the troops training statistics page)
    if (isBuildingPage()) {
      tryScan(scanSettlerTraining, activeVillage);
      tryScan(scanResearch, activeVillage);
    }

    // Celebrations on-page trigger
    const isCpPage =
      window.location.href.includes("/village/statistics/culturepoints") ||
      (window.location.href.includes("dorf3.php") &&
        window.location.search.includes("s=2"));
    if (isCpPage) tryScan(fetchCelebrationsData);

    // Storage on-page trigger
    if (isResourcesPage()) tryScan(fetchWarehouseData);

    if (matchedBuildingIds) handleQueueCleanup(matchedBuildingIds, activeVillage);
    if (found.length > 0)
      api.runtime.sendMessage({ type: "REFRESH_ALARMS", buildings: found });
  } catch {}
}

// ==========================================
// SCANNERS
// ==========================================

function scanProduction(activeVillage) {
  if (!/^\/(dorf1\.php|resources)$/.test(window.location.pathname)) return;
  const table = document.getElementById("production");
  if (!table) return;
  const rows = table.querySelectorAll("tbody tr");
  let total = 0;
  const prodMap = { w: 0, c: 0, i: 0, cr: 0 };
  rows.forEach((row) => {
    const numCell = row.querySelector(".num");
    if (numCell) {
      const val = parseInt(
        numCell.innerText.replace("−", "-").replace(/[^0-9-]/g, ""),
        10,
      );
      if (!isNaN(val)) {
        total += val;
        if (row.querySelector(".r1") || row.querySelector(".wood"))
          prodMap.w = val;
        else if (row.querySelector(".r2") || row.querySelector(".clay"))
          prodMap.c = val;
        else if (row.querySelector(".r3") || row.querySelector(".iron"))
          prodMap.i = val;
        else if (row.querySelector(".r4") || row.querySelector(".crop"))
          prodMap.cr = val;
      }
    }
  });
  if (activeVillage) {
    writeProdCache(`${serverTag}_${activeVillage}`, total, prodMap);
  }
}

function scanNPCBuild(activeVillage) {
  const url = window.location.href.toLowerCase();
  if (url.includes("report") || url.includes("berichte.php")) return;
  const costWrappers = Array.from(document.querySelectorAll(
    ".resourceWrapper, .contractCosts, .showCosts",
  )).filter(el => !el.closest('.dialog, #combatSimulator, table.troop_details'));
  if (costWrappers.length === 0) return;

  const l1 = parseInt(
    document.getElementById("l1")?.innerText.replace(/\D/g, "") || "0",
  );
  const l2 = parseInt(
    document.getElementById("l2")?.innerText.replace(/\D/g, "") || "0",
  );
  const l3 = parseInt(
    document.getElementById("l3")?.innerText.replace(/\D/g, "") || "0",
  );
  const l4 = parseInt(
    document.getElementById("l4")?.innerText.replace(/\D/g, "") || "0",
  );
  const currentTotal = l1 + l2 + l3 + l4;
  const stock = [l1, l2, l3, l4];
  // The page's own rates (net crop, hero and oasis bonuses included) are
  // exact and current; the cached statistics figures are only a fallback.
  const page = readPageResources();
  const caps = page?.caps ?? readStorageCaps();

  const prodTotalRaw = page
    ? page.prod.reduce((a, b) => a + b, 0)
    : readProdTotal(`${serverTag}_${activeVillage}`);
  const prodTotal = prodTotalRaw ?? 0;

  if (prodTotalRaw === null) {
    fetchProductionData();
  }

  let showsNpcTime = false;
  costWrappers.forEach((wrapper) => {
    const c1 = getResourceValue(wrapper, "r1");
    const c2 = getResourceValue(wrapper, "r2");
    const c3 = getResourceValue(wrapper, "r3");
    const c4 = getResourceValue(wrapper, "r4");
    const costTotal = c1 + c2 + c3 + c4;

    if (costTotal === 0) return;
    if (currentTotal >= costTotal) {
      removeNpcLabel(wrapper);
      return;
    }

    let msg = "";
    let doneAt = 0;
    if (prodTotalRaw === null) {
      msg = "NPC: Fetching Prod...";
    } else if (!page && prodTotal === 0) {
      msg = "NPC: Visit 'Resources' tab";
    } else if ([c1, c2, c3, c4].some((c, i) => c > caps[i])) {
      msg = "NPC: Storage too small";
    } else {
      const cached = readProdMap(`${serverTag}_${activeVillage}`);
      const map = page
        ? { w: page.prod[0], c: page.prod[1], i: page.prod[2], cr: page.prod[3] }
        : cached;
      const prod = map
        ? [map.w, map.c, map.i, map.cr].map((p) => p || 0)
        : [prodTotal, 0, 0, 0];
      const noCaps = stock.map(() => Infinity);
      const raidIncome = typeof raidIncomeEvent === "function" ? raidIncomeEvent() : null;
      const events = raidIncome ? [...upcomingDeliveries(), raidIncome] : upcomingDeliveries();
      const hours = npcEtaWithEvents(stock, prod, map ? caps : noCaps, costTotal, events);
      if (!isFinite(hours)) {
        msg = "NPC: Negative Prod";
      } else {
        // Round up to the minute: HH:MM must not show a time before it's affordable.
        doneAt = Math.ceil((Date.now() + hours * 3600000) / 60000) * 60000;
        msg = `FNPC: ${npcClockText(doneAt)}`;
      }
    }
    if (doneAt) showsNpcTime = true;
    setNpcLabel(wrapper, msg, doneAt);
  });
  // Deliveries only change an FNPC time, so they are fetched only when one is shown.
  if (showsNpcTime && typeof fetchDeliveries === "function") fetchDeliveries();
}

// Each cost box keeps one label. Text changes go through the label's text
// node (characterData), which the page MutationObserver does not watch, so
// updating a label never re-triggers scan().
const npcLabels = new WeakMap();
const liveNpcLabels = new Set();

/** "14:32" or "14:32 (+1d)" in local time. */
function npcClockText(doneAt) {
  const done = new Date(doneAt);
  const timeStr = done.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const days = Math.round(
    (new Date(doneAt).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000,
  );
  return `${timeStr}${days > 0 ? ` (+${days}d)` : ""}`;
}

function npcLabelText(label) {
  return label.doneAt
    ? `${label.base} · ${formatNpcCountdown(label.doneAt - Date.now())}`
    : label.base;
}

function removeNpcLabel(wrapper) {
  const label = npcLabels.get(wrapper);
  if (!label) return;
  label.el.remove();
  liveNpcLabels.delete(label);
  npcLabels.delete(wrapper);
}

function setNpcLabel(wrapper, base, doneAt) {
  let label = npcLabels.get(wrapper);
  if (label && !label.el.isConnected) {
    removeNpcLabel(wrapper);
    label = null;
  }
  if (!label) {
    const el = insertNpcLabel(wrapper);
    if (!el) return;
    label = { el, text: el.appendChild(document.createTextNode("")), base, doneAt };
    npcLabels.set(wrapper, label);
    liveNpcLabels.add(label);
  }
  label.base = base;
  label.doneAt = doneAt;
  const text = npcLabelText(label);
  if (label.text.data !== text) label.text.data = text;
}

/** Updates the countdowns from their stored done-at times; reads no page data. */
function refreshNpcCountdowns() {
  for (const label of liveNpcLabels) {
    if (!label.el.isConnected) {
      liveNpcLabels.delete(label);
      continue;
    }
    if (!label.doneAt) continue;
    const text = npcLabelText(label);
    if (label.text.data !== text) label.text.data = text;
  }
}

function nextSkippingFillers(node) {
  while (node && (node.tagName === "INPUT" || node.classList.contains("clear"))) {
    node = node.nextElementSibling;
  }
  return node;
}

/** Creates an empty label element next to a cost box; returns it or null. */
function insertNpcLabel(wrapper) {
  let sibling = nextSkippingFillers(wrapper.nextElementSibling);
  let durationNode = null;
  let infoNode = null;
  if (
    sibling &&
    (sibling.classList.contains("duration") ||
      sibling.querySelector(".clock") ||
      sibling.querySelector('img[class*="clock"]'))
  ) {
    durationNode = sibling;
    sibling = nextSkippingFillers(sibling.nextElementSibling);
  }
  if (sibling) {
    if (
      sibling.classList.contains("errorMessage") ||
      sibling.classList.contains("infoMessage")
    ) {
      infoNode = sibling;
    } else if (sibling.querySelector) {
      infoNode = sibling.querySelector(".errorMessage, .infoMessage");
    }
  }

  // Drop orphaned labels here; labels owned by other cost boxes stay.
  const target = durationNode || wrapper;
  const owned = new Set([...liveNpcLabels].map((label) => label.el));
  (infoNode || target?.parentNode)
    ?.querySelectorAll("._w-nm")
    .forEach((el) => owned.has(el) || el.remove());

  if (infoNode) {
    const span = document.createElement("span");
    span.className = "_w-nm";
    span.style.cssText = NPC_MSG_STYLE;
    const enough = [...infoNode.childNodes].find(
      (node) => node.nodeType === 3 && node.textContent.includes("Enough resources"),
    );
    if (enough) infoNode.insertBefore(span, enough.nextSibling);
    else {
      const br = infoNode.querySelector("br");
      if (br) infoNode.insertBefore(span, br);
      else infoNode.appendChild(span);
    }
    return span;
  }
  if (!target?.parentNode) return null;
  const errorMsg = target.parentNode.querySelector(".errorMessage, .infoMessage");
  if (errorMsg) {
    const span = document.createElement("span");
    span.className = "_w-nm";
    span.style.cssText = NPC_MSG_STYLE;
    errorMsg.appendChild(span);
    return span;
  }
  const div = document.createElement("div");
  div.className = "_w-nm";
  target.parentNode.insertBefore(div, target.nextSibling);
  return div;
}

function scanResources() {
  if (!isResourcesPage()) return [];

  let newAlarms = [];
  const scannedVillages = new Set();
  const processResourceRow = (vName, cell, icon, name, type, emptyIcon, emptyName) => {
    if (!cell) return;
    let delay = 0;
    const timerSpan = cell.querySelector(".timer");
    if (timerSpan) {
      delay = (timerSpan.getAttribute("value") | 0) * 1000;
    } else {
      const text = cell.innerText.trim();
      if (/\d+:\d+:\d+/.test(text)) delay = parseSmartDuration(text);
    }
    // Travian prefixes depleting crop timers with U+2212 "−"; swap to the empty alarm
    const isDepleting = /^[−-]/.test(cell.innerText.trim());
    if (isDepleting && emptyName) {
      icon = emptyIcon || icon;
      name = emptyName;
    }
    const threshold = type === "storage" ? STORAGE_THRESHOLD : 7200000;
    if (delay > 0 && delay < threshold) {
      const alarmName = `${icon} ${name} | ${vName} ${serverTag}`;
      const newScheduledTime = Date.now() + delay;
      currentAlarms.forEach((a) => {
        if (
          a.name === alarmName &&
          Math.abs(a.scheduledTime - newScheduledTime) > 10000
        ) {
          api.runtime.sendMessage({
            type: "DELETE_ALARM",
            id: a.id,
            name: a.name,
          });
        }
      });
      newAlarms.push({ name: alarmName, delay: delay, customType: type });
    }
  };
  const warehouseTable = document.getElementById("warehouse");
  if (warehouseTable) {
    const rows = warehouseTable.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 7) return;
      const vName = getVillageNameFromRow(row);
      scannedVillages.add(vName);
      processResourceRow(vName, cells[4], "📦", "Warehouse Full", "storage");
      processResourceRow(vName, cells[6], "📦", "Granary Full", "storage", "🌾", "Granary Empty");
    });
    performResourceCleanup(scannedVillages, newAlarms);
    return newAlarms;
  }
  const table =
    document.getElementById("overview") ||
    document.getElementById("resources") ||
    document.querySelector("#content table");
  if (!table) return [];
  const rows = table.querySelectorAll("tbody tr");
  rows.forEach((row) => {
    const vName = getVillageNameFromRow(row);
    scannedVillages.add(vName);
    const resTypes = [
      {
        icon: "🪵",
        name: "Wood",
        selectors: [".lum", ".r1", "td:nth-child(2)"],
      },
      {
        icon: "🧱",
        name: "Clay",
        selectors: [".clay", ".r2", "td:nth-child(3)"],
      },
      {
        icon: "🔩",
        name: "Iron",
        selectors: [".iron", ".r3", "td:nth-child(4)"],
      },
      {
        icon: "🌾",
        name: "Crop",
        selectors: [".crop", ".r4", "td:nth-child(5)"],
      },
    ];
    resTypes.forEach((type) => {
      let cell = row.querySelector(type.selectors[0]);
      if (!cell) cell = row.querySelector(type.selectors[1]);
      if (!cell && !row.querySelector(".lum"))
        cell = row.querySelector(type.selectors[2]);
      if (cell) {
        processResourceRow(vName, cell, type.icon, type.name, "resource");
      }
    });
  });
  performResourceCleanup(scannedVillages, newAlarms);
  return newAlarms;
}

function performResourceCleanup(scannedVillages, newAlarms) {
  const newAlarmNames = new Set(newAlarms.map((a) => a.name));
  const resourceIcons = ["📦", "🌾", "🪵", "🧱", "🔩"];
  currentAlarms.forEach((a) => {
    const isResourceAlarm =
      resourceIcons.some((icon) => a.name.includes(icon)) ||
      a.customType === "storage" ||
      a.name.includes("Full in") ||
      a.name.includes("Empty in");
    if (!isResourceAlarm) return;
    let belongsToScanned = false;
    for (const v of scannedVillages) {
      const marker = `| ${v} ${serverTag}`;
      if (a.name.includes(marker)) {
        belongsToScanned = true;
        break;
      }
    }
    if (belongsToScanned && !newAlarmNames.has(a.name)) {
      api.runtime.sendMessage({ type: "DELETE_ALARM", id: a.id, name: a.name });
    }
  });
}

function scanVillages() {
  const map = {};
  const items = document.querySelectorAll(
    ".villageList li, .villageList .listEntry",
  );
  items.forEach((item) => {
    const nameNode = item.querySelector(".name");
    const coordNode =
      item.querySelector(".coordinates.coordinatesWrapper") ||
      item.querySelector(".coordinatesGrid .coordinatesWrapper");

    // Populate Global Map
    const link = item.querySelector("a");
    let vid = null;
    if (link && link.href) {
      const match = link.href.match(/newdid=(\d+)/);
      if (match) vid = match[1];
    }
    // Fallback: Travian sidebar now exposes vid via `data-did` on the <li>
    // rather than `newdid=` in the href.
    if (!vid) vid = item.getAttribute("data-did") || null;
    if (nameNode && vid) {
      const vName = cleanText(nameNode.innerText);
      globalVillageMap[vid] = vName;
    }

    if (nameNode && coordNode) {
      const vName = cleanText(nameNode.innerText);
      const key = cleanCoords(coordNode.innerText.trim());
      map[key] = vName;
    }
  });
  return map;
}

function getActiveVillageName() {
  const activeNode =
    document.querySelector(".villageList .active .name") ||
    document.querySelector("#sidebarBoxVillagelist .active .name");
  return activeNode ? cleanText(activeNode.innerText) : "Village";
}

// Village views (dorf1/dorf2) render `.buildingList` only while something is
// being built. Once a fully loaded village view has no list, the queue is
// empty: every build finished early (gold "finish now"), was cancelled, or
// completed while the alarm was silenced.
function isVillageViewWithEmptyQueue() {
  const path = window.location.pathname;
  const isVillageView =
    (/^\/(dorf1\.php|resources)$/.test(path) && document.getElementById("resourceFieldContainer")) ||
    (/^\/(dorf2\.php|village)$/.test(path) && document.getElementById("villageContent"));
  return !!isVillageView && !document.querySelector(".buildingList");
}

function scanBuildings(activeVillage) {
  const buildingList = document.querySelector(".buildingList");
  if (!buildingList) {
    return isVillageViewWithEmptyQueue()
      ? { newBuildings: [], matchedIds: new Set() }
      : null;
  }
  const rows = buildingList.querySelectorAll("li, tr");
  const now = Date.now();
  const rawBuildings = [];
  let unreadableTimer = false;
  rows.forEach((row) => {
    const t = row.querySelector(".timer");
    // Master builder rows count down to "Start of construction" (waiting for
    // resources) inside .buildStart; they are not builds in progress.
    if (!t || row.classList.contains("masterBuilder") || t.closest(".buildStart")) return;
    // A timer without a numeric value used to become a 1.7 s "finished"
    // alarm. Skip the row, and skip cleanup below so its alarm survives.
    const seconds = parseInt(t.getAttribute("value"), 10);
    if (!Number.isFinite(seconds)) {
      unreadableTimer = true;
      return;
    }
    const txt = row.innerText;
    const match = txt.match(/(.*?)\s+Level\s+(\d+)/i);
    const bName = match
      ? cleanText(match[1])
      : cleanText(txt.split("Level")[0]);
    const bLevel = match ? match[2].trim() : "";
    const delayValue = seconds * 1000 + 1700;
    rawBuildings.push({
      bName,
      bLevel,
      baseName: `${bName} lvl ${bLevel} (${activeVillage}) ${serverTag}`,
      delay: delayValue,
      scheduledTime: now + delayValue,
    });
  });
  rawBuildings.sort((a, b) => a.scheduledTime - b.scheduledTime);
  const nameCounts = {};
  const processedBuildings = rawBuildings.map((b) => {
    if (!nameCounts[b.baseName]) nameCounts[b.baseName] = 0;
    nameCounts[b.baseName]++;
    let finalName = b.baseName;
    if (nameCounts[b.baseName] > 1)
      finalName = `${b.baseName} #${nameCounts[b.baseName]}`;
    return { ...b, name: finalName };
  });
  const newAlarms = [];
  const matchedIds = new Set();
  const usedAlarmIds = new Set();
  processedBuildings.forEach((pb) => {
    // Same-named builds finishing seconds apart (e.g. two Cranny lvl 1) all
    // fall inside the window; take the closest finish time, not the first
    // listed, so one build cannot claim the other's alarm and get it deleted.
    let bestMatch = null;
    let bestDiff = Infinity;
    currentAlarms.forEach((a) => {
      if (usedAlarmIds.has(a.id || a.name)) return;
      const timeDiff = Math.abs(a.scheduledTime - pb.scheduledTime);
      if (timeDiff > 20000 || timeDiff >= bestDiff) return;
      const looseStart = `${pb.bName} lvl `;
      const looseEnd = `(${activeVillage}) ${serverTag}`;
      if (
        a.name.startsWith(pb.baseName) ||
        (a.name.startsWith(looseStart) && a.name.includes(looseEnd))
      ) {
        bestMatch = a;
        bestDiff = timeDiff;
      }
    });
    if (bestMatch) {
      const uid = bestMatch.id || bestMatch.name;
      matchedIds.add(uid);
      usedAlarmIds.add(uid);
      if (bestMatch.name !== pb.name) {
        bestMatch.name = pb.name;
        api.runtime.sendMessage({
          type: "EDIT_ALARM",
          id: bestMatch.id,
          newName: pb.name,
        });
      }
    } else {
      newAlarms.push({ name: pb.name, delay: pb.delay });
    }
  });
  return { newBuildings: newAlarms, matchedIds: unreadableTimer ? null : matchedIds };
}

// Emojis used in non-building alarm types — skip these during building queue cleanup
const NON_BUILDING_EMOJIS = [
  "⚠️",
  "⚔️",
  "⭐",
  "🌾",
  "📦",
  "🪵",
  "🧱",
  "🔩",
  "🎓",
];

// Settler/Chieftain ("expansion units") training only appears on the
// Residence/Palace build page, inside `.trainExpansionUnits` — never on the
// troops training statistics page that fetchTrainingData() reads. Scan the
// on-page queue directly and emit a 🎓 alarm so it groups with the other
// training alarms in the popup. Uses customType "settler" (not "training") so
// the stats page's CLEAR_STALE_TRAINING can't wipe it.
function scanSettlerTraining(activeVillage) {
  const wrapper = document.querySelector(".trainExpansionUnits");
  if (!wrapper) return;

  const alarmName = `🎓 Settlers (${activeVillage}) ${serverTag}`;

  // Each queued batch row carries a cumulative .timer (seconds until that batch
  // finishes); the largest one is the whole queue's completion time.
  let maxSeconds = 0;
  wrapper.querySelectorAll("table.under_progress .timer").forEach((t) => {
    const s = parseInt(t.getAttribute("value"), 10) || 0;
    if (s > maxSeconds) maxSeconds = s;
  });

  if (maxSeconds > 0) {
    api.runtime.sendMessage({
      type: "REFRESH_ALARMS",
      buildings: [
        { name: alarmName, delay: maxSeconds * 1000, customType: "settler" },
      ],
    });
    return;
  }

  // Empty queue on this village's Residence/Palace → drop a stale future alarm
  // for this village only (can't see other villages from here). Leave already-
  // fired alarms for the user to dismiss, matching the training cleanup.
  const now = Date.now();
  const existing = currentAlarms.find((a) => a.name === alarmName);
  if (existing && existing.scheduledTime - now > 10000) {
    api.runtime.sendMessage({
      type: "DELETE_ALARM",
      id: existing.id,
      name: existing.name,
    });
  }
}

// Academy research and Smithy upgrades only show their queue on the building
// page itself (the Smithy statistics page has no timers), so scan on-page.
// customType "research" keeps CLEAR_STALE_TRAINING from wiping these alarms.
const RESEARCH_BUILDINGS = { 13: "Smithy", 22: "Academy" };

// One queued research row → "Legionnaire" (Academy) or "Legionnaire lvl 2"
// (Smithy, the level being upgraded to). Unit name comes from the unit icon's
// alt/title when present, else the row text with the level stripped.
function describeResearchRow(row, withLevel) {
  const desc = row.querySelector(".desc") || row.querySelector("td");
  if (!desc) return "";
  const img = desc.querySelector("img.unit, i.unit, [class*='unit u']");
  const text = cleanText(desc.textContent);
  const iconName = cleanText(img?.getAttribute("alt") || img?.getAttribute("title") || "");
  const name = (iconName || text.replace(/\(?\s*(level|lvl|stufe|niveau)?\s*\d+\s*\)?/gi, ""))
    .replace(/[()]/g, "")
    .trim();
  if (!name) return "";
  if (!withLevel) return name;
  const level = text.replace(iconName, "").match(/\d+/)?.[0];
  return level ? `${name} lvl ${level}` : name;
}

function scanResearch(activeVillage) {
  const build = document.querySelector("#build");
  const gid = build?.className.match(/\bgid(\d+)\b/)?.[1];
  const label = RESEARCH_BUILDINGS[gid];
  if (!label) return;

  let maxSeconds = 0;
  const units = [];
  build
    .querySelectorAll(".under_progress .timer, .underProgress .timer")
    .forEach((t) => {
      const s = parseInt(t.getAttribute("value"), 10) || 0;
      if (s <= 0) return;
      if (s > maxSeconds) maxSeconds = s;
      const row = t.closest("tr");
      const unit = row ? describeResearchRow(row, label === "Smithy") : "";
      if (unit && !units.includes(unit)) units.push(unit);
    });

  const prefix = `🎓 ${label}`;
  const suffix = `(${activeVillage}) ${serverTag}`;
  const alarmName = units.length
    ? `${prefix}: ${units.join(", ")} ${suffix}`
    : `${prefix} ${suffix}`;

  // Drop this village's older alarm for the same building when the queue
  // changed (different units) or emptied early (e.g. finished with gold).
  currentAlarms
    .filter(
      (a) =>
        a.name !== alarmName &&
        a.name.startsWith(prefix) &&
        a.name.endsWith(suffix) &&
        a.customType === "research" &&
        a.scheduledTime - Date.now() > 10000,
    )
    .forEach((a) =>
      api.runtime.sendMessage({ type: "DELETE_ALARM", id: a.id, name: a.name }),
    );

  if (maxSeconds > 0) {
    api.runtime.sendMessage({
      type: "REFRESH_ALARMS",
      buildings: [
        { name: alarmName, delay: maxSeconds * 1000, customType: "research" },
      ],
    });
  }
}

function handleQueueCleanup(matchedIds, activeVillage) {
  const now = Date.now();
  currentAlarms.forEach((a) => {
    if (NON_BUILDING_EMOJIS.some((e) => a.name.includes(e))) return;
    if (a.customType === "training" || a.customType === "storage") return;
    if (!a.name.includes(`(${activeVillage})`) || !a.name.includes(serverTag))
      return;
    if (matchedIds.has(a.id || a.name)) return;
    if (a.scheduledTime - now > 10000) {
      api.runtime.sendMessage({ type: "DELETE_ALARM", id: a.id, name: a.name });
    }
  });
}
