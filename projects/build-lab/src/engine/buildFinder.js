import capTuning from "./cap-breaker-tuning.json" with { type: "json" };
import { attributeIds, legalBodies, getRules, getOverall } from "./gameRules.js";
import { attributes, formatHeight } from "../data.js";
import { editRating, buildCaps, overallStatus } from "./buildModel.js";
import { capProjection, projectedRatings } from "./capProjections.js";
import { applyAttributeChange, satisfyMinimums } from "./dependencies.js";
import { badges } from "../catalogs/index.js";
import { spendOnBadgeValue, badgeScore } from "./badgeValue.js";
import { evaluateTargets, swapCapsForShortfall, placeSpecializationCaps } from "./capSwap.js";

const labels = Object.fromEntries(attributes.map((attribute) => [attribute.id, attribute.name]));
const groupOf = Object.fromEntries(attributes.map((attribute) => [attribute.id, attribute.group]));
const SPECIALIZATIONS = ["fin", "sht", "plm", "def", "reb", "phy"];
// User direction: the finder never places cap breakers on these attributes.
const NO_CAP_ATTRIBUTES = ["free"];

// User direction: cap breakers only go on Must targets. capIds overrides this
// when a relaxed search marks every target best effort. Without any Must
// target, every target may take cap breakers; null means no targets given.
export function capAttributeIds(request) {
  if (Array.isArray(request.capIds)) return new Set(request.capIds);
  const targets = request.capTargets || [];
  if (!targets.length) return null;
  const musts = targets.filter((item) => item.must !== false);
  return new Set((musts.length ? musts : targets).map((item) => item.id));
}

// Regular cap breakers go on any allowed attribute; specialization breakers
// only on allowed attributes in the selected specialization's category.
export function capBudgetFits(counts, request) {
  const specialization = SPECIALIZATIONS.includes(request.specialization)
    ? request.specialization
    : null;
  const extra = specialization ? Math.max(0, request.specializationCount || 0) : 0;
  if (NO_CAP_ATTRIBUTES.some((id) => (counts[id] || 0) > 0)) return false;
  const allowed = capAttributeIds(request);
  if (allowed && Object.entries(counts).some(([id, count]) => count > 0 && !allowed.has(id)))
    return false;
  let inside = 0,
    outside = 0;
  for (const [id, count] of Object.entries(counts)) {
    if (specialization && groupOf[id] === specialization) inside += count || 0;
    else outside += count || 0;
  }
  return outside <= request.capBreakerCount && inside + outside <= request.capBreakerCount + extra;
}
export const capBudgetTotal = (request) =>
  request.capBreakerCount +
  (SPECIALIZATIONS.includes(request.specialization)
    ? Math.max(0, request.specializationCount || 0)
    : 0);
const rowCounts = (rows) => Object.fromEntries(rows.map((row) => [row.id, row.caps]));
const IMPORTANCE = { must: 100, high: 35, nice: 10 };

export function diversifyFinderResults(results, limit = 8) {
  const selected = [];
  const maxResults = Math.max(0, Math.floor(limit));
  if (!maxResults) return selected;
  for (const result of results) {
    const body = result.body;
    const tooSimilar = selected.some((existing) => {
      const other = existing.body;
      if (body.height !== other.height || body.wingspan !== other.wingspan) return false;
      const sameRatings = attributeIds.every(
        (id) => result.build?.ratings?.[id] === existing.build?.ratings?.[id],
      );
      return sameRatings;
    });
    if (tooSimilar) continue;
    selected.push(result);
    if (selected.length >= maxResults) break;
  }
  return selected;
}

export function selectFinderBodyCandidates(orderedBodies, limit, reference = null) {
  const selected = [];
  const seenBodies = new Set();
  const seenShapes = new Set();
  const max = Math.max(0, Math.floor(limit));
  const bodyKey = (body) => `${body.position}/${body.height}/${body.weight}/${body.wingspan}`;
  const shapeKey = (body) =>
    `${body.position}/${body.height}/${body.wingspan}/${Math.floor(body.weight / 10)}`;
  const add = (body) => {
    selected.push(body);
    seenBodies.add(bodyKey(body));
    seenShapes.add(shapeKey(body));
  };
  if (!max) return selected;
  const matchingReference =
    reference && orderedBodies.find((body) => bodyKey(body) === bodyKey(reference));
  if (matchingReference) add(matchingReference);
  const positions = [...new Set(orderedBodies.map((body) => body.position))];
  for (const uniqueShapes of [true, false]) {
    let advanced = true;
    while (selected.length < max && advanced) {
      advanced = false;
      for (const position of positions) {
        const body = orderedBodies.find(
          (candidate) =>
            candidate.position === position &&
            !seenBodies.has(bodyKey(candidate)) &&
            (!uniqueShapes || !seenShapes.has(shapeKey(candidate))),
        );
        if (!body) continue;
        add(body);
        advanced = true;
        if (selected.length >= max) break;
      }
    }
  }
  return selected;
}

export function enumerateFinderBodies({
  position = null,
  minHeight = 69,
  maxHeight = 88,
  weight = null,
  wingspan = null,
} = {}) {
  if (minHeight > maxHeight) return [];
  const exact = new Set(Object.keys(capTuning.bodyCaps));
  const bodies = [];
  for (const positionRow of legalBodies) {
    if (position && positionRow.position !== position) continue;
    for (const size of positionRow.bodies) {
      const height = size.height_inches;
      if (height < minHeight || height > maxHeight) continue;
      for (let bodyWeight = size.weight_lb[0]; bodyWeight <= size.weight_lb[1]; bodyWeight++) {
        if (weight != null && bodyWeight !== weight) continue;
        for (
          let bodyWingspan = size.wingspan_inches[0];
          bodyWingspan <= size.wingspan_inches[1];
          bodyWingspan++
        ) {
          if (wingspan != null && bodyWingspan !== wingspan) continue;
          if (!exact.has(`${height}/${bodyWeight}/${bodyWingspan}`)) continue;
          bodies.push({
            position: positionRow.position,
            height,
            weight: bodyWeight,
            wingspan: bodyWingspan,
            capConfidence: "exact",
          });
        }
      }
    }
  }
  return bodies;
}

export function getFinderHeights(position = "") {
  const positions = position ? legalBodies.filter((row) => row.position === position) : legalBodies;
  return [
    ...new Set(positions.flatMap((row) => row.bodies.map((body) => body.height_inches))),
  ].sort((a, b) => a - b);
}

const maximumCache = new Map();
// Highest final rating any legal body in the height range can reach. Cap
// breakers never lift a rating above its body ceiling.
export function finderTargetMaximums({ minHeight = 69, maxHeight = 88 } = {}) {
  const key = `${minHeight}-${maxHeight}`;
  if (maximumCache.has(key)) return maximumCache.get(key);
  const maximums = Object.fromEntries(attributeIds.map((id) => [id, 25]));
  for (const body of enumerateFinderBodies({ minHeight, maxHeight })) {
    const caps = buildCaps(body);
    for (const id of attributeIds)
      if (Number.isInteger(caps[id])) maximums[id] = Math.max(maximums[id], caps[id]);
  }
  maximumCache.set(key, maximums);
  return maximums;
}

// Badge tier steps on one attribute within the height range, lowest first.
// Only this attribute's requirement is listed; other requirements may apply.
export function badgeThresholds(id, { minHeight = 69, maxHeight = 88 } = {}) {
  const steps = new Map();
  for (const item of badges) {
    if (item.height && (item.height[1] < minHeight || item.height[0] > maxHeight)) continue;
    for (const [requirement, value] of item.requirements) {
      if (requirement !== id) continue;
      steps.set(value, [...(steps.get(value) || []), `${item.name} ${item.tier}`]);
    }
  }
  return [...steps].map(([value, items]) => ({ value, items })).sort((a, b) => a.value - b.value);
}

export function nextBadgeThreshold(id, target, range) {
  const ceiling = finderTargetMaximums(range)[id];
  return (
    badgeThresholds(id, range).find((step) => step.value > target && step.value <= ceiling) || null
  );
}

// Alternative rating sets that unlock a badge tier. Joins fold left to right,
// matching eligible(): (A OR B) AND C becomes {A,C} or {B,C}.
export function badgeRequirementOptions(item) {
  const requirements = item?.requirements || [];
  if (!requirements.length) return [[]];
  if (!requirements.some((requirement) => requirement[2]))
    return item.mode === "any" ? requirements.map((requirement) => [requirement]) : [requirements];
  let options = [[requirements[0]]];
  for (let index = 1; index < requirements.length; index++) {
    const requirement = requirements[index];
    options =
      requirements[index - 1][2] === "OR"
        ? [...options, [requirement]]
        : options.map((option) => [...option, requirement]);
  }
  return options;
}

// Raise targets to unlock a badge tier, choosing the reachable requirement set
// that adds the fewest target points.
export function badgeTargetPlan(item, targets, { minHeight = 69, maxHeight = 88 } = {}) {
  if (!item) return { error: "Choose a badge." };
  if (item.height && (item.height[1] < minHeight || item.height[0] > maxHeight))
    return {
      error: `${item.name} needs a height of ${formatHeight(item.height[0])}–${formatHeight(item.height[1])}.`,
    };
  const maximums = finderTargetMaximums({ minHeight, maxHeight });
  const options = badgeRequirementOptions(item).filter((option) =>
    option.every(([id, value]) => value <= maximums[id]),
  );
  if (!options.length)
    return {
      error: `${item.name} ${item.tier} is out of reach for every body in this height range.`,
    };
  const added = (option) =>
    option.reduce((sum, [id, value]) => sum + Math.max(0, value - (targets[id] ?? 25)), 0);
  const best = options.reduce((choice, option) =>
    added(option) < added(choice) ? option : choice,
  );
  return {
    requirements: best.map(([id, value]) => ({ id, value })),
    targets: {
      ...targets,
      ...Object.fromEntries(best.map(([id, value]) => [id, Math.max(targets[id] ?? 25, value)])),
    },
  };
}

export function minimumBreakerCount({ base, target, gains, ceiling = 99 }) {
  if (
    !Number.isInteger(base) ||
    !Number.isInteger(target) ||
    !Array.isArray(gains) ||
    !Number.isInteger(ceiling)
  )
    return null;
  if (base >= target) return 0;
  if (target > ceiling) return null;
  let value = base;
  for (let index = 0; index < Math.min(5, gains.length); index++) {
    value = Math.min(ceiling, value + Math.max(0, Math.round(gains[index] || 0)));
    if (value >= target) return index + 1;
  }
  return null;
}

export function validateFinderRequest(request = {}) {
  const errors = [];
  const objective = request.objective === "minimizeCaps" ? "minimizeCaps" : "maximizePriorities";
  const targets = Array.isArray(request.capTargets) ? request.capTargets : [];
  const priorities = Array.isArray(request.priorities) ? request.priorities : [];
  const used = new Set();
  if (!Number.isInteger(request.capBreakerCount) || request.capBreakerCount < 0)
    errors.push("Enter a cap breaker count of zero or more.");
  if (
    request.specializationCount != null &&
    (!Number.isInteger(request.specializationCount) || request.specializationCount < 0)
  )
    errors.push("Enter a specialization cap breaker count of zero or more.");
  if (request.specialization && !SPECIALIZATIONS.includes(request.specialization))
    errors.push("Choose a valid build specialization.");
  if (targets.length > attributeIds.length)
    errors.push(`Choose up to ${attributeIds.length} post-cap targets.`);
  if (priorities.length > 6) errors.push("Choose up to six base-build priorities.");
  if (objective === "minimizeCaps" && !targets.length)
    errors.push("Add at least one post-cap target to minimize cap use.");
  if (objective !== "minimizeCaps" && !targets.length && !priorities.length)
    errors.push("Add at least one cap target or base priority.");
  for (const item of [...targets, ...priorities]) {
    if (!attributeIds.includes(item.id)) {
      errors.push("Choose a valid attribute.");
      continue;
    }
    if (used.has(item.id)) errors.push(`${labels[item.id]} can only be selected once.`);
    used.add(item.id);
    if (!Number.isInteger(item.target) || item.target < 25 || item.target > 99)
      errors.push(`${labels[item.id]} target must be between 25 and 99.`);
  }
  for (const item of targets)
    if (item.must != null && typeof item.must !== "boolean")
      errors.push(`Mark ${labels[item.id] || "the attribute"} as Must or best effort.`);
  for (const item of priorities)
    if (!Object.hasOwn(IMPORTANCE, item.importance))
      errors.push(`Choose an importance for ${labels[item.id] || "the attribute"}.`);
  if (request.position && !legalBodies.some((row) => row.position === request.position))
    errors.push("Choose a valid position.");
  if (
    request.weight != null &&
    (!Number.isInteger(request.weight) || request.weight < 145 || request.weight > 350)
  )
    errors.push("Enter a whole-number weight between 145 and 350 pounds.");
  if (
    request.wingspan != null &&
    (!Number.isInteger(request.wingspan) || request.wingspan < 69 || request.wingspan > 99)
  )
    errors.push("Enter a whole-number wingspan between 5′9″ and 8′3″.");
  if (
    request.minHeight != null &&
    request.maxHeight != null &&
    request.minHeight > request.maxHeight
  )
    errors.push("Minimum height must not exceed maximum height.");
  return [...new Set(errors)];
}

export function scoreFinderResult(result, request = {}) {
  let score = 0;
  const finalCaps = new Map((result.capTargets || []).map((item) => [item.id, item.final]));
  for (const item of request.capTargets || []) {
    const final = finalCaps.get(item.id) ?? 0;
    // Best-effort targets reward every point gained toward the goal.
    if (item.must === false) {
      score += Math.min(final, item.target) * IMPORTANCE.high;
      continue;
    }
    score += final >= item.target ? 12000 + item.target : Math.max(0, final - 25) * IMPORTANCE.must;
  }
  for (const item of request.priorities || []) {
    const base = result.build?.ratings?.[item.id] ?? 25;
    score += Math.min(base, item.target) * IMPORTANCE[item.importance];
  }
  score -= Math.max(0, result.totalCapsUsed || 0) * 0.01;
  return score;
}

function baseBuild(body) {
  const caps = buildCaps(body);
  if (Object.values(caps).some((value) => !Number.isInteger(value))) return null;
  const ratings = Object.fromEntries(attributeIds.map((id) => [id, 25]));
  try {
    return {
      name: "Cap Finder",
      body,
      ratings: satisfyMinimums({ ratings, caps, rules: getRules(body.height) }),
      breakers: Object.fromEntries(attributeIds.map((id) => [id, 0])),
    };
  } catch {
    return null;
  }
}

function improveRatings(build, request, preserveTargets = false) {
  let next = { ...build, ratings: { ...build.ratings } };
  const priorities = [...(request.priorities || [])].sort(
    (a, b) => IMPORTANCE[b.importance] - IMPORTANCE[a.importance],
  );
  // Unrequested finishing/post ratings get linked minimums, not spare points.
  // Preserve the target-first cap savings instead of buying targets again.
  const targets = new Set((request.capTargets || []).map((item) => item.id));
  // Guard support preferences, not game requirements. Explicit targets win.
  const guardSupport =
    build.body.height <= 79 && (targets.has("handle") || targets.has("swb"))
      ? {
          pass: 86,
          perimeter: 90,
          steal: 91,
          speed: 90,
          agility: 88,
          strength: 60,
          vertical: 85,
          free: 80,
        }
      : null;
  const order = (guardSupport ? Object.keys(guardSupport) : attributeIds).filter(
    (id) =>
      !targets.has(id) &&
      !["close", "layup", "post"].includes(id) &&
      !priorities.some((item) => item.id === id),
  );
  for (const item of priorities) {
    for (let guard = 0; guard < 75 && next.ratings[item.id] < item.target; guard++) {
      const result = editRating(next, item.id, item.target);
      if (result.build.ratings[item.id] === next.ratings[item.id]) break;
      if (preserveTargets && !meetsTargets(result.build, request)) break;
      next = result.build;
    }
  }
  // Spare budget always buys token and badge thresholds first, then spreads evenly.
  {
    const goals = Object.fromEntries(
      (request.capTargets || []).map((item) => [item.id, item.target]),
    );
    // Targets may rise above their goal too; freed budget from cap breakers
    // has nowhere else to go when every attribute is a target.
    const spendIds = attributeIds.filter(
      (id) =>
        targets.has(id) ||
        (!["close", "layup", "post"].includes(id) && !priorities.some((item) => item.id === id)),
    );
    next = spendOnBadgeValue(
      next,
      spendIds,
      goals,
      (candidate) => !preserveTargets || meetsTargets(candidate, request),
    );
  }
  // Soft foundations inspired by NBA2KLab's Bouncy Playshot; never override targets.
  const stages = guardSupport
    ? [
        {
          pass: 85,
          perimeter: 75,
          steal: 77,
          speed: 85,
          agility: 78,
          strength: 42,
          vertical: 75,
          free: 70,
        },
        guardSupport,
      ]
    : [null];
  for (const stage of stages)
    for (let pass = 0; pass < 74; pass++) {
      let changed = false;
      for (const id of order) {
        const cap = Math.min(buildCaps(next.body)[id], stage?.[id] ?? 99);
        if (next.ratings[id] >= cap) continue;
        const result = editRating(next, id, next.ratings[id] + 1);
        if (
          result.build.ratings[id] !== next.ratings[id] &&
          (!preserveTargets || meetsTargets(result.build, request))
        ) {
          next = result.build;
          changed = true;
        }
      }
      if (!changed) break;
    }
  // Leftover budget, often freed by cap breakers, may lift targets above their
  // goals. Capped targets are skipped so freed points are not bought back.
  const capped = new Set(
    (projectedTargetRows(next, request.capTargets || [])?.rows || [])
      .filter((row) => row.caps > 0)
      .map((row) => row.id),
  );
  const extraIds = [...targets].filter((id) => !capped.has(id));
  const keepsTargets = (candidate) => !preserveTargets || meetsTargets(candidate, request);
  if (extraIds.length) {
    next = spendOnBadgeValue(
      next,
      extraIds,
      Object.fromEntries((request.capTargets || []).map((item) => [item.id, item.target])),
      keepsTargets,
    );
    for (let pass = 0; pass < 74; pass++) {
      let changed = false;
      for (const id of extraIds) {
        if (next.ratings[id] >= buildCaps(next.body)[id]) continue;
        const result = editRating(next, id, next.ratings[id] + 1);
        if (result.build.ratings[id] !== next.ratings[id] && keepsTargets(result.build)) {
          next = result.build;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }
  const floor = { ...next.ratings };
  for (const id of ["close", "layup", "post"])
    if (!targets.has(id) && !priorities.some((item) => item.id === id)) floor[id] = 25;
  const trimmed = {
    ...next,
    ratings: satisfyMinimums({
      ratings: floor,
      caps: buildCaps(next.body),
      rules: getRules(next.body.height),
    }),
  };
  return !preserveTargets || meetsTargets(trimmed, request) ? trimmed : next;
}

export function projectedTargetRows(build, targets) {
  const caps = buildCaps(build.body),
    breakers = { ...build.breakers },
    rows = [];
  let totalCapsUsed = 0;
  for (const item of targets) {
    const projection = capProjection(build, item.id);
    if (projection.confidence === "fallback") return null;
    const count = minimumBreakerCount({
      base: build.ratings[item.id],
      target: item.target,
      gains: projection.gains,
      ceiling: caps[item.id],
    });
    if (count == null) return null;
    breakers[item.id] = count;
    totalCapsUsed += count;
    let final = build.ratings[item.id];
    for (const gain of projection.gains.slice(0, count))
      final = Math.min(caps[item.id], final + gain);
    rows.push({
      id: item.id,
      name: labels[item.id],
      base: build.ratings[item.id],
      caps: count,
      final,
      target: item.target,
      met: final >= item.target,
      must: true,
      confidence: projection.confidence,
    });
  }
  return { build: { ...build, breakers }, rows, totalCapsUsed };
}

// Spend leftover cap breakers on best-effort targets, one step at a time,
// always taking the step that closes the most remaining distance to a goal.
export function allocateBestEffortCaps(build, targets, canSpend = () => false) {
  const caps = buildCaps(build.body);
  const entries = targets.map((item) => {
    const projection = capProjection(build, item.id);
    return {
      item,
      gains: projection.confidence === "fallback" ? [] : projection.gains,
      count: 0,
      final: build.ratings[item.id],
    };
  });
  const step = (entry) =>
    Math.min(
      caps[entry.item.id],
      entry.final + Math.max(0, Math.round(entry.gains[entry.count] || 0)),
    );
  let used = 0;
  const countsWith = (extra) =>
    Object.fromEntries(
      entries.map((entry) => [entry.item.id, entry.count + (entry === extra ? 1 : 0)]),
    );
  for (;;) {
    let best = null,
      bestGain = 0;
    for (const entry of entries) {
      if (
        entry.count >= Math.min(5, entry.gains.length) ||
        entry.final >= entry.item.target ||
        !canSpend(countsWith(entry))
      )
        continue;
      const gain = Math.min(step(entry), entry.item.target) - entry.final;
      if (gain > bestGain) {
        best = entry;
        bestGain = gain;
      }
    }
    if (!best) break;
    best.final = step(best);
    best.count++;
    used++;
  }
  const breakers = {
    ...build.breakers,
    ...Object.fromEntries(entries.map((entry) => [entry.item.id, entry.count])),
  };
  const rows = entries.map(({ item, count, final }) => ({
    id: item.id,
    name: labels[item.id],
    base: build.ratings[item.id],
    caps: count,
    final,
    target: item.target,
    met: final >= item.target,
    must: false,
    confidence: "exact",
  }));
  return { build: { ...build, breakers }, rows, capsUsed: used };
}

// Must targets stay hard constraints. Best-effort targets become base-rating
// priorities for the search, then receive any cap breakers left over.
function searchRequest(input) {
  const targets = input.capTargets || [];
  const bestEffort = targets.filter((item) => item.must === false);
  return {
    request: {
      ...input,
      capIds: [...(capAttributeIds(input) || [])],
      capTargets: targets.filter((item) => item.must !== false),
      priorities: [
        ...(input.priorities || []),
        ...bestEffort.map((item) => ({ id: item.id, target: item.target, importance: "high" })),
      ],
    },
    bestEffort,
  };
}

function meetsTargets(build, request) {
  const projection = projectedTargetRows(build, request.capTargets || []);
  return (
    projection &&
    capBudgetFits(rowCounts(projection.rows), request) &&
    (request.priorities || []).every(
      (item) => item.importance !== "must" || build.ratings[item.id] >= item.target,
    )
  );
}

// Establish feasible targets before spending the spare overall budget. Cap
// gains depend on the entire spread, so recheck them after every candidate edit.
export function targetFirstBuild(seed, request) {
  const caps = buildCaps(seed.body),
    rules = getRules(seed.body.height);
  const floors = [
    ...(request.capTargets || []),
    ...(request.priorities || []).filter((item) => item.importance === "must"),
  ];
  if (floors.some((item) => item.target > caps[item.id])) return null;
  let build;
  try {
    const ratings = { ...seed.ratings };
    for (const item of floors) ratings[item.id] = item.target;
    build = { ...seed, ratings: satisfyMinimums({ ratings, caps, rules }) };
  } catch {
    return null;
  }
  if (!meetsTargets(build, request)) return null;
  if (request.objective !== "minimizeCaps") {
    for (let pass = 0; pass < 74; pass++) {
      let best = null,
        bestCost = getOverall(build.ratings, build.body.height).uncapped;
      for (const item of request.capTargets || []) {
        if (build.ratings[item.id] <= 25) continue;
        const down = applyAttributeChange({
          ratings: build.ratings,
          caps,
          rules,
          attribute: item.id,
          value: build.ratings[item.id] - 1,
        });
        const candidate = { ...build, ratings: down.ratings };
        const cost = getOverall(candidate.ratings, build.body.height).uncapped;
        if (cost < bestCost && meetsTargets(candidate, request)) {
          best = candidate;
          bestCost = cost;
        }
      }
      if (!best) break;
      build = best;
    }
  }
  if (getOverall(build.ratings, build.body.height).uncapped > 99 + 1e-6) return null;
  return request.breakpointOnly ? build : improveRatings(build, request, true);
}

function targetRatingScore(build, request) {
  let score = 0;
  for (const item of request.priorities || [])
    score += Math.min(build.ratings[item.id] || 25, item.target) * IMPORTANCE[item.importance];
  // A target's base rating is valuable up to its goal: each point moved here
  // can save a cap, while points above the goal have no finder value.
  for (const item of request.capTargets || [])
    score += Math.min(build.ratings[item.id] || 25, item.target) * IMPORTANCE.must;
  return score;
}

function transferOnePoint(build, from, to) {
  const rules = getRules(build.body.height),
    caps = buildCaps(build.body);
  if (build.ratings[from] <= 25 || build.ratings[to] >= caps[to]) return null;
  const down = applyAttributeChange({
    ratings: build.ratings,
    caps,
    rules,
    attribute: from,
    value: build.ratings[from] - 1,
  });
  if (down.ratings[from] >= build.ratings[from]) return null;
  const up = applyAttributeChange({
    ratings: down.ratings,
    caps,
    rules,
    attribute: to,
    value: down.ratings[to] + 1,
  });
  if (up.ratings[to] <= down.ratings[to]) return null;
  if (getOverall(up.ratings, build.body.height).uncapped > 99 + 1e-6) return null;
  return { ...build, ratings: up.ratings };
}

function optimizeMinCaps(build, request) {
  let best = projectedTargetRows(build, request.capTargets);
  if (!best || !capBudgetFits(rowCounts(best.rows), request)) return null;
  let current = best.build;
  const protectedIds = new Set(
    (request.priorities || []).filter((item) => item.importance === "must").map((item) => item.id),
  );
  const donors = attributeIds.filter(
    (id) => !request.capTargets.some((item) => item.id === id) && !protectedIds.has(id),
  );
  const recipients = request.capTargets.map((item) => item.id);
  let keepSearching = true,
    passes = 0;
  while (keepSearching && passes++ < 32) {
    keepSearching = false;
    let selected = null;
    const currentPriorityScore = targetRatingScore(current, request);
    for (const donor of donors)
      for (const recipient of recipients) {
        const candidate = transferOnePoint(current, donor, recipient);
        if (!candidate) continue;
        const projection = projectedTargetRows(candidate, request.capTargets);
        if (!projection || !capBudgetFits(rowCounts(projection.rows), request)) continue;
        const candidateScore = targetRatingScore(candidate, request);
        if (
          projection.totalCapsUsed < best.totalCapsUsed ||
          (projection.totalCapsUsed === best.totalCapsUsed && candidateScore > currentPriorityScore)
        ) {
          const betterThanSelected =
            !selected ||
            projection.totalCapsUsed < selected.totalCapsUsed ||
            (projection.totalCapsUsed === selected.totalCapsUsed &&
              candidateScore > targetRatingScore(selected.build, request));
          if (betterThanSelected) selected = { ...projection, priorityScore: candidateScore };
        }
      }
    if (selected) {
      best = selected;
      current = selected.build;
      keepSearching = true;
    }
  }
  return best;
}

export function findCapBreakerBuilds(input = {}) {
  const errors = validateFinderRequest(input);
  if (errors.length) return { errors, results: [] };
  const { request, bestEffort } = searchRequest(input);
  const bodies = enumerateFinderBodies(request).filter((body) =>
    bodyReachesMusts(body, request.reachTargets),
  );
  const results = [];
  const maxCandidates = Math.max(1, Math.min(request.maxBodyCandidates ?? 80, 240));
  const bodyReference = request.bodyReference;
  const targetCeiling = (body) => {
    const caps = buildCaps(body);
    return (request.capTargets || []).reduce(
      (sum, item) => sum + Math.min(caps[item.id] ?? 25, item.target),
      0,
    );
  };
  const orderedBodies = [...bodies].sort((a, b) => {
    const targetDifference = targetCeiling(b) - targetCeiling(a);
    if (targetDifference) return targetDifference;
    if (bodyReference) {
      const distance = (body) =>
        Number(body.position !== bodyReference.position) * 1000 +
        Math.abs(body.height - bodyReference.height) * 100 +
        Math.abs(body.weight - bodyReference.weight) +
        Math.abs(body.wingspan - bodyReference.wingspan) * 10;
      return distance(a) - distance(b);
    }
    return a.height - b.height || a.weight - b.weight || a.wingspan - b.wingspan;
  });
  for (const body of selectFinderBodyCandidates(orderedBodies, maxCandidates, bodyReference)) {
    const seeds = [baseBuild(body)].filter(Boolean);
    const starting = request.startingBuild;
    if (
      starting?.body?.position === body.position &&
      starting.body.height === body.height &&
      starting.body.weight === body.weight &&
      starting.body.wingspan === body.wingspan
    ) {
      const caps = buildCaps(body);
      const validSpread = attributeIds.every(
        (id) =>
          Number.isInteger(starting.ratings?.[id]) &&
          starting.ratings[id] >= 25 &&
          starting.ratings[id] <= caps[id],
      );
      if (validSpread && getOverall(starting.ratings, body.height).uncapped <= 99 + 1e-6) {
        // Editor locks do not apply to finder candidates.
        const unlocked = Object.fromEntries(
          Object.entries(starting).filter(([key]) => key !== "locks"),
        );
        seeds.unshift({
          ...unlocked,
          body,
          ratings: { ...starting.ratings },
          breakers: { ...starting.breakers },
        });
      }
    }
    const starts = [];
    for (const seed of seeds) {
      if (meetsTargets(seed, request)) {
        starts.push(improveRatings(seed, request, true));
        // A spread that already meets its targets can still trade base points
        // for cap breakers (including specialization ones) and reinvest them.
        if (request.objective !== "minimizeCaps") starts.push(targetFirstBuild(seed, request));
        continue;
      }
      let candidate =
        request.objective !== "minimizeCaps"
          ? targetFirstBuild(seed, request)
          : improveRatings(seed, request);
      if (!candidate || !meetsTargets(candidate, request))
        candidate = targetFirstBuild(seed, request);
      starts.push(candidate);
    }
    for (let candidate of starts) {
      if (!candidate) continue;
      let targetResult = projectedTargetRows(candidate, request.capTargets || []);
      if (request.objective === "minimizeCaps") targetResult = optimizeMinCaps(candidate, request);
      if (request.capTargets?.length && !targetResult) continue;
      if (targetResult) {
        candidate = targetResult.build;
      }
      const mustCapsUsed = targetResult?.totalCapsUsed || 0;
      // Minimize-caps keeps leftover breakers unspent; best-effort targets rely on base ratings there.
      const mustCounts = rowCounts(targetResult?.rows || []);
      const extra = allocateBestEffortCaps(
        candidate,
        bestEffort,
        (counts) =>
          request.objective !== "minimizeCaps" &&
          capBudgetFits({ ...mustCounts, ...counts }, request),
      );
      candidate = extra.build;
      let capTargets = [...(targetResult?.rows || []), ...extra.rows];
      let totalCapsUsed = mustCapsUsed + extra.capsUsed;
      const status = overallStatus(candidate);
      if (
        !capBudgetFits(rowCounts(capTargets), request) ||
        !meetsTargets(candidate, request) ||
        getOverall(candidate.ratings, body.height).uncapped > 99 + 1e-6
      )
        continue;
      const result = {
        build: candidate,
        overall: status.overall,
        body,
        capTargets,
        totalCapsUsed,
        confidence: "exact",
        status: status.complete ? "complete" : "budget-limited",
      };
      // Equal target results rank by badge tokens and tiers before cap count.
      result.badgeValue = badgeScore(projectedRatings(candidate).ratings, body);
      result.score = scoreFinderResult(result, input) + result.badgeValue;
      results.push(result);
    }
  }
  const rank = (a, b) =>
    request.objective === "minimizeCaps"
      ? a.totalCapsUsed - b.totalCapsUsed || b.score - a.score
      : b.score - a.score || a.totalCapsUsed - b.totalCapsUsed;
  results.sort(rank);
  let shortlist = diversifyFinderResults(results, request.limit ?? 8);
  // Specialization breakers are placed on the shortlist only; doing it for
  // every candidate body is too slow. Ranking ignores the specialization
  // breakers in minimize mode because they are always spent.
  if (!input.skipSpecialization)
    shortlist = shortlist
      .map((result) => {
        const special = applyAllCaps(result.build, result.capTargets, input);
        if (!special) return result;
        const status = overallStatus(special.build);
        const next = {
          ...result,
          build: special.build,
          capTargets: special.capTargets,
          totalCapsUsed: special.totalCapsUsed,
          overall: status.overall,
          status: status.complete ? "complete" : "budget-limited",
        };
        next.badgeValue = badgeScore(projectedRatings(next.build).ratings, result.body);
        next.score = scoreFinderResult(next, input) + next.badgeValue;
        return next;
      })
      .sort(rank);
  return {
    errors: [],
    results: shortlist,
    scanned: Math.min(bodies.length, maxCandidates),
    totalBodies: bodies.length,
    completeSearch: bodies.length <= maxCandidates,
  };
}

// When no build reaches every Must target, search again with all targets as
// best effort and rank by how many target points each build falls short.
// Specialization breakers are always spent when a step still adds something.
// When building around the cap budget, every remaining regular breaker is
// spent the same way. Spare budget they free buys badge value on attributes
// without targets.
function applyAllCaps(build, rows, input) {
  const specialization = SPECIALIZATIONS.includes(input.specialization)
    ? input.specialization
    : null;
  const limit = specialization ? Math.max(0, input.specializationCount || 0) : 0;
  const spendBudget = input.objective !== "minimizeCaps";
  if (!limit && !(spendBudget && input.capBreakerCount > 0)) return null;
  const targets = input.capTargets || [];
  const counts = { ...Object.fromEntries(attributeIds.map((id) => [id, 0])), ...rowCounts(rows) };
  const base = evaluateTargets(build, targets, counts);
  const keep = (candidate, next) => {
    const after = evaluateTargets(candidate, targets, next);
    return (
      after.short <= base.short &&
      after.rows.every((row, index) => row.met || !base.rows[index].met)
    );
  };
  const fits = (next) => capBudgetFits(next, input);
  let filled = { build, counts };
  if (limit)
    filled = placeSpecializationCaps(filled.build, filled.counts, {
      ids: attributeIds.filter(
        (id) => groupOf[id] === specialization && !NO_CAP_ATTRIBUTES.includes(id),
      ),
      limit,
      fits,
      keep,
    });
  // Unrequested finishing/post ratings keep their linked minimums.
  const wanted = (id) =>
    targets.some((item) => item.id === id) || !["close", "layup", "post"].includes(id);
  if (spendBudget)
    filled = placeSpecializationCaps(filled.build, filled.counts, {
      ids: attributeIds.filter((id) => !NO_CAP_ATTRIBUTES.includes(id) && wanted(id)),
      limit: capBudgetTotal(input),
      fits,
      keep,
    });
  let next = { ...filled.build, breakers: filled.counts };
  next = spendOnBadgeValue(
    next,
    attributeIds.filter((id) => !targets.some((item) => item.id === id) && wanted(id)),
    {},
    (candidate) => keep(candidate, filled.counts),
  );
  const evaluated = evaluateTargets(next, targets, filled.counts);
  return {
    build: next,
    counts: filled.counts,
    totalCapsUsed: Object.values(filled.counts).reduce((sum, count) => sum + count, 0),
    capTargets: targets.map((item, index) => ({
      id: item.id,
      name: labels[item.id],
      base: next.ratings[item.id],
      caps: filled.counts[item.id] || 0,
      final: evaluated.rows[index].final,
      target: item.target,
      met: evaluated.rows[index].met,
      must: item.must !== false,
      confidence: "exact",
    })),
  };
}

// A Must target is only reachable on a body whose ceiling for it is at least
// the target; cap breakers never lift a rating past that ceiling.
function bodyReachesMusts(body, musts = []) {
  if (!musts.length) return true;
  const caps = buildCaps(body);
  return musts.every((item) => (caps[item.id] ?? 25) >= item.target);
}

function unreachableMustError(input, musts) {
  const maximums = finderTargetMaximums(input);
  const alone = musts.filter((item) => maximums[item.id] < item.target);
  if (alone.length)
    return `No body in this height range can reach ${alone.map((item) => `${item.target} ${labels[item.id]} (max ${maximums[item.id]})`).join(", ")}. Lower that Must or make it best effort.`;
  // Name the body that misses the fewest Must points and what it misses.
  let closest = null;
  for (const body of enumerateFinderBodies(input)) {
    const caps = buildCaps(body);
    const misses = musts
      .filter((item) => (caps[item.id] ?? 25) < item.target)
      .map((item) => ({ item, max: caps[item.id] ?? 25 }));
    const short = misses.reduce((sum, miss) => sum + miss.item.target - miss.max, 0);
    if (!closest || short < closest.short) closest = { body, misses, short };
  }
  const { body, misses } = closest;
  return `No single body in this height range can reach every Must target together. Closest body: ${body.position} ${formatHeight(body.height)}, ${body.weight} lbs, ${formatHeight(body.wingspan)} wingspan, which tops out at ${misses.map(({ item, max }) => `${max} ${labels[item.id]} (Must ${item.target})`).join(", ")}. Lower those Musts or make them best effort.`;
}

export function findClosestBuilds(input = {}) {
  const targets = input.capTargets || [];
  const musts = targets.filter((item) => item.must !== false);
  const mustIds = new Set(musts.map((item) => item.id));
  // Only bodies whose ceilings reach every Must can be shown; best-effort
  // targets may still fall short.
  if (!enumerateFinderBodies(input).some((body) => bodyReachesMusts(body, musts)))
    return { errors: [unreachableMustError(input, musts)], results: [] };
  const found = findCapBreakerBuilds({
    ...input,
    reachTargets: musts,
    capIds: [...(capAttributeIds(input) || [])],
    skipSpecialization: true,
    objective: "maximizePriorities",
    capTargets: targets.map((item) => ({ ...item, must: false })),
  });
  if (found.errors.length) return found;
  const goals = new Map(targets.map((item) => [item.id, item.target]));
  const otherIds = attributeIds.filter((id) => !goals.has(id));
  const results = found.results
    .map((result) => {
      // Spare cap breakers (specialization ones included) cover met targets so
      // their base points can move to short targets; leftovers buy badges on
      // the attributes without targets.
      const startCounts = {
        ...Object.fromEntries(attributeIds.map((id) => [id, 0])),
        ...rowCounts(result.capTargets),
      };
      const swapped = swapCapsForShortfall(result.build, targets, startCounts, (counts) =>
        capBudgetFits(counts, input),
      );
      let counts = swapped.counts;
      let build = {
        ...swapped.build,
        breakers: Object.fromEntries(attributeIds.map((id) => [id, counts[id] || 0])),
      };
      const rowsFor = (spread, used) => {
        const evaluated = evaluateTargets(spread, targets, used);
        return targets.map((item, index) => ({
          id: item.id,
          name: labels[item.id],
          base: spread.ratings[item.id],
          caps: used[item.id] || 0,
          final: evaluated.rows[index].final,
          target: item.target,
          met: evaluated.rows[index].met,
          must: mustIds.has(item.id),
          confidence: "exact",
        }));
      };
      // Leftover specialization breakers are placed after the swaps, so they
      // first close shortfalls and only then buy badge value.
      const special = applyAllCaps(build, rowsFor(build, counts), input);
      if (special) {
        build = special.build;
        counts = special.counts;
      } else
        build = spendOnBadgeValue(
          build,
          otherIds,
          {},
          (candidate) => evaluateTargets(candidate, targets, counts).short <= swapped.score.short,
        );
      const capTargets = rowsFor(build, counts);
      const misses = capTargets
        .filter((row) => !row.met)
        .map((row) => ({
          id: row.id,
          name: row.name,
          final: row.final,
          target: row.target,
          must: row.must,
        }));
      const shortfall = misses.reduce((sum, row) => sum + row.target - row.final, 0);
      const status = overallStatus(build);
      return {
        ...result,
        build,
        capTargets,
        misses,
        shortfall,
        overall: status.overall,
        totalCapsUsed: Object.values(counts).reduce((sum, count) => sum + count, 0),
        badgeValue: badgeScore(projectedRatings(build).ratings, result.body),
      };
    })
    .sort((a, b) => a.shortfall - b.shortfall || b.badgeValue - a.badgeValue);
  return { ...found, results, closest: true };
}

export { formatHeight };

// Exact search first; fall back to the closest builds when nothing qualifies.
export function runFinderSearch(input = {}) {
  const found = findCapBreakerBuilds(input);
  return !found.errors.length && !found.results.length && input.capTargets?.length
    ? findClosestBuilds(input)
    : found;
}
