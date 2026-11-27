/**
 * FNPC - affordability maths (pure, no page writes)
 *
 * Moved from TravAlarm 3.75. Reads the page's own resource data and works out
 * when a village's total stock reaches a cost, so an NPC trade can then make
 * the exact mix.
 */

/**
 * Warehouse (wood/clay/iron) and granary (crop) capacity from the page's
 * stockBar, as [w, c, i, cr]. Missing values become Infinity (no cap).
 */
function readStorageCaps(doc = document) {
  const read = (sel) => {
    const el = doc.querySelector(`#stockBar ${sel} .capacity .value`);
    const v = el ? parseInt(el.textContent.replace(/\D/g, ""), 10) : NaN;
    return v > 0 ? v : Infinity;
  };
  const wh = read(".warehouse");
  return [wh, wh, wh, read(".granary")];
}

/**
 * The game's own resource data from the page's inline
 * `var resources = { production, storage, maxStorage }` script.
 * production.l4 is net crop. Returns { prod, caps } as [w, c, i, cr]
 * arrays, or null when the script is missing or malformed.
 */
function readPageResources(doc = document) {
  for (const s of doc.querySelectorAll("script:not([src])")) {
    const t = s.textContent;
    if (!t.includes("var resources")) continue;
    const block = (key) => {
      const m = t.match(new RegExp(`\\b${key}\\s*:\\s*(\\{[^}]*\\})`));
      if (!m) return null;
      try {
        const o = JSON.parse(m[1]);
        const v = ["l1", "l2", "l3", "l4"].map((k) => Number(o[k]));
        return v.every(Number.isFinite) ? v : null;
      } catch {
        return null;
      }
    };
    const prod = block("production");
    const caps = block("maxStorage");
    if (!prod) return null;
    return { prod, caps: caps?.every((c) => c > 0) ? caps : null };
  }
  return null;
}

/**
 * Hours until stock reaches costTotal, simulating each resource separately:
 * a resource stops growing at its storage cap and a negative one stops at 0.
 * Returns 0 if already affordable, Infinity if never reached.
 * @param {number[]} stock current amounts [w, c, i, cr]
 * @param {number[]} prod hourly production [w, c, i, cr]
 * @param {number[]} caps storage caps [w, c, i, cr]
 * @param {number} costTotal summed cost
 */
function npcEtaHours(stock, prod, caps, costTotal) {
  return npcEtaWithEvents(stock, prod, caps, costTotal, []);
}

/**
 * Grows `amt` in place for up to `horizon` hours, each resource stopping at
 * its cap or at 0. Returns the hour the total reaches costTotal, or null if
 * it does not within the horizon (with an Infinity horizon: never).
 */
function advanceNpcStock(amt, prod, caps, costTotal, horizon) {
  let t = 0;
  for (let step = 0; step <= amt.length + 1; step++) {
    const total = amt.reduce((a, b) => a + b, 0);
    if (total >= costTotal) return t;
    const active = prod.map(
      (p, i) => (p > 0 && amt[i] < caps[i]) || (p < 0 && amt[i] > 0),
    );
    const rate = prod.reduce((r, p, i) => r + (active[i] ? p : 0), 0);
    let dt = Infinity;
    prod.forEach((p, i) => {
      if (active[i]) dt = Math.min(dt, p > 0 ? (caps[i] - amt[i]) / p : amt[i] / -p);
    });
    const seg = Math.min(dt, horizon - t);
    const need = rate > 0 ? (costTotal - total) / rate : Infinity;
    if (need <= seg) return t + need;
    if (!isFinite(seg)) return null;
    prod.forEach((p, i) => {
      if (active[i]) amt[i] = Math.min(caps[i], Math.max(0, amt[i] + p * seg));
    });
    t += seg;
    if (t >= horizon) return null;
  }
  return null;
}

/**
 * Like npcEtaHours, plus resource deliveries (returning raids, incoming
 * merchants) that land at known times. Each delivery is added to its
 * resource and clamped to the storage cap; overflow is lost. An event with
 * `prod` adds that hourly income from its time on (now if already past).
 * @param {{inHours: number, res?: number[], prod?: number[]}[]} events deliveries; past `res` ones are ignored
 */
function npcEtaWithEvents(stock, prod, caps, costTotal, events) {
  const amt = stock.map((v, i) => Math.min(Math.max(v, 0), caps[i]));
  let rate = [...prod];
  const addProd = (e) => {
    if (!Array.isArray(e.prod)) return;
    rate = rate.map((p, i) => p + (Number.isFinite(e.prod[i]) ? e.prod[i] : 0));
  };
  events.filter((e) => !(e.inHours > 0)).forEach(addProd);
  const upcoming = events
    .filter((e) => e.inHours > 0 && (Array.isArray(e.res) || Array.isArray(e.prod)))
    .sort((a, b) => a.inHours - b.inHours);
  let t = 0;
  for (const e of upcoming) {
    const hit = advanceNpcStock(amt, rate, caps, costTotal, e.inHours - t);
    if (hit !== null) return t + hit;
    t = e.inHours;
    (e.res || []).forEach((r, i) => {
      if (Number.isFinite(r) && r > 0) amt[i] = Math.min(caps[i], amt[i] + r);
    });
    addProd(e);
  }
  const hit = advanceNpcStock(amt, rate, caps, costTotal, Infinity);
  return hit === null ? Infinity : t + hit;
}

/**
 * Time left as "2h 15m" or "45m", rounded up to the minute so it never
 * shows less time than remains.
 * @param {number} ms milliseconds left
 */
function formatNpcCountdown(ms) {
  const mins = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

function getResourceValue(wrapper, typePrefix) {
  const icon = wrapper.querySelector(`.${typePrefix}, .${typePrefix}Big`);
  if (!icon) return 0;
  const valueSpan = icon.parentElement?.querySelector(".value");
  if (valueSpan) {
    return parseInt(valueSpan.textContent.replace(/\D/g, "") || "0");
  }
  return 0;
}

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
