/**
 * clear-calc.js — Troops needed to clear the oasis open in the map tile dialog.
 *
 * Reads the animals the game already shows in #tileDetails and sizes each of
 * the tribe's enabled units with calculateOptimalTroopCount(), using the
 * panel's smithy levels, Tournament Square, hero and risk settings. Makes no
 * requests and fills no forms.
 */
(function () {
  const BIDI = /[​-‏‪-‮⁦-⁩]/g;
  let scheduled = false;

  function parseCoords(text) {
    const clean = String(text || "").replace(BIDI, "").replace(/[−–]/g, "-");
    const m = clean.match(/\(\s*(-?\d+)\s*\|\s*(-?\d+)\s*\)/);
    return m ? { x: parseInt(m[1], 10), y: parseInt(m[2], 10) } : null;
  }

  function readAnimals(table) {
    const animals = [];
    for (const row of table.querySelectorAll("tr")) {
      const icon = row.querySelector("td.ico .unit");
      const id = parseInt(icon?.className.match(/\bu(\d+)\b/)?.[1], 10);
      const count = parseInt(row.querySelector("td.val")?.textContent.replace(BIDI, "").replace(/\D/g, ""), 10);
      if (ANIMAL_STATS[id] && Number.isSafeInteger(count) && count > 0) animals.push({ id, count });
    }
    return animals;
  }


  function buildRows(oasis) {
    const tribe = TROOP_DATA[detectTribe()];
    if (!tribe) return null;
    const { cx, cy } = getCoords();
    const tsLvl = parseInt(document.getElementById("_vpts-lvl")?.value) || 0;
    const riskLevel = parseInt(document.getElementById("_vprisk")?.value) || 3;
    const hero = getHeroForTroops();
    const maxHp = hero ? (parseInt(document.getElementById("_vpmax-hp")?.value) || 100) - HERO_HP_BUFFER : null;
    const unit = selectedTroopUnit(tribe);
    if (!unit) return null;
    return [unit].map((unit) => {
        const smithyLvl = parseInt(document.getElementById(`_vpsmithy-${unit.id}`)?.value) || 0;
        const { count, reserve } = calculateOptimalTroopCount(oasis, unit, smithyLvl, cx, cy, tsLvl, hero, riskLevel, maxHp);
        const m = count == null ? null : calculateTroopMetrics(oasis, [{ unit, count, smithyLvl }], cx, cy, tsLvl, hero, riskLevel);
        return { unit, count, reserve, lost: m?.troopLossCount ?? 0 };
      });
  }

  function render(dialog, troopTable) {
    const coords = parseCoords(dialog.querySelector(".titleInHeader")?.textContent);
    const animals = readAnimals(troopTable);
    const settings = ["_vppreview-unit", "_vprisk", "_vptroop-hero", "_vpts-lvl"].map((id) => {
      const el = document.getElementById(id);
      return el?.type === "checkbox" ? el.checked : el?.value;
    });
    const state = JSON.stringify([coords, animals, settings, [...disabledUnits]]);
    const existing = dialog.querySelector("._vpclear");
    if (existing?.dataset.state === state) return;
    existing?.remove();
    if (!coords || !animals.length) return;

    const rows = buildRows({ x: coords.x, y: coords.y, animals });
    if (!rows?.length) return;

    const box = document.createElement("div");
    box.className = "_vpclear";
    box.dataset.state = state;
    const head = document.createElement("h4");
    head.textContent = getHeroForTroops() ? "Clear (with hero)" : "Clear";
    const table = document.createElement("table");
    table.className = "transparent _vpclear-table";
    const headRow = table.createTHead().insertRow();
    for (const label of ["", "Send", "Lost"]) {
      const th = document.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    }
    const body = table.createTBody();
    for (const r of rows) {
      const tr = body.insertRow();
      const icon = document.createElement("i");
      icon.className = "unit " + r.unit.id;
      icon.title = r.unit.name;
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", r.unit.name);
      tr.insertCell().appendChild(icon);
      const send = tr.insertCell();
      send.className = "_vpclear-count";
      send.textContent = r.count == null ? "—" : r.count.toLocaleString();
      if (r.reserve) send.title = `Includes ${r.reserve} reserve animals`;
      const lost = tr.insertCell();
      lost.textContent = r.lost ? "−" + r.lost : "0";
      if (r.lost) lost.className = "_vpclear-lost";
    }
    box.append(head, table);
    troopTable.after(box);
  }

  function check() {
    scheduled = false;
    const dialog = document.querySelector("#tileDetails.oasis");
    const troopTable = dialog?.querySelector("#troop_info");
    if (!troopTable) return;
    try {
      render(dialog, troopTable);
    } catch (err) {
      log("Clear calc: " + err.message);
    }
  }

  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(check);
  }).observe(document.body, { childList: true, subtree: true });
  // Re-size when the unit, risk, hero or smithy settings change in the panel.
  const onSettings = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(check);
  };
  document.addEventListener("change", onSettings, true);
  document.addEventListener("input", onSettings, true);
  check();
})();
