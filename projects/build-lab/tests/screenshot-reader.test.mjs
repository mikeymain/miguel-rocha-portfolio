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

test("column fit recovers scale and offset from a partial, noisy row of numbers", async () => {
  const { fitColumns } = await import("../src/screenshotReader.js");
  const reference = [
    113, 192, 270, 349, 428, 535, 614, 692, 798, 877, 956, 1062, 1142, 1220, 1298, 1405, 1484, 1591,
    1670, 1749, 1827,
  ];
  const found = reference
    .map((x, index) => 0.7 * x - 40 + (index % 3) - 1)
    .filter((_, index) => ![2, 9, 15].includes(index));
  found.push(5);
  const fit = fitColumns(found, reference);
  assert.ok(Math.abs(fit.scale - 0.7) < 0.01);
  assert.ok(Math.abs(fit.offset + 40) < 3);
  assert.equal(fit.matched, 18);
  assert.equal(fitColumns([10, 20, 30], reference), null);
});

test("number boxes group into rows and readings are decided by vote", async () => {
  const { numberRows, voteReading } = await import("../src/screenshotReader.js");
  const rows = numberRows([
    { x: 1, y: 921, height: 27 },
    { x: 2, y: 214, height: 15 },
    { x: 3, y: 924, height: 27 },
    { x: 4, y: 216, height: 15 },
  ]);
  assert.deepEqual(
    rows.map((row) => row.map((box) => box.x)),
    [
      [2, 4],
      [1, 3],
    ],
  );
  assert.equal(voteReading([71, 75, 75, null]), 75);
  assert.equal(voteReading([77, null, 71]), 77);
  assert.equal(voteReading([null, null]), null);
});
