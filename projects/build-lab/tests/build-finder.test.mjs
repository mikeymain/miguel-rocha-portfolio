import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  diversifyFinderResults,
  enumerateFinderBodies,
  findCapBreakerBuilds,
  getFinderHeights,
  minimumBreakerCount,
  selectFinderBodyCandidates,
  validateFinderRequest,
} from "../src/engine/buildFinder.js";
import { getOverall } from "../src/engine/gameRules.js";
import { projectedRatings } from "../src/engine/capProjections.js";
import { buildCaps } from "../src/engine/buildModel.js";
import { getRules } from "../src/engine/gameRules.js";
import { satisfyMinimums } from "../src/engine/dependencies.js";

test("guard search does not buy unwanted finishing and post ratings", () => {
  const request = {
    position: "PG",
    minHeight: 76,
    maxHeight: 76,
    weight: 185,
    wingspan: 82,
    capBreakerCount: 5,
    capTargets: [
      { id: "dunk", target: 96 },
      { id: "three", target: 83 },
      { id: "handle", target: 91 },
      { id: "swb", target: 80 },
    ],
    priorities: [],
    maxBodyCandidates: 1,
  };
  const candidate = findCapBreakerBuilds(request).results[0];
  assert.ok(candidate);
  const floor = { ...candidate.build.ratings, close: 25, layup: 25, post: 25 };
  const minimum = satisfyMinimums({
    ratings: floor,
    caps: buildCaps(candidate.body),
    rules: getRules(76),
  });
  for (const id of ["close", "layup", "post"])
    assert.equal(
      candidate.build.ratings[id],
      minimum[id],
      `${id} should only receive linked minimums`,
    );
  assert.ok(candidate.totalCapsUsed > 0, "use caps to free base budget");
  for (const row of candidate.capTargets) assert.ok(row.final >= row.target);
  assert.ok(getOverall(candidate.build.ratings, 76).uncapped <= 99);
  // User direction: spare budget always goes to badge value on the other attributes.
  assert.ok(candidate.badgeValue > 0, "spare budget buys badge value");
  const explicit = findCapBreakerBuilds({
    ...request,
    capTargets: [...request.capTargets, { id: "layup", target: 85 }],
  }).results[0];
  assert.ok(
    explicit && projectedRatings(explicit.build).ratings.layup >= 85,
    "explicit layup target remains supported",
  );
});

test("shared 217 lb PG body is found for 96 dunk and 91 three-point with five caps", () => {
  const request = {
    position: "PG",
    minHeight: 77,
    maxHeight: 77,
    weight: 217,
    wingspan: 81,
    capBreakerCount: 5,
    capTargets: [
      { id: "dunk", target: 96 },
      { id: "three", target: 91 },
    ],
    priorities: [],
    maxBodyCandidates: 1,
  };
  for (const capBreakerCount of [5, 0]) {
    const result = findCapBreakerBuilds({ ...request, capBreakerCount });
    assert.ok(result.results.length > 0, "must find a feasible spread on the supplied body");
    for (const candidate of result.results) {
      const final = projectedRatings(candidate.build).ratings;
      assert.ok(final.dunk >= 96 && final.three >= 91);
      assert.ok(candidate.totalCapsUsed <= capBreakerCount);
      assert.ok(getOverall(candidate.build.ratings, 77).uncapped <= 99 + 1e-6);
    }
  }
});

test("finder can rediscover the supplied 6 foot 8 center using its projected cap targets", () => {
  const body = { position: "C", height: 80, weight: 271, wingspan: 86 };
  const build = {
    body,
    ratings: {
      close: 76,
      layup: 75,
      dunk: 93,
      standing: 61,
      post: 56,
      mid: 36,
      three: 25,
      free: 37,
      pass: 70,
      handle: 59,
      swb: 54,
      interior: 85,
      perimeter: 82,
      steal: 85,
      block: 92,
      oreb: 90,
      dreb: 93,
      speed: 81,
      agility: 74,
      strength: 90,
      vertical: 90,
    },
    breakers: { block: 1, oreb: 2, dreb: 2 },
  };
  const targets = Object.entries(projectedRatings(build).ratings)
    .filter(([, rating]) => rating > 25)
    .map(([id, target]) => ({ id, target }));
  const result = findCapBreakerBuilds({
    position: "C",
    minHeight: 80,
    maxHeight: 80,
    weight: 271,
    wingspan: 86,
    capBreakerCount: 5,
    capTargets: targets,
    priorities: [],
    bodyReference: body,
    startingBuild: build,
    maxBodyCandidates: 24,
  });
  assert.ok(
    result.results.length > 0,
    "the legal linked build should remain findable using post-cap targets",
  );
  const candidate = result.results[0];
  assert.equal(candidate.body.position, "C");
  assert.equal(candidate.body.height, 80);
  assert.equal(candidate.body.weight, 271);
  assert.equal(candidate.body.wingspan, 86);
  assert.ok(candidate.capTargets.every((item) => item.final >= item.target));
  assert.ok(candidate.totalCapsUsed <= 5);
  assert.ok(candidate.overall <= 99);
});

test("finder height choices contain only legal heights for the selected position", () => {
  assert.deepEqual(getFinderHeights("PG"), [69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79]);
  assert.deepEqual(getFinderHeights("C"), [79, 80, 81, 82, 83, 84, 85, 86, 87, 88]);
  assert.deepEqual(
    getFinderHeights(""),
    [69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88],
  );
});

test("finder removes repeated attribute spreads across positions and weights", () => {
  const spread = (close) =>
    Object.fromEntries(
      [
        "close",
        "layup",
        "dunk",
        "standing",
        "post",
        "mid",
        "three",
        "free",
        "pass",
        "handle",
        "swb",
        "interior",
        "perimeter",
        "steal",
        "block",
        "oreb",
        "dreb",
        "speed",
        "agility",
        "strength",
        "vertical",
      ].map((id) => [id, id === "close" ? close : 25]),
    );
  const results = [
    {
      score: 100,
      body: { position: "PG", height: 76, weight: 217, wingspan: 81 },
      build: { ratings: spread(26) },
    },
    {
      score: 99,
      body: { position: "PG", height: 76, weight: 230, wingspan: 81 },
      build: { ratings: spread(26) },
    },
    {
      score: 99,
      body: { position: "SG", height: 76, weight: 217, wingspan: 81 },
      build: { ratings: spread(26) },
    },
    {
      score: 98,
      body: { position: "PG", height: 76, weight: 218, wingspan: 81 },
      build: { ratings: spread(27) },
    },
    {
      score: 97,
      body: { position: "PG", height: 76, weight: 219, wingspan: 81 },
      build: { ratings: spread(28) },
    },
    {
      score: 95,
      body: { position: "PG", height: 77, weight: 230, wingspan: 81 },
      build: { ratings: spread(26) },
    },
  ];
  const selected = diversifyFinderResults(results, 3);
  assert.deepEqual(
    selected.map((result) => [result.body.height, result.body.weight]),
    [
      [76, 217],
      [76, 218],
      [76, 219],
    ],
  );
});

test("height-only search samples positions and body shapes within a bounded scan", () => {
  const bodies = [
    ...Array.from({ length: 12 }, (_, index) => ({
      position: "PG",
      height: 77,
      weight: 190 + index,
      wingspan: 80,
    })),
    { position: "PG", height: 77, weight: 220, wingspan: 83 },
    ...Array.from({ length: 12 }, (_, index) => ({
      position: "SG",
      height: 77,
      weight: 190 + index,
      wingspan: 80,
    })),
    { position: "SG", height: 77, weight: 220, wingspan: 83 },
    { position: "SF", height: 77, weight: 210, wingspan: 82 },
  ];
  const selected = selectFinderBodyCandidates(bodies, 6, {
    position: "PG",
    height: 77,
    weight: 190,
    wingspan: 80,
  });
  assert.equal(selected.length, 6);
  assert.ok(selected.some((body) => body.position === "PG" && body.weight === 190));
  assert.deepEqual(new Set(selected.map((body) => body.position)), new Set(["PG", "SG", "SF"]));
  assert.ok(selected.some((body) => body.wingspan === 83));
});

test("finder lists exact legal bodies matching the selected position and height", () => {
  const bodies = enumerateFinderBodies({ position: "PG", minHeight: 76, maxHeight: 76 });
  assert.ok(bodies.length > 0);
  assert.ok(
    bodies.every(
      (body) => body.position === "PG" && body.height === 76 && body.capConfidence === "exact",
    ),
  );
});

test("finder rejects invalid body height ranges", () => {
  assert.deepEqual(enumerateFinderBodies({ minHeight: 82, maxHeight: 76 }), []);
});

test("minimum breaker count uses the shortest cumulative gain that reaches the target", () => {
  assert.equal(
    minimumBreakerCount({ base: 82, target: 89, gains: [3, 2, 2, 1, 1], ceiling: 99 }),
    3,
  );
  assert.equal(
    minimumBreakerCount({ base: 88, target: 89, gains: [0, 0, 0, 0, 0], ceiling: 99 }),
    null,
  );
});

test("minimize-caps requests validate final targets and avoid duplicate attributes", () => {
  assert.deepEqual(
    validateFinderRequest({
      objective: "minimizeCaps",
      capBreakerCount: 15,
      capTargets: [{ id: "dunk", target: 89 }],
      priorities: [],
    }),
    [],
  );
  assert.match(
    validateFinderRequest({
      objective: "minimizeCaps",
      capBreakerCount: 5,
      capTargets: [
        { id: "dunk", target: 89 },
        { id: "dunk", target: 94 },
      ],
      priorities: [],
    }).join(" "),
    /Driving Dunk can only be selected once/,
  );
});

test("builder exposes the Find build workspace", () => {
  const source = fs.readFileSync(new URL("../src/Builder.jsx", import.meta.url), "utf8");
  assert.match(
    fs.readFileSync(new URL("../src/components/TopBar.jsx", import.meta.url), "utf8"),
    /Find build/,
  );
  assert.match(source, /BuildFinder/);
});

test("finder returns a legal after-cap target and preserves the cap budget", () => {
  const body = enumerateFinderBodies({ position: "PG", minHeight: 76, maxHeight: 76 })[0];
  const result = findCapBreakerBuilds({
    position: "PG",
    minHeight: 76,
    maxHeight: 76,
    weight: body.weight,
    wingspan: body.wingspan,
    capBreakerCount: 5,
    capTargets: [{ id: "dunk", target: 89 }],
    priorities: [{ id: "three", target: 85, importance: "high" }],
    maxBodyCandidates: 1,
  });
  assert.ok(result.results.length > 0);
  assert.ok(result.results[0].totalCapsUsed <= 5);
  assert.ok(result.results[0].capTargets[0].final >= 89);
  assert.ok(result.results[0].build.breakers.dunk > 0);
  assert.ok(result.results[0].overall <= 99);
});

test("minimize-caps redistributes base ratings to reduce cap use while still meeting the final target", () => {
  const body = enumerateFinderBodies({
    position: "PG",
    minHeight: 76,
    maxHeight: 76,
    weight: 197,
    wingspan: 77,
  })[0];
  const request = {
    position: "PG",
    minHeight: 76,
    maxHeight: 76,
    weight: body.weight,
    wingspan: body.wingspan,
    capBreakerCount: 5,
    capTargets: [{ id: "dunk", target: 89 }],
    priorities: [{ id: "three", target: 85, importance: "high" }],
    maxBodyCandidates: 1,
  };
  const budgetResult = findCapBreakerBuilds(request).results[0];
  const minimumResult = findCapBreakerBuilds({ ...request, objective: "minimizeCaps" }).results[0];
  assert.ok(minimumResult.totalCapsUsed < budgetResult.totalCapsUsed);
  assert.ok(minimumResult.capTargets[0].final >= 89);
  assert.ok(minimumResult.build.ratings.dunk > budgetResult.build.ratings.dunk);
  assert.ok(minimumResult.build.ratings.three >= 85);
  assert.ok(minimumResult.overall <= 99);
});

test("finder results expose their complete base attribute spread and bounded-search caveat", () => {
  const source = fs.readFileSync(
    new URL("../src/components/BuildFinder.jsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Base attribute spread/);
  assert.match(source, /bounded search/);
  assert.doesNotMatch(source, /Lowest cap count found across the matching exact body table/);
});

test("best-effort targets never block a result and Must targets stay required", () => {
  const request = {
    position: "PG",
    minHeight: 77,
    maxHeight: 77,
    weight: 217,
    wingspan: 81,
    capBreakerCount: 5,
    capTargets: [
      { id: "dunk", target: 96, must: true },
      { id: "three", target: 91, must: true },
      { id: "block", target: 99, must: false },
    ],
    priorities: [],
    maxBodyCandidates: 1,
  };
  const result = findCapBreakerBuilds(request);
  assert.ok(
    result.results.length > 0,
    "an unreachable best-effort target must not remove the build",
  );
  for (const candidate of result.results) {
    const rows = new Map(candidate.capTargets.map((row) => [row.id, row]));
    assert.ok(rows.get("dunk").met && rows.get("three").met, "Must targets are met");
    assert.equal(rows.get("block").must, false);
    assert.ok(rows.get("block").final > 25, "best-effort target still receives points");
    assert.ok(candidate.totalCapsUsed <= 5);
    assert.ok(getOverall(candidate.build.ratings, 77).uncapped <= 99 + 1e-6);
  }
  const strict = findCapBreakerBuilds({
    ...request,
    capTargets: request.capTargets.map((item) => ({ ...item, must: true })),
  });
  assert.equal(strict.results.length, 0, "the same block target as a Must is unreachable");
});

test("targets without a must flag stay required and invalid flags are rejected", () => {
  const request = {
    position: "PG",
    minHeight: 77,
    maxHeight: 77,
    weight: 217,
    wingspan: 81,
    capBreakerCount: 5,
    capTargets: [{ id: "dunk", target: 96 }],
    priorities: [],
    maxBodyCandidates: 1,
  };
  const candidate = findCapBreakerBuilds(request).results[0];
  assert.ok(candidate.capTargets[0].met && candidate.capTargets[0].must);
  assert.match(
    validateFinderRequest({
      ...request,
      capTargets: [{ id: "dunk", target: 96, must: "yes" }],
    }).join(" "),
    /Must or best effort/,
  );
});

test("target maximums follow the best body ceiling in the height range", async () => {
  const { finderTargetMaximums, enumerateFinderBodies } =
    await import("../src/engine/buildFinder.js");
  const maximums = finderTargetMaximums({ minHeight: 77, maxHeight: 77 });
  const bodies = enumerateFinderBodies({ minHeight: 77, maxHeight: 77 });
  for (const id of ["dunk", "block", "three"]) {
    assert.equal(maximums[id], Math.max(...bodies.map((body) => buildCaps(body)[id])));
  }
  assert.ok(maximums.block < 99, "a 6 foot 5 body cannot reach 99 block");
});

test("badge targets fold OR joins and pick the cheapest reachable option", async () => {
  const { badgeRequirementOptions, badgeTargetPlan } = await import("../src/engine/buildFinder.js");
  const { badges } = await import("../src/catalogs/index.js");
  assert.deepEqual(
    badgeRequirementOptions({
      requirements: [
        ["close", 65, "OR"],
        ["layup", 65, "AND"],
        ["dunk", 70],
      ],
      mode: "any",
    }).map((option) => option.map(([id]) => id)),
    [
      ["close", "dunk"],
      ["layup", "dunk"],
    ],
  );
  const posterizer = badges.find((item) => item.name === "Posterizer" && item.tier === "Gold");
  const plan = badgeTargetPlan(
    posterizer,
    { dunk: 96, vertical: 25 },
    { minHeight: 77, maxHeight: 77 },
  );
  assert.equal(plan.targets.dunk, 96, "existing higher targets are kept");
  assert.equal(plan.targets.vertical, 80);
  const float = badges.find((item) => item.name === "Float Game" && item.tier === "Bronze");
  assert.deepEqual(
    badgeTargetPlan(float, { close: 25, layup: 60 }, { minHeight: 77, maxHeight: 77 }).requirements,
    [{ id: "layup", value: 65 }],
  );
  assert.match(
    badgeTargetPlan({ ...posterizer, height: [85, 91] }, {}, { minHeight: 77, maxHeight: 77 })
      .error,
    /needs a height/,
  );
});

test("closest builds rank unreachable requests by points short and keep Must labels", async () => {
  const { findClosestBuilds } = await import("../src/engine/buildFinder.js");
  const body = enumerateFinderBodies({ position: "SG", minHeight: 77, maxHeight: 77 })[0],
    caps = buildCaps(body);
  const mustIds = ["dunk", "three", "handle", "perimeter", "speed", "mid"];
  const request = {
    position: body.position,
    minHeight: 77,
    maxHeight: 77,
    weight: body.weight,
    wingspan: body.wingspan,
    capBreakerCount: 3,
    priorities: [],
    maxBodyCandidates: 24,
    limit: 8,
    capTargets: [
      ...mustIds.map((id) => ({ id, target: caps[id], must: true })),
      { id: "block", target: 70, must: false },
    ],
  };
  assert.equal(findCapBreakerBuilds(request).results.length, 0);
  const closest = findClosestBuilds(request);
  assert.ok(closest.closest && closest.results.length > 0);
  for (let index = 1; index < closest.results.length; index++)
    assert.ok(closest.results[index - 1].shortfall <= closest.results[index].shortfall);
  const best = closest.results[0];
  assert.ok(best.shortfall > 0);
  assert.equal(
    best.shortfall,
    best.misses.reduce((sum, miss) => sum + miss.target - miss.final, 0),
  );
  assert.equal(best.capTargets.find((row) => row.id === "block").must, false);
  assert.equal(best.capTargets.find((row) => row.id === "dunk").must, true);
  for (const [id, count] of Object.entries(best.build.breakers))
    if (count) assert.ok(mustIds.includes(id), `${id} is not a Must target`);
  assert.ok(best.totalCapsUsed <= 3 && getOverall(best.build.ratings, 77).uncapped <= 99 + 1e-6);
});

test("closest search only uses bodies that reach every Must and reports when none can", async () => {
  const { runFinderSearch } = await import("../src/engine/buildFinder.js");
  const base = {
    minHeight: 77,
    maxHeight: 77,
    capBreakerCount: 5,
    priorities: [],
    maxBodyCandidates: 24,
    limit: 8,
  };
  const alone = runFinderSearch({
    ...base,
    capTargets: [
      { id: "dunk", target: 99, must: true },
      { id: "block", target: 80, must: true },
    ],
  });
  assert.equal(alone.results.length, 0);
  assert.match(alone.errors.join(" "), /80 Block \(max \d+\)/);
  const together = runFinderSearch({
    ...base,
    capTargets: [
      { id: "dunk", target: 96, must: true },
      { id: "three", target: 94, must: true },
      { id: "handle", target: 92, must: true },
    ],
  });
  assert.equal(together.results.length, 0);
  assert.match(together.errors.join(" "), /No single body .* every Must target together/);
});

test("cap breakers only go on Must targets", async () => {
  const { capBudgetFits, runFinderSearch } = await import("../src/engine/buildFinder.js");
  const capTargets = [
    { id: "dunk", target: 95, must: true },
    { id: "block", target: 70, must: false },
  ];
  assert.ok(capBudgetFits({ dunk: 2 }, { capBreakerCount: 3, capTargets }));
  assert.ok(
    !capBudgetFits({ block: 1 }, { capBreakerCount: 3, capTargets }),
    "best-effort targets take no caps",
  );
  assert.ok(
    !capBudgetFits({ mid: 1 }, { capBreakerCount: 3, capTargets }),
    "non-targets take no caps",
  );
  const found = runFinderSearch({
    minHeight: 77,
    maxHeight: 77,
    capBreakerCount: 4,
    priorities: [],
    maxBodyCandidates: 12,
    limit: 4,
    capTargets,
  });
  assert.ok(found.results.length > 0);
  for (const result of found.results)
    for (const [id, count] of Object.entries(result.build.breakers))
      if (count) assert.equal(id, "dunk");
});

test("badge thresholds list the next reachable step for an attribute", async () => {
  const { nextBadgeThreshold, badgeThresholds } = await import("../src/engine/buildFinder.js");
  assert.deepEqual(nextBadgeThreshold("dunk", 90, { minHeight: 77, maxHeight: 77 }), {
    value: 93,
    items: ["Posterizer Gold"],
  });
  const steps = badgeThresholds("dunk", { minHeight: 69, maxHeight: 88 });
  assert.ok(steps.every((step, index) => !index || steps[index - 1].value < step.value));
  assert.equal(nextBadgeThreshold("block", 99, { minHeight: 77, maxHeight: 77 }), null);
});

test("specialization cap breakers only count inside their category", async () => {
  const { capBudgetFits, capBudgetTotal } = await import("../src/engine/buildFinder.js");
  const request = { capBreakerCount: 2, specializationCount: 3, specialization: "fin" };
  assert.ok(
    capBudgetFits({ dunk: 3, three: 2 }, request),
    "3 finishing caps use the specialization breakers",
  );
  assert.ok(
    !capBudgetFits({ free: 1 }, { ...request, specialization: "sht" }),
    "free throw never takes cap breakers",
  );
  assert.ok(
    !capBudgetFits({ dunk: 1, three: 3 }, request),
    "shooting caps cannot use finishing breakers",
  );
  assert.ok(
    !capBudgetFits({ dunk: 4, three: 2 }, request),
    "total stays within regular plus specialization",
  );
  assert.ok(
    !capBudgetFits({ dunk: 3 }, { ...request, specialization: null }),
    "specialization breakers need a specialization",
  );
  assert.equal(capBudgetTotal(request), 5);
  assert.equal(capBudgetTotal({ ...request, specialization: "" }), 2);
  const search = {
    position: "PG",
    minHeight: 77,
    maxHeight: 77,
    weight: 217,
    wingspan: 81,
    capBreakerCount: 2,
    specializationCount: 3,
    specialization: "reb",
    capTargets: [
      { id: "dunk", target: 96 },
      { id: "three", target: 91 },
    ],
    priorities: [],
    maxBodyCandidates: 1,
  };
  for (const result of findCapBreakerBuilds(search).results) {
    const outside = result.capTargets.reduce(
      (sum, row) => sum + (["oreb", "dreb"].includes(row.id) ? 0 : row.caps),
      0,
    );
    assert.ok(outside <= 2, "rebounding breakers cannot pay for dunk or three caps");
  }
  assert.match(
    validateFinderRequest({ ...search, specialization: "xyz" }).join(" "),
    /valid build specialization/,
  );
});

test("spare budget buys badge tokens without breaking the overall limit", async () => {
  const { spendOnBadgeValue } = await import("../src/engine/badgeValue.js");
  const { tokenBudget } = await import("../src/catalogs/badgeEconomy.js");
  const body = { position: "PG", height: 77, weight: 217, wingspan: 81 };
  const ratings = satisfyMinimums({
    ratings: Object.fromEntries(
      [
        "close",
        "layup",
        "dunk",
        "standing",
        "post",
        "mid",
        "three",
        "free",
        "pass",
        "handle",
        "swb",
        "interior",
        "perimeter",
        "steal",
        "block",
        "oreb",
        "dreb",
        "speed",
        "agility",
        "strength",
        "vertical",
      ].map((id) => [id, 25]),
    ),
    caps: buildCaps(body),
    rules: getRules(77),
  });
  const start = { name: "spend", body, ratings, breakers: {} };
  const ids = ["mid", "three", "pass", "handle", "steal", "speed", "agility", "vertical"];
  const spent = spendOnBadgeValue(start, ids, {});
  const tokens = (build) => tokenBudget(build.ratings, body).reduce((sum, value) => sum + value, 0);
  assert.ok(tokens(spent) > tokens(start), "spending earns tokens");
  assert.ok(getOverall(spent.ratings, 77).uncapped <= 99 + 1e-6);
  const refused = spendOnBadgeValue(start, ids, {}, () => false);
  assert.deepEqual(refused.ratings, start.ratings, "rejected steps are not applied");
});

test("specialization caps free budget even when the starting spread already meets every target", () => {
  const ratings = {
    close: 74,
    layup: 74,
    dunk: 94,
    standing: 45,
    post: 56,
    mid: 85,
    three: 83,
    free: 60,
    pass: 54,
    handle: 79,
    swb: 65,
    interior: 88,
    perimeter: 75,
    steal: 60,
    block: 84,
    oreb: 57,
    dreb: 82,
    speed: 80,
    agility: 80,
    strength: 89,
    vertical: 90,
  };
  const body = { position: "SF", height: 79, weight: 237, wingspan: 84 };
  const request = {
    minHeight: 79,
    maxHeight: 79,
    capBreakerCount: 0,
    specialization: "sht",
    specializationCount: 2,
    priorities: [],
    capTargets: Object.entries(ratings).map(([id, target]) => ({ id, target })),
    bodyReference: body,
    startingBuild: { name: "demigod", body, ratings, breakers: {} },
    maxBodyCandidates: 48,
    limit: 8,
  };
  const best = findCapBreakerBuilds(request).results[0];
  assert.ok(best.totalCapsUsed > 0, "shooting specialization breakers are used");
  for (const row of best.capTargets) {
    if (row.caps)
      assert.equal(
        ["mid", "three"].includes(row.id),
        true,
        "only shooting attributes other than free throw take specialization breakers",
      );
    assert.ok(row.met);
  }
  const unused = findCapBreakerBuilds({ ...request, specialization: null }).results[0];
  assert.ok(best.badgeValue > unused.badgeValue, "freed budget buys more badge value");
  assert.ok(getOverall(best.build.ratings, 79).uncapped <= 99 + 1e-6);
});

test("specialization cap breakers only go on Must targets in their category", async () => {
  const { runFinderSearch } = await import("../src/engine/buildFinder.js");
  const ratings = {
    close: 74,
    layup: 74,
    dunk: 94,
    standing: 45,
    post: 56,
    mid: 85,
    three: 83,
    free: 60,
    pass: 54,
    handle: 79,
    swb: 65,
    interior: 88,
    perimeter: 75,
    steal: 60,
    block: 84,
    oreb: 57,
    dreb: 82,
    speed: 80,
    agility: 80,
    strength: 89,
    vertical: 90,
  };
  const body = { position: "SF", height: 79, weight: 237, wingspan: 84 };
  const base = {
    minHeight: 79,
    maxHeight: 79,
    specialization: "sht",
    specializationCount: 2,
    priorities: [],
    bodyReference: body,
    startingBuild: {
      name: "demigod",
      body,
      ratings,
      breakers: {},
      locks: { mid: true, three: true, free: true },
    },
    maxBodyCandidates: 24,
    limit: 4,
  };
  const shooting = (build) =>
    ["mid", "three", "free"].reduce((sum, id) => sum + (build.breakers[id] || 0), 0);
  const unreachable = {
    dunk: 96,
    mid: 85,
    three: 83,
    handle: 91,
    swb: 80,
    interior: 88,
    perimeter: 85,
    steal: 60,
    block: 84,
    speed: 80,
    agility: 80,
    strength: 89,
    vertical: 82,
  };
  for (const request of [
    {
      ...base,
      capBreakerCount: 5,
      capTargets: [
        { id: "dunk", target: 96 },
        { id: "block", target: 84 },
      ],
    },
    {
      ...base,
      capBreakerCount: 5,
      objective: "minimizeCaps",
      capTargets: [
        { id: "dunk", target: 96 },
        { id: "block", target: 84 },
      ],
    },
    {
      ...base,
      capBreakerCount: 7,
      capTargets: Object.entries(unreachable).map(([id, target]) => ({ id, target })),
    },
  ]) {
    const found = runFinderSearch(request);
    assert.ok(found.results.length > 0);
    for (const result of found.results) {
      const targetIds = request.capTargets.map((item) => item.id);
      for (const [id, count] of Object.entries(result.build.breakers))
        if (count) assert.ok(targetIds.includes(id), `${id} is not a Must target`);
      if (!targetIds.some((id) => ["mid", "three"].includes(id)))
        assert.equal(shooting(result.build), 0, "shooting breakers need a shooting Must");
      assert.equal(result.build.breakers.free || 0, 0, "free throw never takes cap breakers");
      assert.ok(result.totalCapsUsed <= request.capBreakerCount + 2);
      assert.ok(getOverall(result.build.ratings, 79).uncapped <= 99 + 1e-6);
    }
  }
});

test("minimize caps keeps every final rating and only uses spare overall budget", async () => {
  const { minimizeCapsKeepingRatings } = await import("../src/engine/capSwap.js");
  const body = { position: "C", height: 80, weight: 271, wingspan: 86 };
  const total = (build) =>
    Object.values(build.breakers).reduce((sum, count) => sum + (count || 0), 0);
  const slack = {
    name: "slack",
    body,
    ratings: {
      close: 60,
      layup: 60,
      dunk: 85,
      standing: 61,
      post: 50,
      mid: 36,
      three: 25,
      free: 37,
      pass: 60,
      handle: 55,
      swb: 50,
      interior: 80,
      perimeter: 75,
      steal: 75,
      block: 85,
      oreb: 80,
      dreb: 85,
      speed: 75,
      agility: 70,
      strength: 85,
      vertical: 85,
    },
    breakers: { block: 3, oreb: 2, dreb: 2, dunk: 3 },
  };
  const out = minimizeCapsKeepingRatings(slack);
  assert.ok(total(out) < total(slack));
  const before = projectedRatings(slack).ratings,
    after = projectedRatings(out).ratings;
  for (const id of Object.keys(before))
    assert.ok(after[id] >= before[id], `${id} final rating kept`);
  assert.ok(getOverall(out.ratings, 80).uncapped <= 99 + 1e-6);
  const locked = minimizeCapsKeepingRatings({ ...slack, locks: { block: true } });
  assert.equal(locked.ratings.block, slack.ratings.block, "locked ratings stay fixed");
  const full = {
    name: "full",
    body,
    ratings: {
      close: 76,
      layup: 75,
      dunk: 93,
      standing: 61,
      post: 56,
      mid: 36,
      three: 25,
      free: 37,
      pass: 70,
      handle: 59,
      swb: 54,
      interior: 85,
      perimeter: 82,
      steal: 85,
      block: 92,
      oreb: 90,
      dreb: 93,
      speed: 81,
      agility: 74,
      strength: 90,
      vertical: 90,
    },
    breakers: { block: 1, oreb: 2, dreb: 2 },
  };
  assert.equal(total(minimizeCapsKeepingRatings(full)), 5, "a full build keeps its breakers");
});

test("building around the cap budget spends every regular breaker but never on free throw", async () => {
  const { runFinderSearch } = await import("../src/engine/buildFinder.js");
  const body = { position: "SF", height: 79, weight: 237, wingspan: 84 };
  const ratings = {
    close: 74,
    layup: 74,
    dunk: 94,
    standing: 45,
    post: 56,
    mid: 85,
    three: 83,
    free: 60,
    pass: 54,
    handle: 79,
    swb: 65,
    interior: 88,
    perimeter: 75,
    steal: 60,
    block: 84,
    oreb: 57,
    dreb: 82,
    speed: 80,
    agility: 80,
    strength: 89,
    vertical: 90,
  };
  const found = runFinderSearch({
    minHeight: 79,
    maxHeight: 79,
    capBreakerCount: 9,
    priorities: [],
    capTargets: [
      { id: "dunk", target: 96 },
      { id: "block", target: 84 },
    ],
    bodyReference: body,
    startingBuild: { name: "x", body, ratings, breakers: {} },
    maxBodyCandidates: 24,
    limit: 4,
  });
  assert.ok(found.results.length > 0);
  for (const result of found.results) {
    assert.equal(
      Object.values(result.build.breakers).reduce((sum, count) => sum + count, 0),
      9,
    );
    assert.equal(result.build.breakers.free || 0, 0);
    assert.ok(getOverall(result.build.ratings, 79).uncapped <= 99 + 1e-6);
  }
});

test("Must limits follow edit order: raising one Must lowers Musts set earlier", async () => {
  const { finderTargetLimits, finderTargetMaximums } = await import("../src/engine/buildFinder.js");
  const range = { minHeight: 69, maxHeight: 88 };
  const top = finderTargetMaximums(range);
  const ratings = Object.fromEntries(Object.keys(top).map((id) => [id, 25]));
  const mustIds = new Set(["dunk", "three"]);
  const free = finderTargetLimits(
    range,
    { ...ratings, dunk: top.dunk, three: 25 },
    { mustIds, order: ["dunk"] },
  );
  assert.equal(free.limits.dunk, top.dunk, "a lone Must can reach the range maximum");
  const both = finderTargetLimits(
    range,
    { ...ratings, dunk: top.dunk, three: top.three },
    { mustIds, order: ["three", "dunk"] },
  );
  assert.equal(both.limits.three, top.three, "the latest edit keeps the range maximum");
  assert.ok(both.limits.dunk < top.dunk, "dunk comes down for a maximum three");
  assert.equal(both.ratings.dunk, both.limits.dunk, "dunk target is clamped to its new limit");
  const again = finderTargetLimits(range, both.ratings, { mustIds, order: ["three", "dunk"] });
  assert.deepEqual(again.ratings, both.ratings, "clamped ratings are stable");
  const bestEffort = finderTargetLimits(
    range,
    { ...ratings, dunk: top.dunk, three: top.three },
    { mustIds: new Set(["three"]), order: ["three"] },
  );
  assert.ok(
    bestEffort.limits.dunk < top.dunk,
    "best-effort targets are limited to bodies that reach every Must",
  );
});

test("fewest caps mode ranks builds by cap breakers needed with no budget limit", async () => {
  const { runFinderSearch } = await import("../src/engine/buildFinder.js");
  const body = { position: "SF", height: 79, weight: 237, wingspan: 84 },
    caps = buildCaps(body);
  const capTargets = [
    { id: "dunk", target: caps.dunk, must: true },
    { id: "three", target: caps.three, must: true },
    { id: "block", target: caps.block, must: true },
  ];
  const found = runFinderSearch({
    objective: "minimizeCaps",
    minHeight: 79,
    maxHeight: 79,
    capBreakerCount: 105,
    priorities: [],
    maxBodyCandidates: 12,
    limit: 4,
    capTargets,
  });
  assert.ok(found.results.length > 0);
  for (let index = 1; index < found.results.length; index++)
    assert.ok(found.results[index - 1].totalCapsUsed <= found.results[index].totalCapsUsed);
  for (const result of found.results) {
    for (const item of capTargets)
      assert.ok(result.capTargets.find((row) => row.id === item.id).met);
    for (const [id, count] of Object.entries(result.build.breakers))
      if (count) assert.ok(capTargets.some((item) => item.id === id));
  }
});
