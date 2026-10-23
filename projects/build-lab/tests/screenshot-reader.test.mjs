import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHeader, otsuThreshold, buildFromScreenshot } from "../src/screenshotReader.js";
import { projectedRatings } from "../src/engine/capProjections.js";
import { attributes } from "../src/data.js";

const ids = attributes.map((attribute) => attribute.id);
const byId = (values) => Object.fromEntries(ids.map((id, index) => [id, values[index]]));

test("header text gives height, weight, wingspan and position", () => {
  assert.deepEqual(parseHeader(`HT: 6'6" | WT: 247 lbs | WS: 7'0"\nSF | Bodybagger`), {
    height: 78,
    weight: 247,
    wingspan: 84,
    position: "SF",
  });
  assert.deepEqual(parseHeader("HT: 6’3” WT: 190 lbs WS: 6’8”\nPG"), {
    height: 75,
    weight: 190,
    wingspan: 80,
    position: "PG",
  });
  assert.deepEqual(parseHeader("nothing here"), {
    height: null,
    weight: null,
    wingspan: null,
    position: null,
  });
});

test("Otsu threshold splits a two-tone histogram between the tones", () => {
  const histogram = new Array(256).fill(0);
  histogram[30] = 900;
  histogram[190] = 100;
  const threshold = otsuThreshold(histogram);
  assert.ok(threshold >= 30 && threshold < 190);
});

test("screenshot values become a build whose cap breakers reproduce every final rating", () => {
  const base = byId([
    70, 71, 83, 33, 65, 85, 80, 60, 77, 86, 75, 85, 91, 65, 80, 80, 90, 83, 82, 88, 80,
  ]);
  const finals = byId([
    70, 71, 99, 33, 72, 85, 80, 60, 77, 86, 75, 85, 92, 65, 80, 80, 90, 83, 82, 90, 90,
  ]);
  const build = buildFromScreenshot({
    body: { position: "SF", height: 78, weight: 247, wingspan: 84 },
    base,
    finals,
  });
  assert.deepEqual(build.ratings, base);
  assert.deepEqual(projectedRatings(build).ratings, finals);
  assert.deepEqual(
    Object.fromEntries(Object.entries(build.breakers).filter(([, count]) => count)),
    { dunk: 5, post: 1, perimeter: 1, strength: 1, vertical: 4 },
  );
});
