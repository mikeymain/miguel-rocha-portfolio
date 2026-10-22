import { capProjection } from "./capProjections.js";
import { buildCaps, editRating } from "./buildModel.js";
import { getOverall } from "./gameRules.js";

const MAX_SWAPS = 12;
const MAX_RAISES = 60;
const MAX_DROP = 8;

// Final ratings and points short for a spread with the given cap counts.
export function evaluateTargets(build, targets, counts) {
  const caps = buildCaps(build.body);
  let short = 0;
  const rows = targets.map((item) => {
    let final = build.ratings[item.id];
    for (const gain of capProjection(build, item.id).gains.slice(0, counts[item.id] || 0))
      final = Math.min(caps[item.id], final + Math.max(0, gain));
    short += Math.max(0, item.target - final);
    return { id: item.id, final, met: final >= item.target };
  });
  return { short, rows };
}

// Spend spare overall budget on short targets, best shortfall cut per point.
function raiseShortTargets(build, targets, counts) {
  let next = build;
  for (let round = 0; round < MAX_RAISES; round++) {
    const before = evaluateTargets(next, targets, counts),
      cost = getOverall(next.ratings, next.body.height).uncapped;
    let best = null;
    targets.forEach((item, index) => {
      if (before.rows[index].met) return;
      const result = editRating(next, item.id, next.ratings[item.id] + 1);
      if (result.build.ratings[item.id] === next.ratings[item.id]) return;
      const cut = before.short - evaluateTargets(result.build, targets, counts).short;
      if (cut <= 0) return;
      const value =
        cut / Math.max(1e-3, getOverall(result.build.ratings, next.body.height).uncapped - cost);
      if (!best || value > best.value) best = { build: result.build, value };
    });
    if (!best) return next;
    next = best.build;
  }
  return next;
}

// Put spare cap breakers on targets that are already met, lower their base
// rating by what the extra step returns, and reinvest the freed budget in
// short targets. Keeps a swap only when the total shortfall drops.
export function swapCapsForShortfall(build, targets, counts, fits) {
  let current = { build, counts: { ...counts } },
    score = evaluateTargets(build, targets, counts);
  for (let swap = 0; swap < MAX_SWAPS && score.short > 0; swap++) {
    let best = null;
    targets.forEach((donor, index) => {
      if (!score.rows[index].met) return;
      const nextCounts = { ...current.counts, [donor.id]: (current.counts[donor.id] || 0) + 1 };
      if (nextCounts[donor.id] > 5 || !fits(nextCounts)) return;
      for (let drop = MAX_DROP; drop >= 1; drop--) {
        const target = current.build.ratings[donor.id] - drop;
        if (target < 25) continue;
        const lowered = editRating(current.build, donor.id, target).build;
        if (lowered.ratings[donor.id] !== target) continue;
        if (!evaluateTargets(lowered, targets, nextCounts).rows[index].met) continue;
        const raised = raiseShortTargets(lowered, targets, nextCounts);
        const after = evaluateTargets(raised, targets, nextCounts);
        if (after.short < score.short && (!best || after.short < best.score.short))
          best = { build: raised, counts: nextCounts, score: after };
        break;
      }
    });
    if (!best) break;
    current = { build: best.build, counts: best.counts };
    score = best.score;
  }
  return { ...current, score };
}

function finalWith(build, id, count, caps) {
  let final = build.ratings[id];
  for (const gain of capProjection(build, id).gains.slice(0, count))
    final = Math.min(caps[id], final + Math.max(0, gain));
  return final;
}

// Place every specialization breaker that still adds something. Each one goes
// where its step adds the most; the base rating then drops by what the step
// returns so the freed budget can move elsewhere. keep() rejects any change
// that makes a target worse.
export function placeSpecializationCaps(build, counts, { ids, limit, fits, keep }) {
  let next = build,
    current = { ...counts };
  const caps = buildCaps(build.body);
  while (ids.reduce((sum, id) => sum + (current[id] || 0), 0) < limit) {
    let best = null;
    for (const id of ids) {
      const count = current[id] || 0;
      if (count >= 5) continue;
      const nextCounts = { ...current, [id]: count + 1 };
      if (!fits(nextCounts)) continue;
      const before = finalWith(next, id, count, caps),
        gain = finalWith(next, id, count + 1, caps) - before;
      if (gain > 0 && (!best || gain > best.gain)) best = { id, gain, before, nextCounts };
    }
    if (!best) break;
    let placed = null;
    for (let drop = best.gain; drop >= 1 && !placed; drop--) {
      const value = next.ratings[best.id] - drop;
      if (value < 25) continue;
      const lowered = editRating(next, best.id, value).build;
      if (
        lowered.ratings[best.id] === value &&
        finalWith(lowered, best.id, best.nextCounts[best.id], caps) >= best.before &&
        keep(lowered, best.nextCounts)
      )
        placed = lowered;
    }
    if (!placed) {
      if (!keep(next, best.nextCounts)) break;
      placed = next;
    }
    next = placed;
    current = best.nextCounts;
  }
  return { build: next, counts: current };
}

// Remove cap breakers while keeping every final rating: drop one step, raise
// that base just enough to hold its final, and keep the change only when the
// overall budget allows it and no other final rating falls. Cap ladders depend
// on the whole spread, so every final is re-checked after each edit. Each round
// takes the cheapest removal. Locked ratings stay fixed through editRating.
export function minimizeCapsKeepingRatings(build) {
  const caps = buildCaps(build.body),
    ids = Object.keys(build.ratings);
  const finalsOf = (spread) =>
    Object.fromEntries(
      ids.map((id) => [id, finalWith(spread, id, spread.breakers?.[id] || 0, caps)]),
    );
  const goal = finalsOf(build);
  let next = { ...build, breakers: { ...build.breakers } };
  for (;;) {
    const cost = getOverall(next.ratings, next.body.height).uncapped;
    let best = null;
    for (const id of ids) {
      const count = next.breakers[id] || 0;
      if (!count) continue;
      for (let value = next.ratings[id]; value <= caps[id]; value++) {
        const edited = value === next.ratings[id] ? { build: next } : editRating(next, id, value);
        if (edited.build.ratings[id] !== value) break;
        const candidate = { ...edited.build, breakers: { ...next.breakers, [id]: count - 1 } };
        const finals = finalsOf(candidate);
        if (finalWith(candidate, id, count - 1, caps) < goal[id]) continue;
        if (ids.some((other) => finals[other] < goal[other])) break;
        const added = getOverall(candidate.ratings, candidate.body.height).uncapped - cost;
        if (
          getOverall(candidate.ratings, candidate.body.height).uncapped <= 99 + 1e-6 &&
          (!best || added < best.added)
        )
          best = { build: candidate, added };
        break;
      }
    }
    if (!best) return next;
    next = best.build;
  }
}
