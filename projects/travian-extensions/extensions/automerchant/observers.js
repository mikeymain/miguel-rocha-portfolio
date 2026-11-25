/**
 * Travian NPC Resource Helper - Observers
 * MutationObservers for NPC dialog and market send.
 */
/* global NPC */

// ---- Resource Transfer Dialog Observer ----
// Watches Travian's native hero→village resource transfer dialog
// (`.resourceTransferDialog`) and injects two running totals:
//   - Needed: snapshot of the values Travian pre-fills when the dialog opens
//     (= deficit between village stock and the requested target threshold)
//   - Selected: live sum of whatever the user currently has typed in
// This lets the user see at a glance how their adjustments compare to the
// originally-requested pull without manually adding the four boxes.
NPC.TransferDialogObserver = {
  _injected: new WeakSet(),
  // Latest { target:[l,c,i,cr], ts } captured from openResourceTransfer by the
  // MAIN-world bridge (hero-bridge.js). Travian calls that with the full cost
  // just before the dialog renders, so this holds the real per-resource target
  // for whichever dialog is about to open — regardless of how it was opened.
  _lastTarget: null,

  _inject(dlg) {
    if (this._injected.has(dlg)) return;
    const names = ["lumber", "clay", "iron", "crop"];
    const inputs = names.map((n) => dlg.querySelector(`input[name="${n}"]`));
    if (inputs.some((i) => !i)) return;
    this._injected.add(dlg);

    // Per-resource target cost for this dialog, [lumber, clay, iron, crop],
    // captured from openResourceTransfer by the bridge (see _lastTarget). The
    // dialog's pre-filled boxes are only the *clamped* deficits
    // max(0, target_i - stock_i), which discard any surplus, so the real
    // targets can't be recovered from the DOM — we rely on the capture.
    const cap = this._lastTarget;
    this._lastTarget = null;
    const targets =
      cap && Array.isArray(cap.target) && Date.now() - cap.ts < 10000
        ? cap.target.map((v) => parseInt(v, 10) || 0)
        : null;

    // How much the hero needs to transfer in TOTAL, snapshotted once at
    // injection time so later edits to the inputs don't move the goalpost.
    //
    // For a gold NPC trade only the TOTAL volume matters: the merchant
    // redistributes the village's combined resources into any split, so a
    // surplus in one resource covers a deficit in another. When we know the
    // targets the real shortfall is
    //   max(0, sum(target) - sum(villageStock))   [stock from #l1..#l4,
    // the same source ui.js reads] — far less than summing Travian's clamped
    // per-resource deficits, which discards those surpluses. Without a
    // target we fall back to that clamped sum.
    const neededTotal = (() => {
      if (targets) {
        const targetTotal = targets.reduce((a, b) => a + b, 0);
        const stockTotal = [1, 2, 3, 4].reduce(
          (sum, n) =>
            sum +
            (NPC.Utils.parseNumber(
              document.querySelector("#l" + n)?.textContent,
            ) || 0),
          0,
        );
        return Math.max(0, targetTotal - stockTotal);
      }
      return inputs
        .map((i) => NPC.Utils.parseNumber(i.value) || 0)
        .reduce((a, b) => a + b, 0);
    })();

    const totalsEl = document.createElement("div");
    totalsEl.className = "_npc-transfer-totals";
    totalsEl.style.cssText =
      "display:flex;justify-content:space-between;gap:12px;" +
      "margin:8px 0;padding:6px 10px;" +
      "background:rgba(0,0,0,0.04);border-radius:4px;" +
      "font-size:13px;font-weight:400;" +
      "font-family:Arial,Helvetica,Verdana,sans-serif;";

    const fmt = (n) => NPC.Utils.formatNumber(n);
    // Match Travian's native pattern (.limit rows): labels regular (400),
    // numeric values bold (700), and use the dialog's native green.
    // Green once the transferred total covers the need — for an NPC trade
    // exceeding it is harmless, so there's no "too much" warning.
    // Re-rendered only when the selected total actually changes.
    let shown = null;
    const recompute = () => {
      targets?.forEach((target, i) => {
        const projected = inputs[i].closest(".resourceRow")
          ?.querySelector(".resourceRowHeader span.limit");
        if (!projected) return;
        const amount = NPC.Utils.parseNumber(projected.textContent);
        const met = String(/\d/.test(projected.textContent) && amount >= target);
        if (projected.dataset.npcTargetMet !== met) projected.dataset.npcTargetMet = met;
      });
      const sel = inputs.reduce(
        (sum, i) => sum + (NPC.Utils.parseNumber(i.value) || 0),
        0,
      );
      if (sel === shown) return;
      shown = sel;
      const color = sel >= neededTotal ? "#55d66b" : "#ff6b5f";
      totalsEl.innerHTML =
        `<span>Needed: <b>${fmt(neededTotal)}</b></span>` +
        `<span style="color:${color};">Selected: <b>${fmt(sel)}</b></span>`;
    };

    inputs.forEach((i) => {
      i.addEventListener("input", recompute);
      i.addEventListener("change", recompute);
      i.addEventListener("keyup", recompute);
    });
    // Travian's stepper/slider updates the input.value programmatically,
    // which does not fire input/change/keyup. Poll while the dialog is in
    // the DOM and stop as soon as it's removed.
    const poll = setInterval(() => {
      if (dlg.isConnected) recompute();
      else clearInterval(poll);
    }, 250);

    // Place totals just above the Transfer button (the .actionButton sits
    // after the four .resourceRow entries inside .contentV2). Falls back to
    // appending at the end of contentV2 if the layout ever changes.
    const content = dlg.querySelector(".contentV2") || dlg;
    const actionBtn = content.querySelector(".actionButton");
    if (actionBtn) {
      content.insertBefore(totalsEl, actionBtn);
    } else {
      content.appendChild(totalsEl);
    }

    // Surface the per-resource amount needed right after Travian's
    // "after-pull" number in each row header (.resourceRowHeader span.limit),
    // so the user can compare what they'll have against what each resource
    // needs. Generic inventory transfers have no target.
    if (targets) {
      inputs.forEach((inp, i) => {
        const row = inp.closest(".resourceRow");
        const projected = row?.querySelector(".resourceRowHeader span.limit");
        if (
          !projected ||
          projected.nextElementSibling?.classList.contains("_npc-need")
        ) {
          return;
        }
        const need = document.createElement("span");
        need.className = "_npc-need";
        need.textContent = `(${fmt(targets[i])})`;
        need.style.cssText = "font-weight:700;margin-inline-start:4px;white-space:nowrap;";
        projected.after(need);
      });
    }

    recompute();
  },
};

document.addEventListener("npc:transfer-target", ({ detail }) => {
  NPC.TransferDialogObserver._lastTarget = Array.isArray(detail)
    ? { target: detail, ts: Date.now() }
    : null;
});

// ---- NPC Dialog Observer ----
// The only body-wide observer in this extension. Each added element is tested
// once against a combined selector; the NPC and hero-transfer dialogs are only
// looked up on a hit.
NPC.NPCObserver = {
  _WATCH: "#npc, .exchangeResources, .resourceTransferDialog",

  start() {
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            (node.matches(this._WATCH) || node.querySelector(this._WATCH))
          ) {
            this._checkNode(node);
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
    this._checkNode(document.body);
    this._setupExchangeButtonListener();
  },

  _setupExchangeButtonListener() {
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest("button.exchange");
        if (!btn) return;
        const unitId = this._unitIdForExchangeButton(btn);
        if (!unitId) return;
        sessionStorage.setItem(
          NPC.STORAGE_KEYS.PENDING_TROOP,
          JSON.stringify({ unitId, time: Date.now() }),
        );
      },
      true,
    );
  },

  // Resolve which unit's "exchange" (NPC) button was clicked.
  //
  // The unit icon's `uN` class is the source of truth (tribe-detector reads it
  // the same way). We do NOT trust the row's `trooptN` class: the Residence/
  // Palace hardcodes the admin slot troopt9 and the settler slot troopt10 for
  // every tribe, so only Romans line up — an Egyptian settler row is troopt10
  // but the unit is really u60. Reading the icon is correct for barracks/stable/
  // workshop too, where the icon and `trooptN` always agree.
  _unitIdForExchangeButton(btn) {
    const scope =
      btn.closest(".action.troop") ||
      btn.closest("table.troop_details, tr, .troop, form");
    if (scope) {
      for (const el of scope.querySelectorAll('[class*="unit"]')) {
        if (typeof el.className !== "string") continue;
        const m = el.className.match(/\bu(\d{1,2})\b/);
        if (!m) continue;
        const id = Number(m[1]);
        // Playable unit ids only: 1-30 (Rom/Teu/Gaul), 51-80 (Egy/Hun/Spa).
        // 31-50 are Nature/Natars.
        if ((id >= 1 && id <= 30) || (id >= 51 && id <= 80)) return id;
      }
    }

    // Fallback: no unit icon found — derive from the `trooptN` class.
    const troopAction = btn.closest(".action.troop");
    if (troopAction) {
      const troopClass = Array.from(troopAction.classList).find((c) =>
        /^troopt\d+$/.test(c),
      );
      if (troopClass) {
        const id = parseInt(troopClass.replace("troopt", ""), 10);
        if (id) return id;
      }
    }
    return null;
  },

  _checkNode(node) {
    const transfer = node.matches(".resourceTransferDialog")
      ? [node]
      : node.querySelectorAll(".resourceTransferDialog");
    transfer.forEach((d) => NPC.TransferDialogObserver._inject(d));

    const npc =
      node.querySelector?.("#npc") ||
      (node.id === "npc" ? node : null) ||
      node.querySelector?.(".exchangeResources");
    if (npc && !document.querySelector("#_rh-ui")) {
      // Only render the menu when the NPC dialog was opened from a specific
      // troop row — i.e. the click handler in _setupExchangeButtonListener
      // captured a unit id into PENDING_TROOP. Any other NPC dialog (building
      // upgrade, generic marketplace NPC, etc.) leaves PENDING_TROOP empty
      // and we stay out of the way entirely.
      if (!this._hasFreshPendingTroop()) return;
      setTimeout(() => NPC.UIManager.createUI(), NPC._rand(80, 180));
    }
  },

  // Window after a troop-row "exchange" click during which we still trust
  // the captured unit id. 30s is generous — the page navigates almost
  // immediately. Stale entries are ignored so re-opening a non-troop NPC
  // dialog hours later doesn't accidentally re-trigger the menu.
  _PENDING_TROOP_TTL_MS: 30 * 1000,

  _hasFreshPendingTroop() {
    try {
      const raw = sessionStorage.getItem(NPC.STORAGE_KEYS.PENDING_TROOP);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.unitId) return false;
      if (Date.now() - (data.time || 0) > this._PENDING_TROOP_TTL_MS) {
        sessionStorage.removeItem(NPC.STORAGE_KEYS.PENDING_TROOP);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  },
};
