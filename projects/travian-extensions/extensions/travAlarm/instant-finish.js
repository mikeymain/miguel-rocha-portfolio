// ==========================================
// GOLD "COMPLETE IMMEDIATELY"
// ==========================================
// Confirming Travian's instant completion finishes every order listed in
// #finishNowDialog and reloads the page. Remove the matching future alarms
// when the player clicks the dialog's gold button, so they do not stay in the
// list until the queue is scanned again. The listener is passive (capture
// phase, never cancels or changes the click), so the page cannot observe it.
// If the completion fails anyway, the next village-view scan recreates the
// building alarms from the queue.

/** Alarms closer than this to firing are left alone, like the queue cleanup. */
const INSTANT_FINISH_MIN_LEAD_MS = 10000;

/** Parses "1,171" (with optional bidi marks) into 1171; NaN when unreadable. */
function parseGoldAmount(text) {
  const digits = String(text || "").replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : NaN;
}

/** Orders listed in the dialog as { name, level }; level is "" when absent. */
function readInstantFinishOrders(dialog) {
  return [...dialog.querySelectorAll("li")]
    .map((li) => {
      const lvlNode = li.querySelector(".lvl");
      const level = lvlNode ? (lvlNode.textContent.match(/\d+/) || [""])[0] : "";
      const nameNode = [...li.querySelectorAll("span")].find((s) => s !== lvlNode);
      const raw = (nameNode || li).textContent.replace(lvlNode?.textContent || "", "");
      return { name: raw.replace(/\s+/g, " ").trim(), level };
    })
    .filter((o) => o.name);
}

/**
 * Future alarms for this village that the listed orders complete. Pure, so it
 * is unit-tested: alarms are { id, name, customType, scheduledTime }.
 */
function alarmsFinishedByGold(alarms, orders, village, tag, now) {
  const suffix = `(${village}) ${tag}`;
  return alarms.filter((a) => {
    if (!a.name.endsWith(suffix) && !a.name.includes(`${suffix} #`)) return false;
    if (a.scheduledTime - now <= INSTANT_FINISH_MIN_LEAD_MS) return false;
    if (a.customType === "research") {
      return orders.some((o) => a.name.includes(o.name));
    }
    if (a.customType) return false;
    return orders.some(
      (o) => o.level && a.name.startsWith(`${o.name} lvl ${o.level} ${suffix}`),
    );
  });
}

function onInstantFinishClick(event) {
  const button = event.target.closest?.("#finishNowDialog .buttonWrapper button");
  if (!button || button.disabled || button.classList.contains("disabled")) return;
  const cost = parseGoldAmount(button.querySelector(".goldValue")?.textContent);
  const owned = parseGoldAmount(document.querySelector(".ajaxReplaceableGoldAmount")?.textContent);
  if (Number.isFinite(cost) && Number.isFinite(owned) && owned < cost) return;

  const orders = readInstantFinishOrders(button.closest("#finishNowDialog"));
  if (!orders.length) return;
  alarmsFinishedByGold(currentAlarms, orders, getActiveVillageName(), serverTag, Date.now())
    .forEach((a) => api.runtime.sendMessage({ type: "DELETE_ALARM", id: a.id, name: a.name }));
}

if (typeof document !== "undefined") {
  document.addEventListener("click", onInstantFinishClick, true);
}

if (typeof module !== "undefined") {
  module.exports = { parseGoldAmount, alarmsFinishedByGold };
}
