/**
 * analyzer.js — Tile processing and result rendering
 */

function analyzeTiles(tiles) {
  let dbUpdated = false;
  const newBonuses = {};
  // Update mode: only refresh animal data for oases already in the DB.
  // Discovery mode: add every newly-seen oasis to the DB.
  const scanMode = document.getElementById("_vpmode")?.value || "GRID";
  const updateOnly = scanMode === "DB";

  // Deferred server type detection: if still unknown, check scanned tiles
  // for players with tribeId > 3 (map API includes tribe data per tile)
  if (!detectedServerType) {
    for (const tile of tiles) {
      const tid = tile?.tribeId || tile?.tribe;
      if ([6, 7, 8].includes(Number(tid))) {
        detectedServerType = parseInt(tid) >= 8 ? "6-tribe" : "5-tribe";
        TROOP_DATA = TROOP_DATA_REBALANCED;
        updateServerTypeBadge();
        break;
      }
    }
  }

  // try/finally: a tile that throws must not skip saving and rendering the
  // tiles already processed (they are already counted as covered).
  try {
  tiles.forEach((tile) => {
    if (!tile?.position || !("text" in tile || "t" in tile || "title" in tile)) return;
    if (tile.position.x === null || tile.position.y === null ||
        String(tile.position.x).trim() === "" || String(tile.position.y).trim() === "") return;
    let rawX = Number(tile.position.x);
    let rawY = Number(tile.position.y);
    if (!Number.isSafeInteger(rawX) || !Number.isSafeInteger(rawY)) return;

    let normX = rawX,
      normY = rawY;
    const limit = Math.floor(MAP_SIZE / 2);
    normX = ((normX + limit) % MAP_SIZE + MAP_SIZE) % MAP_SIZE - limit;
    normY = ((normY + limit) % MAP_SIZE + MAP_SIZE) % MAP_SIZE - limit;

    const key = `${normX}|${normY}`;

    // Record this exact observed coordinate, independent of zoom.
    _markCovered(normX, normY);

    if (!scannedKeys.has(key)) scannedKeys.add(key);

    const observation = inspectOasisTile(tile);
    if (!observation.isOasis) return;

    // Recorded for every oasis seen, in either mode — farmlist.js labels
    // farm-list targets from these.
    const bonus = parseOasisBonus(tile);
    if (bonus && oasisBonuses.get(key) !== bonus) {
      oasisBonuses.set(key, bonus);
      newBonuses[key] = bonus;
    }

    // In Update mode, skip oases that aren't already in the DB — the user
    // only wants to refresh animal data for previously-discovered oases.
    if (updateOnly && !knownOases.has(key)) return;

    if (!knownOases.has(key)) {
      knownOases.add(key);
      dbUpdated = true;
    }

    if (observation.status === "occupied" || observation.status === "empty") {
      resolvedOases.add(key);
      sessionScannedOases.add(key);
      resultsMap.delete(key);
      return;
    }
    if (observation.status === "unknown") {
      const previous = resultsMap.get(key);
      if (previous) previous.observationIncomplete = true;
      return;
    }
    resolvedOases.add(key);
    sessionScannedOases.add(key);
    resultsMap.set(key, { x: normX, y: normY, animals: observation.animals, scannedAt: Date.now() });
  });
  } finally {
    if (dbUpdated) saveDatabase();
    if (Object.keys(newBonuses).length) saveOasisBonuses(newBonuses);
    saveScanData();
    _debouncedRender();
  }
}

let _renderTimer = 0;
function _debouncedRender() {
  clearTimeout(_renderTimer);
  _renderTimer = setTimeout(renderResults, 50);
}

// Hero counts as cavalry only when a horse is equipped (synced from the hero
// screen; defaults to mounted, matching the old single-def behaviour).
function heroIsMounted() {
  return document.getElementById("_vphero-mounted")?.value !== "0";
}

function calculateMetrics(oasis, s) {
  const dx = torusDelta(oasis.x, s.cx);
  const dy = torusDelta(oasis.y, s.cy);
  const dist = Math.sqrt(dx * dx + dy * dy);

  const finalDef = oasisDefense(oasis.animals, heroIsMounted() ? 1 : 0);
  const heroOff = Math.max(1, s.heroOff);
  const isHeroStronger = heroOff > finalDef;
  const ratio = isHeroStronger ? finalDef / heroOff : heroOff / finalDef;
  const L = Math.pow(ratio, 1.5);
  const NKP = isHeroStronger ? 1 / (1 + L) : L / (1 + L);

  let realizedRes = 0,
    realizedXP = 0;
  oasis.animals.forEach((u) => {
    const stats = ANIMAL_STATS[u.id];
    const killed = Math.round(u.count * NKP);
    realizedRes += stats.res * killed;
    realizedXP += stats.xp * killed;
  });

  let hpLoss = isHeroStronger ? (100 * L) / (1 + L) : 100 * (1 - L / (1 + L));
  hpLoss = Math.max(0, Math.min(100, hpLoss - s.dmgRed));

  let timeHours = 0;
  if (dist <= 20) timeHours = dist / s.speed;
  else timeHours = 20 / s.speed + (dist - 20) / (s.speed * (1 + 0.1 * s.tsLvl));

  const oneWayMinutes = Math.max(1, Math.round(timeHours * 60));

  const mapTier = parseInt(document.getElementById("_vphero-map")?.value) || 0;
  const mapReturnBonus = [0, 0.3, 0.4, 0.5][mapTier] ?? 0;
  const returnMinutes = Math.round(timeHours * 60 * (1 - mapReturnBonus));
  const roundTripMinutes = Math.max(1, oneWayMinutes + returnMinutes);
  const rpm = realizedRes / roundTripMinutes;

  // Resources per HP point spent
  const resPerHp = hpLoss > 1 ? Math.round(realizedRes / hpLoss) : realizedRes;

  // Risk-adjusted RPM scoring
  const risk = getRiskThresholds(s.riskLevel);
  const safetyMul =
    hpLoss > 1 ? 1 / (1 + Math.pow(hpLoss / risk.hp, RISK_STEEPNESS)) : 1.0;
  const safeRpm = rpm * safetyMul;
  const rawScore = Math.pow(safeRpm, 0.8) * Math.pow(realizedXP + 1, 0.2);

  return {
    dist: dist.toFixed(1),
    res: realizedRes,
    rpm: rpm,
    xp: realizedXP,
    hp: hpLoss.toFixed(0),
    time: (timeHours * 60).toFixed(1),
    resPerHp: resPerHp,
    rawScore: rawScore,
    score: 0,
  };
}

const _serverSpeed = (() => {
  const speedMatch = window.location.hostname.match(/\.x(\d+)\./);
  const rawSpeed = speedMatch ? parseInt(speedMatch[1]) : 1;
  // Travian Troop Speed Logic:
  // 1x -> 1x, 2-5x -> 2x, 10x -> 4x
  if (rawSpeed >= 2 && rawSpeed <= 5) return 2;
  if (rawSpeed == 10) return 4;
  return rawSpeed;
})();

function troopAttack(unit, level) {
  const upkeep = { u5: 3, u6: 4, u16: 3, u26: 3, u56: 3, u66: 3, u76: 3 }[unit.id] || (unit.cav ? 2 : 1);
  return unit.atk + (unit.atk + 300 * upkeep / 7) * (1.007 ** Math.min(20, Math.max(0, level || 0)) - 1);
}

function marchHours(dist, speed, tsLvl) {
  return (Math.min(20, dist) + Math.max(0, dist - 20) / (1 + 0.1 * tsLvl)) / speed;
}

// Raid result: the winner loses x/(1+x) of each unit type, x = (def/att)^1.5.
// Kills and losses round separately for each animal stack and unit type.
function raidOutcome(animals, troopUnits, hero) {
  let infAtk = 0,
    cavAtk = 0;
  troopUnits.forEach(({ unit, count, smithyLvl }) => {
    const atk = troopAttack(unit, smithyLvl) * count;
    if (unit.cav) cavAtk += atk;
    else infAtk += atk;
  });
  if (hero) {
    if (hero.mounted) cavAtk += hero.off;
    else infAtk += hero.off;
  }
  const totalAtk = infAtk + cavAtk;
  if (!(totalAtk > 0)) return null;
  const def = oasisDefense(animals, cavAtk / totalAtk);
  const won = totalAtk > def;
  const x = Math.pow(won ? def / totalAtk : totalAtk / def, 1.5);
  const killFrac = won ? 1 / (1 + x) : x / (1 + x);
  const lossFrac = won ? x / (1 + x) : 1 / (1 + x);
  let remaining = 0,
    res = 0,
    xp = 0;
  animals.forEach(({ id, count }) => {
    const killed = Math.round(count * killFrac);
    remaining += count - killed;
    res += ANIMAL_STATS[id].res * killed;
    xp += ANIMAL_STATS[id].xp * killed;
  });
  const losses = troopUnits.map(({ count }) => Math.round(count * lossFrac));
  let lostRes = 0;
  troopUnits.forEach(({ unit }, i) => (lostRes += losses[i] * TROOP_UNIT_COST(unit.cost)));
  const heroHpLoss = hero
    ? Math.max(0, Math.min(100, Math.round(lossFrac * 100 - (hero.dmgRed || 0))))
    : null;
  return {
    won,
    remaining,
    res,
    xp,
    losses,
    lostRes,
    lostCount: losses.reduce((a, b) => a + b, 0),
    heroHpLoss,
  };
}

function teamMarchHours(troopUnits, hero, dist, tsLvl) {
  const speeds = troopUnits
    .filter(({ count }) => count > 0)
    .map(({ unit }) => unit.spd * _serverSpeed);
  if (hero) speeds.push(hero.speed);
  return marchHours(dist, speeds.length > 0 ? Math.min(...speeds) : 1, tsLvl);
}

function calculateTroopMetrics(
  oasis,
  troopUnits,
  cx,
  cy,
  tsLvl,
  hero,
  riskLevel,
) {
  const dist = Math.hypot(torusDelta(oasis.x, cx), torusDelta(oasis.y, cy));
  const outcome = raidOutcome(oasis.animals, troopUnits, hero);
  if (!outcome) return null;
  const {
    res: oasisRes,
    xp: oasisXP,
    lostRes: troopLossRes,
    lostCount: troopLossCount,
    remaining,
    heroHpLoss,
  } = outcome;

  const netRes = oasisRes - troopLossRes;

  const timeHours = teamMarchHours(troopUnits, hero, dist, tsLvl);

  const oneWayMinutes = Math.max(1, Math.round(timeHours * 60));
  const roundTripMinutes = Math.max(1, oneWayMinutes * 2);
  const rpm = netRes / roundTripMinutes;

  // Net profit per resource lost in troops
  const resPerLoss = troopLossRes > 0 ? netRes / troopLossRes : netRes;

  // Risk-adjusted RPM scoring
  const risk = getRiskThresholds(riskLevel);
  let rawScore;
  if (netRes <= 0) {
    rawScore = 0;
  } else {
    const lossRatio = oasisRes > 0 ? troopLossRes / oasisRes : 1;
    const troopSafetyMul =
      1 / (1 + Math.pow(lossRatio / risk.loss, RISK_STEEPNESS));
    let heroHpMul = 1.0;
    if (heroHpLoss != null && heroHpLoss > 1) {
      heroHpMul = 1 / (1 + Math.pow(heroHpLoss / risk.hp, RISK_STEEPNESS));
    }
    rawScore = rpm * troopSafetyMul * heroHpMul;
  }

  return {
    dist: dist.toFixed(1),
    oasisRes,
    oasisXP,
    troopLossRes,
    troopLossCount,
    remaining,
    heroHpLoss,
    netRes,
    rpm,
    resPerLoss,
    time: (timeHours * 60).toFixed(1),
    rawScore: rawScore,
    score: 0,
  };
}

function getScoreClass(score) {
  // Score tiers drive both the badge color and the row's 3px left-border rail.
  if (score >= 130) return "_vpscore-great";
  if (score >= 90) return "_vpscore-good";
  if (score >= 60) return "_vpscore-mid";
  return "_vpscore-low";
}

// Garrison chips for the detail drawer (from each oasis's `animals`)
function _garrisonChips(animals) {
  if (!animals || !animals.length) return '<span class="_vpchip">—</span>';
  return animals
    .map(
      (a) =>
        `<span class="_vpchip"><b>${escapeHTML(String(a.count))}</b> ${escapeHTML(ANIMAL_STATS[a.id]?.name || String(a.id))}</span>`,
    )
    .join("");
}

// Shared result-row shell. `meta` and `stats` are pre-built HTML strings; the
// detail drawer markup is always emitted and revealed by CSS only in detail mode.
function _resultRowHTML(p) {
  return `
            <div class="_vpresult-row ${p.scoreClass}">
                <div class="_vpresult-line">
                    <div class="_vpresult-body">
                        <div class="_vpresult-primary">
                            <span class="_vpresult-value">${p.value}</span>
                            <span class="_vpresult-unit">${p.unit}</span>
                        </div>
                        <div class="_vpresult-meta">${p.meta}</div>
                    </div>
                    <span class="_vpscore-badge" title="Hero XP" aria-label="${p.score} hero XP">${p.score}</span>
                    ${p.rallyHref ? `<a href="${p.rallyHref}" class="_vpresult-link _vprally-go" target="_blank"${p.rallyAttrs || ""}>${p.rallyLabel}</a>` : `<span class="_vphp-mid">${p.rallyLabel}</span>`}
                </div>
                <div class="_vpresult-drawer">
                    <div class="_vpdrawer-chips">${p.chips}</div>
                    <div class="_vpdrawer-stats">${p.stats}</div>
                </div>
            </div>`;
}

// Coord (map-go) link + rpm/dist/time + a tab-specific safety field
function _metaHTML(o, safetyHTML) {
  const age = getObservationAge(o);
  return (
    `<a href="${location.pathname.includes("karte") ? "/karte.php" : "/map"}?x=${o.x}&y=${o.y}" class="_vpresult-link _vpmap-go">(${o.x}|${o.y})</a>` +
    `<span class="_vpmeta-rpm">${escapeHTML(o.rpm.toFixed(0))}/m</span>` +
    `<span class="_vpmeta-dist">${escapeHTML(o.dist)}◇</span>` +
    `<span class="_vpmeta-time">${escapeHTML(o.time)}m</span>` +
    safetyHTML +
    `<span class="_vpage ${age.stale ? "_vphp-mid" : "_vphp-ok"}" data-scanned-at="${Number(o.scannedAt) || 0}" data-incomplete="${o.observationIncomplete ? 1 : 0}" title="${o.observationIncomplete ? "Latest read was incomplete; showing last known animals" : "Animal counts can change; check the target before sending"}">${escapeHTML(age.label)}</span>`
  );
}

function _countLineHTML(targets, shown) {
  return `<div class="_vpcount-line"><span class="_vpcount-targets">${escapeHTML(String(targets))} targets in range</span><span class="_vpcount-avail">${escapeHTML(String(shown))} available</span></div>`;
}

function getSourceMap(_scanMode) {
  const now = Date.now();
  // Hide unknown-age and incomplete readings; retain their saved history.
  return new Map([...resultsMap].filter(([, o]) =>
    !o.observationIncomplete && Number.isFinite(o.scannedAt) && o.scannedAt > 0 && o.scannedAt <= now,
  ));
}

function TROOP_UNIT_COST(cost) {
  return cost.reduce((s, v) => s + v, 0);
}

function renderResults() {
  if (!document.getElementById("_vpresults-container")) return;
  updateHeroSummary();
  const activeTab =
    document.querySelector("._vptab.active")?.dataset.tab || "hero";
  if (activeTab === "troops") {
    renderTroopTab();
  } else {
    renderHeroTab();
  }
}

function getSelectedVillageDid() {
  const sel = document.getElementById("_vpvillage-select");
  if (!sel) return "";
  const opt = sel.options[sel.selectedIndex];
  return (opt && opt.dataset.did) || "";
}

// Shared radius check for key-based sets ("x|y" strings)
function _countKeysInRadius(set, cx, cy, radius) {
  const r2 = radius * radius;
  let count = 0;
  set.forEach((key) => {
    const sep = key.indexOf("|");
    const dx = torusDelta(+key.substring(0, sep), cx);
    const dy = torusDelta(+key.substring(sep + 1), cy);
    if (dx * dx + dy * dy <= r2) count++;
  });
  return count;
}

function countKnownOasesInRadius(cx, cy, radius) {
  const datedResults = getSourceMap();
  // Unknown-age history is hidden from progress as well as target lists.
  // Confirmed empty/occupied oases still count as successful updates.
  const eligible = new Set([...knownOases].filter(key =>
    datedResults.has(key) || (sessionScannedOases.has(key) && !resultsMap.get(key)?.observationIncomplete),
  ));
  return _countKeysInRadius(eligible, cx, cy, radius);
}

function countSessionOasesInRadius(cx, cy, radius) {
  const eligible = new Set([...sessionScannedOases].filter(key =>
    knownOases.has(key) && !resultsMap.get(key)?.observationIncomplete,
  ));
  return _countKeysInRadius(eligible, cx, cy, radius);
}

function countScannedTilesInRadius(cx, cy, radius) {
  return _countKeysInRadius(scannedKeys, cx, cy, radius);
}

// Cache total tiles per radius — deterministic for a given radius
const _totalTilesCache = new Map();
function countTotalTilesInRadius(radius) {
  if (_totalTilesCache.has(radius)) return _totalTilesCache.get(radius);
  const r2 = radius * radius;
  let count = 0;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (dx * dx + dy * dy <= r2) count++;
    }
  }
  _totalTilesCache.set(radius, count);
  return count;
}

function countResultsInRadius(cx, cy, radius) {
  const r2 = radius * radius;
  let count = 0;
  getSourceMap().forEach((o) => {
    const dx = torusDelta(o.x, cx);
    const dy = torusDelta(o.y, cy);
    if (dx * dx + dy * dy <= r2) count++;
  });
  return count;
}

function renderHeroTab() {
  const { cx, cy } = getCoords();
  const settings = {
    cx,
    cy,
    radius: parseInt(document.getElementById("_vpradius").value) || 25,
    heroOff: parseInt(document.getElementById("_vphero-off").value) || 1000,
    dmgRed: parseInt(document.getElementById("_vpdmg-red").value) || 0,
    maxHp:
      (parseInt(document.getElementById("_vpmax-hp").value) || 100) -
      HERO_HP_BUFFER,
    tsLvl: parseInt(document.getElementById("_vpts-lvl").value) || 0,
    speed: parseInt(document.getElementById("_vpspeed").value) || 7,
    riskLevel: parseInt(document.getElementById("_vprisk")?.value) || 3,
  };

  const sortMode = document.getElementById("_vpsort-order").value || "score";
  const scanMode = document.getElementById("_vpmode")?.value || "GRID";

  const source = getSourceMap(scanMode);
  const list = [];
  source.forEach((o) => {
    const m = calculateMetrics(o, settings);
    const inRadius = parseFloat(m.dist) <= settings.radius;
    const validHp = parseInt(m.hp) <= settings.maxHp;
    if (inRadius && validHp) {
      list.push({ ...o, ...m });
    }
  });

  list.sort((a, b) => {
    switch (sortMode) {
      case "dist":
        return parseFloat(a.dist) - parseFloat(b.dist);
      case "res":
        return b.res - a.res;
      case "rpm":
        return b.rpm - a.rpm;
      case "reshp":
        return b.resPerHp - a.resPerHp;
      case "combined":
      default:
        return b.rawScore - a.rawScore;
    }
  });

  const container = document.getElementById("_vpresults-container");
  const knownInRadius = countKnownOasesInRadius(
    settings.cx,
    settings.cy,
    settings.radius,
  );

  const animalsInRadius = countResultsInRadius(
    settings.cx,
    settings.cy,
    settings.radius,
  );

  if (list.length === 0) {
    if (knownInRadius === 0) {
      container.innerHTML =
        '<div class="_vpresults-empty">No oases found yet…</div>';
    } else {
      container.innerHTML = _countLineHTML(animalsInRadius, 0);
    }
    return;
  }

  const halfMap = (MAP_SIZE - 1) / 2;
  const villageDid = getSelectedVillageDid();
  const topList = list.slice(0, 20);
  let html = _countLineHTML(animalsInRadius, topList.length);
  topList.forEach((o) => {
    const hpCls = hpClass(parseInt(o.hp));
    const scoreClass = getScoreClass(o.rawScore);
    const targetMapId = (-o.y + halfMap) * MAP_SIZE + (o.x + halfMap) + 1;
    const didParam = villageDid ? `&newdid=${villageDid}` : "";
    const meta = _metaHTML(
      o,
      `<span class="${hpCls}">−${escapeHTML(o.hp)}% hp</span>`,
    );
    const stats =
      `<span>score <b class="_vpresult-xp">${escapeHTML(String(o.rawScore.toFixed(0)))}</b></span>` +
      `<span>xp <b class="_vpresult-xp">${escapeHTML(String(o.xp))}</b></span>` +
      `<span>res/hp <b style="color:#cfd3d8">${escapeHTML(String(o.resPerHp))}</b></span>`;
    html += _resultRowHTML({
      scoreClass,
      value: `+${escapeHTML(o.res.toLocaleString())}`,
      unit: "res",
      meta,
      score: escapeHTML(String(o.xp)),
      rallyHref: `/build.php?gid=16&tt=2&eventType=4&targetMapId=${targetMapId}${didParam}`,
      rallyLabel: "Send",
      chips: _garrisonChips(o.animals),
      stats,
    });
  });

  container.innerHTML = html;

  const rk = rallyKey();
  container.querySelectorAll("._vprally-go").forEach((a) => {
    a.addEventListener("click", () => {
      sessionStorage.setItem(
        rk,
        JSON.stringify({ hero: true, ts: Date.now() }),
      );
    });
  });
}

// Animals expected on arrival: the observed garrison plus the risk level's
// reserve, spread over the observed species in proportion to their counts.
// The reserve never exceeds the observed total (the garrison at most doubles).
function arrivalAnimals(oasis, risk, tripMinutes) {
  const scannedAt = Number(oasis.scannedAt);
  const ageMinutes = scannedAt > 0 ? Math.max(0, Date.now() - scannedAt) / 60000 : 0;
  const window = Math.min(RESERVE_WINDOW_CAP_MINUTES, tripMinutes + ageMinutes);
  const observed = oasis.animals.reduce((sum, a) => sum + a.count, 0);
  const reserve = Math.min(
    observed,
    (Number.isFinite(risk.reserveEvery) ? Math.ceil(window / risk.reserveEvery) : 0) +
      (risk.drift || 0),
  );
  if (!reserve) return { animals: oasis.animals, reserve: 0 };
  // Largest-remainder split; ties go to the stronger animal.
  const shares = oasis.animals.map((a, i) => {
    const exact = (reserve * a.count) / observed;
    const s = ANIMAL_STATS[a.id];
    return { i, add: Math.floor(exact), rest: exact - Math.floor(exact), def: s.defI + s.defC };
  });
  let left = reserve - shares.reduce((sum, x) => sum + x.add, 0);
  [...shares]
    .sort((a, b) => b.rest - a.rest || b.def - a.def)
    .forEach((x) => {
      if (left > 0) {
        x.add++;
        left--;
      }
    });
  return {
    animals: oasis.animals.map((a, i) => ({ id: a.id, count: a.count + shares[i].add })),
    reserve,
  };
}

// Cleared, every unit type within the risk level's loss cap, hero within maxHp.
function meetsRisk(outcome, troopUnits, risk, maxHp) {
  if (!outcome || !outcome.won || outcome.remaining > 0) return false;
  if (maxHp != null && outcome.heroHpLoss != null && outcome.heroHpLoss > maxHp)
    return false;
  return troopUnits.every(({ count }, i) =>
    risk.lossCap == null
      ? outcome.losses[i] < count
      : outcome.losses[i] <= Math.floor(count * risk.lossCap),
  );
}

const MAX_TEAM_SCALE = 1 << 20;

// Smallest k >= 1 for which k x the team clears the arrival garrison within
// the risk level. Returns null when no animals are known or the team has no
// attack; scale is null when no k up to MAX_TEAM_SCALE fits.
function minimumScale(oasis, troopUnits, hero, risk, dist, tsLvl, maxHp) {
  const team = troopUnits.filter(({ count }) => count > 0);
  if (!team.length || !oasis.animals?.length) return null;
  const troopAtk = team.reduce((sum, t) => sum + troopAttack(t.unit, t.smithyLvl) * t.count, 0);
  if (!(troopAtk > 0)) return null;
  const tripMinutes = teamMarchHours(team, hero, dist, tsLvl) * 60;
  const { animals, reserve } = arrivalAnimals(oasis, risk, tripMinutes);
  const fits = (k) => {
    const scaled = team.map((t) => ({ ...t, count: t.count * k }));
    return meetsRisk(raidOutcome(animals, scaled, hero), scaled, risk, maxHp);
  };
  let hi = 1;
  while (!fits(hi)) {
    if (hi >= MAX_TEAM_SCALE) return { scale: null, reserve };
    hi *= 2;
  }
  let lo = Math.max(1, hi >> 1);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) hi = mid;
    else lo = mid + 1;
  }
  return { scale: lo, reserve };
}

// Fewest of one unit type that clear the oasis at this risk level.
// count is null when the oasis has no known animals or the unit cannot clear it.
function calculateOptimalTroopCount(oasis, unit, smithyLvl, cx, cy, tsLvl, hero, riskLevel, maxHp) {
  const dist = Math.hypot(torusDelta(oasis.x, cx), torusDelta(oasis.y, cy));
  const fit = minimumScale(
    oasis,
    [{ unit, count: 1, smithyLvl }],
    hero,
    getRiskThresholds(riskLevel),
    dist,
    tsLvl,
    maxHp,
  );
  return { count: fit?.scale ?? null, reserve: fit?.reserve ?? 0 };
}

const PROFIT_SEARCH_STEP = 1.05;
const PROFIT_SEARCH_SPAN = 2;

// Count of one unit type with the most net resources per troop-minute, never
// below minCount (the fewest that clear the oasis within the risk level's
// loss cap). Every count marches at the same speed, so trip time is fixed and
// net per troop-minute ranks counts the same as net per troop. Stays within
// maxCount (0 = no cap) and keeps minCount when no count makes a profit.
function profitTroopCount(oasis, unit, smithyLvl, hero, risk, dist, tsLvl, minCount, maxCount) {
  const team = (count) => [{ unit, count, smithyLvl }];
  const tripMinutes = teamMarchHours(team(1), hero, dist, tsLvl) * 60;
  const { animals } = arrivalAnimals(oasis, risk, tripMinutes);
  const perTroop = (count) => {
    const o = raidOutcome(animals, team(count), hero);
    return o ? (o.res - o.lostRes) / count : -Infinity;
  };
  const first = raidOutcome(animals, team(minCount), hero);
  // Losses fall as c^-0.5, so net/c only rises while losses exceed 2/3 of the haul.
  if (!first || 1.5 * first.lostRes <= first.res) return minCount;
  const peakGuess = minCount * Math.pow((1.5 * first.lostRes) / Math.max(1, first.res), 2);
  const cap = maxCount > 0 ? Math.max(minCount, maxCount) : Infinity;
  const limit = Math.min(cap, Math.ceil(Math.max(minCount, peakGuess) * PROFIT_SEARCH_SPAN));
  let best = minCount;
  let bestValue = perTroop(minCount);
  const consider = (c) => {
    const value = perTroop(c);
    if (value > bestValue) {
      best = c;
      bestValue = value;
    }
  };
  for (let c = minCount; c <= limit; c = Math.max(c + 1, Math.ceil(c * PROFIT_SEARCH_STEP)))
    consider(c);
  // Refine between the neighbouring samples of the coarse best.
  const hi = Math.min(limit, Math.ceil(best * PROFIT_SEARCH_STEP));
  for (let c = Math.max(minCount, Math.floor(best / PROFIT_SEARCH_STEP)); c <= hi; c++)
    consider(c);
  return bestValue > 0 ? best : minCount;
}

// Unit chosen under Troops > Unit; "fastest" (or a disabled choice) falls back
// to the fastest enabled unit that has attack. Null when none is enabled.
function selectedTroopUnit(tribe) {
  const enabled = tribe.units.filter((u) => u.atk > 0 && !disabledUnits.has(u.id));
  if (!enabled.length) return null;
  const choice = document.getElementById("_vppreview-unit")?.value || "fastest";
  return (
    enabled.find((u) => u.id === choice) ||
    enabled.reduce((best, u) => (u.spd > best.spd ? u : best))
  );
}

function renderTroopTabPreview(
  container,
  tribe,
  cx,
  cy,
  radius,
  tsLvl,
  sortMode,
  riskLevel,
) {
  if (getSourceMap().size === 0) {
    container.innerHTML =
      '<div class="_vpresults-empty">No oases found yet…</div>';
    return;
  }

  // Pick the unit selected in the preview dropdown (default: fastest).
  // Disabled units are excluded from the pool; a disabled explicit selection
  // falls back to the fastest enabled unit.
  const enabledUnits = tribe.units.filter((u) => !disabledUnits.has(u.id));
  if (enabledUnits.length === 0) {
    container.innerHTML =
      '<div class="_vpresults-empty">All units disabled — click a unit icon to re-enable.</div>';
    return;
  }
  const previewUnit = selectedTroopUnit(tribe);
  if (!previewUnit) {
    container.innerHTML =
      '<div class="_vpresults-empty">All units disabled — click a unit icon to re-enable.</div>';
    return;
  }

  const smithyEl = document.getElementById(`_vpsmithy-${previewUnit.id}`);
  const previewSmithyLvl = smithyEl ? parseInt(smithyEl.value) || 0 : 0;

  // Troop slot in the rally point form: troop[t1]–troop[t10] maps to
  // the unit's position within its tribe (global ID → 1-based within-tribe slot)
  const troopSlot = ((parseInt(previewUnit.id.substring(1)) - 1) % 10) + 1;

  const hero = getHeroForTroops();
  const maxHp =
    (parseInt(document.getElementById("_vpmax-hp").value) || 100) -
    HERO_HP_BUFFER;
  const maxTroopsCap =
    parseInt(document.getElementById("_vpmax-troops")?.value) || 0;
  const scanMode = document.getElementById("_vpmode")?.value || "GRID";

  const source = getSourceMap(scanMode);
  const list = [];
  source.forEach((oasis) => {
    const { count: minCount, reserve } = calculateOptimalTroopCount(
      oasis,
      previewUnit,
      previewSmithyLvl,
      cx,
      cy,
      tsLvl,
      hero,
      riskLevel,
      maxHp,
    );
    if (minCount == null) return;
    if (maxTroopsCap > 0 && minCount > maxTroopsCap) return;
    const targetCount = profitTroopCount(
      oasis,
      previewUnit,
      previewSmithyLvl,
      hero,
      getRiskThresholds(riskLevel),
      Math.hypot(torusDelta(oasis.x, cx), torusDelta(oasis.y, cy)),
      tsLvl,
      minCount,
      maxTroopsCap,
    );

    const metrics = calculateTroopMetrics(
      oasis,
      [{ unit: previewUnit, count: targetCount, smithyLvl: previewSmithyLvl }],
      cx,
      cy,
      tsLvl,
      hero,
      riskLevel,
    );

    // Filter out invalid or out-of-range oases
    if (!metrics) return;
    if (parseFloat(metrics.dist) > radius) return;
    if (hero && metrics.heroHpLoss > maxHp) return;

    list.push({ ...oasis, ...metrics, minCount: targetCount, reserve });
  });

  list.sort((a, b) => {
    switch (sortMode) {
      case "dist":
        return parseFloat(a.dist) - parseFloat(b.dist);
      case "res":
        return b.netRes - a.netRes;
      case "rpm":
        return b.rpm - a.rpm;
      case "reshp":
        return b.resPerLoss - a.resPerLoss;
      case "combined":
      default:
        return b.rawScore - a.rawScore;
    }
  });

  const topList = list.slice(0, 20);
  const knownInRadiusTroop = countKnownOasesInRadius(cx, cy, radius);
  const animalsInRadiusTroop = countResultsInRadius(cx, cy, radius);

  if (topList.length === 0) {
    if (knownInRadiusTroop === 0) {
      container.innerHTML =
        '<div class="_vpresults-empty">No oases found yet…</div>';
    } else {
      container.innerHTML = _countLineHTML(animalsInRadiusTroop, 0);
    }
    return;
  }

  let html = _countLineHTML(animalsInRadiusTroop, topList.length);

  const rk = rallyKey();
  const halfMap = (MAP_SIZE - 1) / 2;
  const villageDid = getSelectedVillageDid();

  topList.forEach((o) => {
    const targetMapId = (-o.y + halfMap) * MAP_SIZE + (o.x + halfMap) + 1;
    const didParam = villageDid ? `&newdid=${villageDid}` : "";
    const rallyUrl = `/build.php?gid=16&tt=2&eventType=4&targetMapId=${targetMapId}${didParam}`;
    const netSign = o.netRes >= 0 ? "+" : "";
    const scoreClass = getScoreClass(o.rawScore);

    const lossHTML = `<span class="_vpresult-negative">−${escapeHTML(String(o.troopLossCount))} lost</span>`;
    const safety =
      o.heroHpLoss != null
        ? `<span class="${hpClass(o.heroHpLoss)}">−${escapeHTML(String(o.heroHpLoss))}% hp</span>` +
          lossHTML
        : lossHTML;
    const meta = _metaHTML(o, safety + (o.reserve ? `<span title="Reserve animals on the strongest observed species">Reserve +${escapeHTML(String(o.reserve))}</span>` : ""));
    const stats =
      `<span>score <b class="_vpresult-xp">${escapeHTML(String(o.rawScore.toFixed(0)))}</b></span>` +
      `<span>xp <b class="_vpresult-xp">${escapeHTML(String(o.oasisXP))}</b></span>` +
      `<span>res/loss <b style="color:#cfd3d8">${escapeHTML(String(Math.round(o.resPerLoss)))}</b></span>`;

    html += _resultRowHTML({
      scoreClass,
      value: `${netSign}${escapeHTML(o.netRes.toLocaleString())}`,
      unit: "net",
      meta,
      score: escapeHTML(String(o.oasisXP)),
      rallyHref: rallyUrl,
      rallyAttrs: ` data-slot="${troopSlot}" data-count="${o.minCount}"`,
      rallyLabel: `Send ${escapeHTML(String(o.minCount))}`,
      chips: _garrisonChips(o.animals),
      stats,
    });
  });

  container.innerHTML = html;

  container.querySelectorAll("._vprally-go").forEach((a) => {
    a.addEventListener("click", () => {
      sessionStorage.setItem(
        rk,
        JSON.stringify({
          troops: { [a.dataset.slot]: a.dataset.count },
          hero: !!hero,
          ts: Date.now(),
        }),
      );
    });
  });
}

function getHeroForTroops() {
  const checked = document.getElementById("_vptroop-hero")?.checked;
  if (!checked) return null;
  return {
    off: parseInt(document.getElementById("_vphero-off").value) || 0,
    dmgRed: parseInt(document.getElementById("_vpdmg-red").value) || 0,
    speed: parseInt(document.getElementById("_vpspeed").value) || 7,
    mounted: heroIsMounted(),
  };
}

function renderTroopTab() {
  const container = document.getElementById("_vpresults-container");
  const tribeId = detectTribe();

  if (!tribeId || !TROOP_DATA[tribeId]) {
    container.innerHTML =
      '<div class="_vpresults-empty">Tribe not detected</div>';
    return;
  }

  const tribe = TROOP_DATA[tribeId];

  const { cx, cy } = getCoords();
  const radius = parseInt(document.getElementById("_vpradius").value) || 25;
  const tsLvl = parseInt(document.getElementById("_vpts-lvl").value) || 0;
  const sortMode = document.getElementById("_vpsort-order").value || "rpm";
  const hero = getHeroForTroops();

  const troopUnits = [];
  tribe.units.forEach((unit) => {
    const el = document.getElementById(`_vptroop-${unit.id}`);
    const smithyEl = document.getElementById(`_vpsmithy-${unit.id}`);
    const count = el ? parseInt(el.value) || 0 : 0;
    const smithyLvl = smithyEl ? parseInt(smithyEl.value) || 0 : 0;
    if (count > 0 && !disabledUnits.has(unit.id))
      troopUnits.push({ unit, count, smithyLvl });
  });

  const riskLevel = parseInt(document.getElementById("_vprisk")?.value) || 3;

  if (troopUnits.length === 0) {
    renderTroopTabPreview(
      container,
      tribe,
      cx,
      cy,
      radius,
      tsLvl,
      sortMode,
      riskLevel,
    );
    return;
  }

  const maxHp =
    (parseInt(document.getElementById("_vpmax-hp").value) || 100) -
    HERO_HP_BUFFER;
  const scanMode = document.getElementById("_vpmode")?.value || "GRID";

  const source = getSourceMap(scanMode);
  const risk = getRiskThresholds(riskLevel);
  const list = [];
  source.forEach((o) => {
    const m = calculateTroopMetrics(
      o,
      troopUnits,
      cx,
      cy,
      tsLvl,
      hero,
      riskLevel,
    );
    if (!m) return;
    if (parseFloat(m.dist) > radius) return;
    if (hero && m.heroHpLoss > maxHp) return;
    // How many copies of the entered team clear the oasis at this risk level.
    const fit = minimumScale(o, troopUnits, hero, risk, parseFloat(m.dist), tsLvl, maxHp);
    list.push({ ...o, ...m, scale: fit?.scale ?? null, reserve: fit?.reserve ?? 0 });
  });

  list.sort((a, b) => {
    if (sortMode !== "dist") {
      const fitsA = a.scale === 1;
      const fitsB = b.scale === 1;
      if (fitsA !== fitsB) return fitsA ? -1 : 1;
      if (a.netRes < 0 && b.netRes >= 0) return 1;
      if (b.netRes < 0 && a.netRes >= 0) return -1;
    }
    switch (sortMode) {
      case "dist":
        return parseFloat(a.dist) - parseFloat(b.dist);
      case "res":
        return b.netRes - a.netRes;
      case "rpm":
        return b.rpm - a.rpm;
      case "reshp":
        return b.resPerLoss - a.resPerLoss;
      case "combined":
      default:
        return b.rawScore - a.rawScore;
    }
  });

  if (list.length === 0 && source.size > 0) {
    container.innerHTML = `<div class="_vpresults-empty">No oases in radius. Found ${escapeHTML(String(source.size))} total.</div>`;
    return;
  }
  if (list.length === 0) {
    container.innerHTML =
      '<div class="_vpresults-empty">No oases found yet…</div>';
    return;
  }

  const halfMap = (MAP_SIZE - 1) / 2;
  const villageDid = getSelectedVillageDid();
  const topList = list.slice(0, 20);
  const animalsInRadius = countResultsInRadius(cx, cy, radius);
  let html = _countLineHTML(animalsInRadius, topList.length);
  topList.forEach((o) => {
    const netSign = o.netRes >= 0 ? "+" : "";
    const scoreClass = getScoreClass(o.rawScore);
    const targetMapId = (-o.y + halfMap) * MAP_SIZE + (o.x + halfMap) + 1;
    const didParam = villageDid ? `&newdid=${villageDid}` : "";

    const lossHTML = `<span class="_vpresult-negative">−${escapeHTML(String(o.troopLossCount))} lost</span>`;
    const safety =
      o.heroHpLoss != null
        ? `<span class="${hpClass(o.heroHpLoss)}">−${escapeHTML(String(o.heroHpLoss))}% hp</span>` +
          lossHTML
        : lossHTML;
    const fitHTML =
      o.scale === 1
        ? '<span class="_vphp-ok">Clears</span>'
        : `<span class="_vphp-high" title="Copies of this team needed to clear at this risk level">${o.remaining ? escapeHTML(String(o.remaining)) + " left · " : ""}${o.scale ? "×" + escapeHTML(String(o.scale)) : "Can't clear"}</span>`;
    const meta = _metaHTML(o, safety + fitHTML + (o.reserve ? `<span title="Reserve animals on the strongest observed species">Reserve +${escapeHTML(String(o.reserve))}</span>` : ""));
    const stats =
      `<span>score <b class="_vpresult-xp">${escapeHTML(String(o.rawScore.toFixed(0)))}</b></span>` +
      `<span>xp <b class="_vpresult-xp">${escapeHTML(String(o.oasisXP))}</b></span>` +
      `<span>res/loss <b style="color:#cfd3d8">${escapeHTML(String(Math.round(o.resPerLoss)))}</b></span>`;

    html += _resultRowHTML({
      scoreClass,
      value: `${netSign}${escapeHTML(o.netRes.toLocaleString())}`,
      unit: "net",
      meta,
      score: escapeHTML(String(o.oasisXP)),
      rallyHref: `/build.php?gid=16&tt=2&eventType=4&targetMapId=${targetMapId}${didParam}`,
      rallyLabel: "Send",
      chips: _garrisonChips(o.animals),
      stats,
    });
  });

  container.innerHTML = html;

  const rk = rallyKey();
  const troops = {};
  troopUnits.forEach(({ unit, count }) => {
    const slot = ((parseInt(unit.id.substring(1)) - 1) % 10) + 1;
    troops[slot] = count;
  });
  const isHeroEnabled = document.getElementById("_vptroop-hero")?.checked;

  container.querySelectorAll("._vprally-go").forEach((a) => {
    a.addEventListener("click", () => {
      const payload = {
        troops,
        ts: Date.now(),
      };
      if (isHeroEnabled) {
        payload.hero = true;
      }
      sessionStorage.setItem(rk, JSON.stringify(payload));
    });
  });
}
