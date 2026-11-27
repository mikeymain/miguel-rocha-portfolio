/**
 * FNPC - when a cost becomes affordable with an NPC trade
 *
 * Adds "FNPC: HH:MM · countdown" next to build, upgrade and training costs
 * the village cannot pay yet. Uses the page's own production and storage
 * caps (fnpc-sim.js) plus returning raids, incoming merchants and the
 * village's raid income (fnpc-deliveries.js).
 *
 * Moved from TravAlarm 3.75.
 */

const FNPC_LABEL_CLASS = "_npc-fnpc";
const FNPC_MSG_STYLE =
  "display: inline-block; font-family: Arial, Helvetica, Verdana, sans-serif; font-size: 12px; color: #777777; font-weight: bold; margin-left: 10px; white-space: nowrap;";
const FNPC_SCAN_DEBOUNCE_MS = 300;

/** Current stock [w, c, i, cr] from the stock bar. */
function readStock() {
  return ["l1", "l2", "l3", "l4"].map((id) =>
    parseInt(document.getElementById(id)?.textContent.replace(/\D/g, "") || "0", 10),
  );
}

/** Cost boxes on the page, without dialogs, the simulator and troop movements. */
function findCostWrappers() {
  const url = window.location.href.toLowerCase();
  if (url.includes("report") || url.includes("berichte.php")) return [];
  return Array.from(
    document.querySelectorAll(".resourceWrapper, .contractCosts, .showCosts"),
  ).filter((el) => !el.closest(".dialog, #combatSimulator, table.troop_details"));
}

/** Label text and done-at time for one cost, or null when it is affordable. */
function fnpcMessage(cost, stock, page) {
  const costTotal = cost.reduce((a, b) => a + b, 0);
  if (costTotal === 0 || stock.reduce((a, b) => a + b, 0) >= costTotal) return null;
  const caps = page.caps ?? readStorageCaps();
  if (cost.some((c, i) => c > caps[i])) return { msg: "NPC: Storage too small", doneAt: 0 };
  const raidIncome = raidIncomeEvent();
  const events = raidIncome ? [...upcomingDeliveries(), raidIncome] : upcomingDeliveries();
  const hours = npcEtaWithEvents(stock, page.prod, caps, costTotal, events);
  if (!isFinite(hours)) return { msg: "NPC: Negative Prod", doneAt: 0 };
  // Round up to the minute: HH:MM must not show a time before it's affordable.
  const doneAt = Math.ceil((Date.now() + hours * 3600000) / 60000) * 60000;
  return { msg: `FNPC: ${npcClockText(doneAt)}`, doneAt };
}

function scanFnpc() {
  const wrappers = findCostWrappers();
  if (wrappers.length === 0) return;
  const page = readPageResources();
  const stock = readStock();
  let showsNpcTime = false;
  wrappers.forEach((wrapper) => {
    const cost = ["r1", "r2", "r3", "r4"].map((r) => getResourceValue(wrapper, r));
    const result = page ? fnpcMessage(cost, stock, page) : null;
    if (!result) {
      removeNpcLabel(wrapper);
      return;
    }
    if (result.doneAt) showsNpcTime = true;
    setNpcLabel(wrapper, result.msg, result.doneAt);
  });
  // Deliveries only change an FNPC time, so they are fetched only when one is shown.
  if (showsNpcTime) fetchDeliveries();
}

// Each cost box keeps one label. Text changes go through the label's text
// node (characterData), which the page observer does not watch.
const npcLabels = new WeakMap();
const liveNpcLabels = new Set();

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

function createInlineLabel() {
  const span = document.createElement("span");
  span.className = FNPC_LABEL_CLASS;
  span.style.cssText = FNPC_MSG_STYLE;
  return span;
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
    if (sibling.classList.contains("errorMessage") || sibling.classList.contains("infoMessage")) {
      infoNode = sibling;
    } else if (sibling.querySelector) {
      infoNode = sibling.querySelector(".errorMessage, .infoMessage");
    }
  }

  // Drop orphaned labels here; labels owned by other cost boxes stay.
  const target = durationNode || wrapper;
  const owned = new Set([...liveNpcLabels].map((label) => label.el));
  (infoNode || target?.parentNode)
    ?.querySelectorAll(`.${FNPC_LABEL_CLASS}`)
    .forEach((el) => owned.has(el) || el.remove());

  if (infoNode) {
    const span = createInlineLabel();
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
    const span = createInlineLabel();
    errorMsg.appendChild(span);
    return span;
  }
  const div = document.createElement("div");
  div.className = FNPC_LABEL_CLASS;
  target.parentNode.insertBefore(div, target.nextSibling);
  return div;
}

/** True when every node a mutation added or removed is an FNPC label. */
const isOwnLabelMutation = (m) =>
  [...m.addedNodes, ...m.removedNodes].every(
    (n) => n.nodeType === 1 && n.classList.contains(FNPC_LABEL_CLASS),
  );

function scanFnpcPage() {
  try {
    scanDeliveries();
  } catch {
    /* page parse errors are non-critical */
  }
  scanFnpc();
}

function startFnpc() {
  scanFnpcPage();

  // Countdowns show whole minutes: tick each second, skip while hidden.
  const tick = () => {
    if (!document.hidden) refreshNpcCountdowns();
    setTimeout(tick, 1005 - (Date.now() % 1000));
  };
  tick();

  // Re-scan after the page changes, at most every 300ms. Label inserts are
  // ignored so a scan does not trigger the next one.
  let scanTimer = 0;
  new MutationObserver((mutations) => {
    if (scanTimer || mutations.every(isOwnLabelMutation)) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      scanFnpcPage();
    }, FNPC_SCAN_DEBOUNCE_MS);
  }).observe(document.body, { childList: true, subtree: true });
}

deliveriesReady.then(startFnpc).catch(() => {});
