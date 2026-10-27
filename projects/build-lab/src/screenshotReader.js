import { attributes, normalizeBuild } from "./data.js";
import { capProjection } from "./engine/capProjections.js";

// Layout of the in-game "Attribute Upgrades" screen at 1920×1080, used as the
// reference frame. Screenshots are mapped onto it by a scale and offset found
// from the numbers under the bars, so cropped and resized captures work. Each
// column shows the base rating at the top ("70 Max") and the rating after cap
// breakers at the bottom.
const FRAME = { width: 1920, height: 1080 };
const FINAL_CENTER = 921;
const COLUMN_X = [
  113, 192, 270, 349, 428, 535, 614, 692, 798, 877, 956, 1062, 1142, 1220, 1298, 1405, 1484, 1591,
  1670, 1749, 1827,
];
const BASE_BAND = { top: 202, bottom: 226 };
const FINAL_BAND = { top: 898, bottom: 944 };
const HALF_WIDTH = 21;
const HEADER = { left: 1240, top: 46, right: 1580, bottom: 104 };
const SCALE = 4;
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

// Height, weight, wingspan and position from the header text, e.g.
// `HT: 6'6" | WT: 247 lbs | WS: 7'0"` and `SF | Bodybagger`.
export function parseHeader(text) {
  const clean = text.replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"');
  const feet = (label) => {
    const match = clean.match(new RegExp(`${label}\\s*[:;.]?\\s*(\\d)\\s*'\\s*(\\d{1,2})`, "i"));
    return match ? Number(match[1]) * 12 + Number(match[2]) : null;
  };
  const weight = clean.match(/WT\s*[:;.]?\s*(\d{3})/i);
  const position = clean.match(/\b(PG|SG|SF|PF|C)\b/);
  return {
    height: feet("HT"),
    weight: weight ? Number(weight[1]) : null,
    wingspan: feet("WS"),
    position: position ? position[1] : null,
  };
}

// Cap breakers needed to move each base rating to the final rating shown.
// Picks the count whose projected final is closest to the screenshot.
export function breakersForFinals(build, finals) {
  const breakers = {};
  for (const { id } of attributes) {
    const base = build.ratings[id],
      final = finals[id];
    if (!Number.isInteger(final) || final <= base) {
      breakers[id] = 0;
      continue;
    }
    const gains = capProjection(build, id).gains;
    let best = 0,
      bestGap = final - base,
      value = base;
    for (let count = 1; count <= Math.min(5, gains.length); count++) {
      value += Math.max(0, gains[count - 1] || 0);
      const gap = Math.abs(final - value);
      if (gap < bestGap) {
        best = count;
        bestGap = gap;
      }
    }
    breakers[id] = best;
  }
  return breakers;
}

// A legal build from the values read off the screenshot (after the review).
export function buildFromScreenshot({ body, base, finals, name = "Imported screenshot" }) {
  const draft = normalizeBuild({ name, body, ratings: base, breakers: {} });
  return normalizeBuild({ ...draft, breakers: breakersForFinals(draft, finals) });
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Otsu's threshold: the brightness split with the largest between-class variance.
export function otsuThreshold(histogram) {
  const total = histogram.reduce((sum, count) => sum + count, 0);
  const sum = histogram.reduce((acc, count, level) => acc + count * level, 0);
  let background = 0,
    backgroundSum = 0,
    best = 0,
    threshold = 128;
  for (let level = 0; level < 256; level++) {
    background += histogram[level];
    if (!background) continue;
    const foreground = total - background;
    if (!foreground) break;
    backgroundSum += level * histogram[level];
    const meanBack = backgroundSum / background,
      meanFore = (sum - backgroundSum) / foreground;
    const variance = background * foreground * (meanBack - meanFore) ** 2;
    if (variance > best) {
      best = variance;
      threshold = level;
    }
  }
  return threshold;
}

// Match number positions found in the image to the reference column centres.
// Tries every adjacent pair of found positions against every pair of columns
// and keeps the scale and offset that line up the most positions, then refits
// them with least squares. Returns null when fewer than four line up.
export function fitColumns(xs, reference = COLUMN_X) {
  const found = [...xs].sort((a, b) => a - b);
  const gap = Math.min(...reference.slice(1).map((x, index) => x - reference[index]));
  const matches = (scale, offset) => {
    const tolerance = 0.3 * gap * scale,
      pairs = [];
    let error = 0;
    for (const x of found) {
      let best = null;
      for (const [index, column] of reference.entries()) {
        const distance = Math.abs(scale * column + offset - x);
        if (distance < tolerance && (!best || distance < best.distance)) best = { index, distance };
      }
      if (best) {
        pairs.push([reference[best.index], x]);
        error += best.distance;
      }
    }
    return { pairs, error };
  };
  let best = null;
  for (let index = 0; index + 1 < found.length; index++) {
    for (let first = 0; first < reference.length; first++)
      for (let second = first + 1; second < reference.length; second++) {
        const scale = (found[index + 1] - found[index]) / (reference[second] - reference[first]);
        if (scale < 0.2 || scale > 5) continue;
        const offset = found[index] - scale * reference[first];
        const result = matches(scale, offset);
        if (
          !best ||
          result.pairs.length > best.pairs.length ||
          (result.pairs.length === best.pairs.length && result.error < best.error)
        )
          best = { ...result, scale, offset };
      }
  }
  if (!best || best.pairs.length < 4) return null;
  const count = best.pairs.length;
  const meanRef = best.pairs.reduce((sum, [ref]) => sum + ref, 0) / count,
    meanX = best.pairs.reduce((sum, [, x]) => sum + x, 0) / count;
  const covariance = best.pairs.reduce((sum, [ref, x]) => sum + (ref - meanRef) * (x - meanX), 0);
  const variance = best.pairs.reduce((sum, [ref]) => sum + (ref - meanRef) ** 2, 0);
  const scale = covariance / variance;
  return { scale, offset: meanX - scale * meanRef, matched: count };
}

// Group number boxes into rows by their vertical centre.
export function numberRows(boxes) {
  const sorted = [...boxes].sort((a, b) => a.y - b.y),
    rows = [];
  for (const box of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(box.y - row.at(-1).y) < 0.6 * Math.max(box.height, row.at(-1).height))
      row.push(box);
    else rows.push([box]);
  }
  return rows;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// Find where the columns are: OCR the whole screenshot, take the row of the
// large two-digit numbers along the bottom (ratings after cap breakers) and
// fit the column spacing to it. Works for full, cropped and resized captures.
async function locateLayout(worker, image) {
  const factor = FRAME.width / image.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = FRAME.width;
  canvas.height = Math.round(image.naturalHeight * factor);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  await worker.setParameters({ tessedit_pageseg_mode: "11", tessedit_char_whitelist: "" });
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
  const words = (data.blocks || []).flatMap((block) =>
    block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)),
  );
  const boxes = words
    .filter((word) => /^\d{2}$/.test(word.text.trim()))
    .map((word) => ({
      x: (word.bbox.x0 + word.bbox.x1) / 2 / factor,
      y: (word.bbox.y0 + word.bbox.y1) / 2 / factor,
      height: (word.bbox.y1 - word.bbox.y0) / factor,
    }));
  const rows = numberRows(boxes).filter((row) => row.length >= 4);
  const bottom = rows.sort(
    (a, b) =>
      median(b.map((box) => box.height)) - median(a.map((box) => box.height)) ||
      b.length - a.length,
  )[0];
  const fit = bottom && fitColumns(bottom.map((box) => box.x));
  const text = data.text || "";
  if (fit)
    return {
      scale: fit.scale,
      x0: fit.offset,
      y0: median(bottom.map((box) => box.y)) - fit.scale * FINAL_CENTER,
      text,
    };
  const ratio = image.naturalWidth / image.naturalHeight;
  if (Math.abs(ratio - 16 / 9) < 0.04)
    return { scale: image.naturalWidth / FRAME.width, x0: 0, y0: 0, text };
  return null;
}

// Crop a reference-frame region through the layout, scale it up and turn it
// into dark text on white. `adaptive` picks the threshold per crop (Otsu) for
// the dim base numbers and takes the smaller brightness class as text;
// otherwise bright text (white or yellow) is kept and light crops (the
// selected column) are inverted first.
function textCrop(image, layout, { left, top, right, bottom }, adaptive = false) {
  const width = Math.round((right - left) * SCALE),
    height = Math.round((bottom - top) * SCALE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.drawImage(
    image,
    layout.x0 + left * layout.scale,
    layout.y0 + top * layout.scale,
    (right - left) * layout.scale,
    (bottom - top) * layout.scale,
    0,
    0,
    width,
    height,
  );
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  const light = new Uint8ClampedArray(data.length / 4),
    histogram = new Array(256).fill(0);
  for (let index = 0; index < light.length; index++) {
    const offset = index * 4;
    light[index] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    histogram[light[index]]++;
  }
  const mean = light.reduce((total, value) => total + value, 0) / light.length;
  const threshold = adaptive ? otsuThreshold(histogram) : mean > 140 ? 95 : 160;
  const bright = light.reduce((count, value) => count + (value > threshold ? 1 : 0), 0);
  const textIsBright = adaptive ? bright < light.length / 2 : mean <= 140;
  for (let index = 0; index < light.length; index++) {
    const isText = textIsBright ? light[index] > threshold : light[index] <= threshold;
    const offset = index * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = isText ? 0 : 255;
    data[offset + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

const readNumber = async (worker, canvas) => {
  const { data } = await worker.recognize(canvas);
  const digits = data.text.replace(/\D/g, "");
  const value = digits.length >= 2 ? Number(digits.slice(0, 2)) : null;
  return value != null && value >= 25 && value <= 99 ? value : null;
};

// Crop offsets (reference pixels) tried for one cell, centre first.
const CELL_SHIFTS = [
  [0, 0],
  [-3, 0],
  [3, 0],
  [0, -2],
  [0, 2],
];

// Most common reading; ties go to the earliest (most central) crop.
export function voteReading(readings) {
  const counts = new Map();
  for (const value of readings) if (value != null) counts.set(value, (counts.get(value) || 0) + 1);
  let best = null;
  for (const value of readings)
    if (value != null && (best == null || counts.get(value) > counts.get(best))) best = value;
  return best;
}

// Read a cell from slightly shifted crops. Stops once two crops agree, unless
// `strict`, which votes over every shift.
async function readCell(worker, image, layout, region, adaptive, strict) {
  const readings = [];
  for (const [dx, dy] of CELL_SHIFTS) {
    const shifted = {
      left: region.left + dx,
      right: region.right + dx,
      top: region.top + dy,
      bottom: region.bottom + dy,
    };
    const value = await readNumber(worker, textCrop(image, layout, shifted, adaptive));
    if (!strict && value != null && readings.includes(value)) return value;
    readings.push(value);
  }
  return voteReading(readings);
}

// Read body and ratings from an Attribute Upgrades screenshot. Values that
// cannot be read come back as null for the user to fill in.
export async function readBuildScreenshot(file, onProgress = () => {}) {
  const image = await loadImage(file);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const layout = await locateLayout(worker, image);
    if (!layout)
      throw new Error(
        "Could not find the attribute columns. Use a screenshot of the Attribute Upgrades screen that shows the numbers under every bar.",
      );
    onProgress(0.2);
    // The header is often cropped off; fall back to the whole-screen text.
    let body = parseHeader(layout.text);
    if (
      layout.y0 + HEADER.top * layout.scale >= 0 &&
      Object.values(body).some((value) => value == null)
    ) {
      await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
      const header = parseHeader(
        (await worker.recognize(textCrop(image, layout, HEADER))).data.text,
      );
      body = Object.fromEntries(
        Object.entries(body).map(([key, value]) => [key, value ?? header[key]]),
      );
    }
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789",
      tessedit_pageseg_mode: "7",
    });
    const base = {},
      finals = {};
    for (const [index, { id }] of attributes.entries()) {
      const x = COLUMN_X[index];
      const cell = (band, adaptive, strict) =>
        readCell(
          worker,
          image,
          layout,
          { left: x - HALF_WIDTH, right: x + HALF_WIDTH, ...band },
          adaptive,
          strict,
        );
      // A player still being upgraded shows current ratings below "Max", so a
      // lower bottom number is not a misread. Dimmed columns need the adaptive
      // threshold for the bottom number.
      finals[id] = (await cell(FINAL_BAND, false, false)) ?? (await cell(FINAL_BAND, true, false));
      base[id] = await cell(BASE_BAND, true, false);
      onProgress(0.2 + (0.8 * (index + 1)) / attributes.length);
    }
    return {
      body: { ...body, position: POSITIONS.includes(body.position) ? body.position : null },
      base,
      finals,
    };
  } finally {
    await worker.terminate();
  }
}
