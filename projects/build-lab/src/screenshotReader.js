import { attributes, normalizeBuild } from "./data.js";
import { capProjection } from "./engine/capProjections.js";

// Layout of the in-game "Attribute Upgrades" screen at 1920×1080. Other 16:9
// sizes are scaled to this frame. Each column shows the base rating at the top
// ("70 Max") and the rating after cap breakers at the bottom.
const FRAME = { width: 1920, height: 1080 };
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

// Crop a frame region, scale it up and turn it into dark text on white.
// `adaptive` picks the threshold per crop (Otsu) for the dim base numbers and
// takes the smaller brightness class as text; otherwise bright text (white or
// yellow) is kept and light crops (the selected column) are inverted first.
function textCrop(image, { left, top, right, bottom }, adaptive = false) {
  const sx = image.naturalWidth / FRAME.width,
    sy = image.naturalHeight / FRAME.height;
  const width = Math.round((right - left) * SCALE),
    height = Math.round((bottom - top) * SCALE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(
    image,
    left * sx,
    top * sy,
    (right - left) * sx,
    (bottom - top) * sy,
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

// Read body and ratings from an Attribute Upgrades screenshot. Values that
// cannot be read come back as null for the user to fill in.
export async function readBuildScreenshot(file, onProgress = () => {}) {
  const image = await loadImage(file);
  const ratio = image.naturalWidth / image.naturalHeight;
  if (Math.abs(ratio - 16 / 9) > 0.04)
    throw new Error("Use a full 16:9 screenshot of the Attribute Upgrades screen.");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    const header = await worker.recognize(textCrop(image, HEADER));
    const body = parseHeader(header.data.text);
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789",
      tessedit_pageseg_mode: "7",
    });
    const base = {},
      finals = {};
    for (const [index, { id }] of attributes.entries()) {
      const x = COLUMN_X[index];
      base[id] = await readNumber(
        worker,
        textCrop(image, { left: x - HALF_WIDTH, right: x + HALF_WIDTH, ...BASE_BAND }, true),
      );
      finals[id] = await readNumber(
        worker,
        textCrop(image, { left: x - HALF_WIDTH, right: x + HALF_WIDTH, ...FINAL_BAND }),
      );
      onProgress((index + 1) / attributes.length);
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
