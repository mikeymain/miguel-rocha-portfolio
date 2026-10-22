import { badges, eligible } from "../catalogs/index.js";
import { tokenContribution, nextToken } from "../catalogs/badgeEconomy.js";
import { editRating, buildCaps } from "./buildModel.js";
import { getOverall } from "./gameRules.js";

const BADGE_WEIGHT = 2;
const MAX_STEPS = 60;

const badgesByAttribute = badges.reduce((index, item) => {
  for (const [id] of item.requirements) (index[id] ||= new Set()).add(item);
  return index;
}, {});

// Targets count at their goal, since cap breakers lift them there later.
function withGoals(ratings, goals) {
  const rated = { ...ratings };
  for (const [id, goal] of Object.entries(goals)) rated[id] = Math.max(rated[id], goal);
  return rated;
}

// Total tokens plus weighted eligible badge tiers for a final spread.
export function badgeScore(ratings, body) {
  try {
    return (
      Object.entries(ratings).reduce((sum, [id, rating]) => sum + tokenSum(id, rating, body), 0) +
      BADGE_WEIGHT * badges.filter((item) => eligible(item, ratings, body)).length
    );
  } catch {
    return 0;
  }
}

const tokenSum = (id, rating, body) =>
  tokenContribution(id, rating, body).reduce((sum, value) => sum + value, 0);

// Change in tokens plus weighted badge tiers, scoring only what the edit touched.
function badgeGain(before, after, body, goals) {
  const from = withGoals(before, goals),
    to = withGoals(after, goals);
  const changed = Object.keys(to).filter((id) => to[id] !== from[id]);
  let gain = 0;
  const touched = new Set();
  for (const id of changed) {
    gain += tokenSum(id, to[id], body) - tokenSum(id, from[id], body);
    for (const item of badgesByAttribute[id] || []) touched.add(item);
  }
  for (const item of touched)
    gain += BADGE_WEIGHT * (Number(eligible(item, to, body)) - Number(eligible(item, from, body)));
  return gain;
}

// Nearest rating above the current one that earns a token or unlocks a badge.
function nextStep(id, ratings, body, goals, cap) {
  let step = null;
  try {
    step = nextToken(id, ratings[id], body)?.rating ?? null;
  } catch {
    return null;
  }
  const rated = withGoals(ratings, goals);
  for (const item of badgesByAttribute[id] || []) {
    if (eligible(item, rated, body)) continue;
    const requirement = item.requirements.find(
      ([requirementId, value]) => requirementId === id && value > ratings[id],
    );
    if (!requirement || (step != null && requirement[1] >= step)) continue;
    if (eligible(item, { ...rated, [id]: requirement[1] }, body)) step = requirement[1];
  }
  return step != null && step <= cap ? step : null;
}

// Spend spare overall budget where it buys the most tokens and badges per
// overall point. Lazy greedy: values only shrink as budget is spent, so each
// round re-checks just the most promising attribute. Stops when no affordable
// step adds value.
export function spendOnBadgeValue(build, ids, goals, accept = () => true) {
  let next = build;
  const caps = buildCaps(build.body);
  const evaluate = (id) => {
    const step = nextStep(id, next.ratings, next.body, goals, caps[id]);
    if (step == null) return null;
    const result = editRating(next, id, step);
    if (result.build.ratings[id] < step) return null;
    const gain = badgeGain(next.ratings, result.build.ratings, next.body, goals);
    if (gain <= 0) return null;
    const cost =
      getOverall(result.build.ratings, next.body.height).uncapped -
      getOverall(next.ratings, next.body.height).uncapped;
    return { build: result.build, value: gain / Math.max(1e-3, cost) };
  };
  const estimates = new Map();
  try {
    for (const id of ids) {
      const found = evaluate(id);
      if (found) estimates.set(id, found.value);
    }
  } catch {
    return next;
  }
  for (
    let accepted = 0, checks = 0;
    accepted < MAX_STEPS && checks < MAX_STEPS * 8 && estimates.size;
    checks++
  ) {
    let id = null;
    for (const [key, value] of estimates) if (id == null || value > estimates.get(id)) id = key;
    let fresh = null;
    try {
      fresh = evaluate(id);
    } catch {
      return next;
    }
    if (!fresh) {
      estimates.delete(id);
      continue;
    }
    let rival = -Infinity;
    for (const [key, value] of estimates) if (key !== id && value > rival) rival = value;
    if (fresh.value < rival) {
      estimates.set(id, fresh.value);
      continue;
    }
    if (!accept(fresh.build)) {
      estimates.delete(id);
      continue;
    }
    next = fresh.build;
    accepted++;
    estimates.set(id, fresh.value);
  }
  return next;
}
