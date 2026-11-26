/**
 * TRAVIAN WATCHMAN PRO - STATE & CONFIGURATION
 */

/* global browser, chrome */

// Universal API shim (browser for Firefox, chrome for Chrome/MV3)
const api = typeof browser !== "undefined" ? browser : chrome;

// After the extension reloads or updates, this tab's old content script loses
// its connection. Every extension call then rejects with "Extension context
// invalidated". Stop work and drop those rejections instead of logging them.
function isContextAlive() {
  try {
    return !!api.runtime?.id;
  } catch {
    return false;
  }
}

window.addEventListener("unhandledrejection", (e) => {
  const msg = String(e.reason?.message || e.reason || "");
  if (msg.includes("Extension context invalidated")) e.preventDefault();
});

// ==========================================
// CONFIGURATION & STATE
// ==========================================
let silencedAlarms = new Set();
let currentAlarms = [];

const uiRefs = new Map();
const firstSeenTimes = new Map(); // uid → Date.now() when first encountered (for progress bars)
const collapsedSections = new Set(); // section type keys that are manually collapsed
const expandedSections = new Set(); // section type keys that are manually expanded

let lastRallyFetchTime = 0;
let isFetchingRally = false;
let tooltipEl = null;

let globalVillageMap = {};

// village name → color slot index (persisted via _tw_vc) for the village dots
const villageColorSlots = new Map();

// Fetch throttle state — isFetching + lastTime per data source
const fetchState = {
  prod: { isFetching: false, lastTime: 0 },
  training: { isFetching: false, lastTime: 0 },
  warehouse: { isFetching: false, lastTime: 0 },
  celebrations: { isFetching: false, lastTime: 0 },
  hero: { isFetching: false, lastTime: 0 },
};

/** Randomises a delay to 70–150% so requests don't follow a fixed rhythm. */
const jitterMs = (ms) => Math.round(ms * (0.7 + Math.random() * 0.8));

let _firedResourceAlarms = new Set();

// Production data cache: replaces localStorage _wpt_/_wpm_ keys.
// Keyed by `${serverTag}_${villageName}` → { total: number, map: object }.
// Populated from chrome.storage.local on startup; written back on change.
const _prodCache = new Map();
async function loadProdCache() {
  const data = await api.storage.local.get("_prodCache");
  if (data._prodCache) {
    for (const [k, v] of Object.entries(data._prodCache)) _prodCache.set(k, v);
  }
}
function writeProdCache(key, total, prodMap) {
  _prodCache.set(key, { total, map: prodMap });
  const obj = Object.fromEntries(_prodCache);
  api.storage.local.set({ _prodCache: obj });
}
function readProdTotal(key) {
  return _prodCache.get(key)?.total ?? null;
}
function readProdMap(key) {
  return _prodCache.get(key)?.map ?? null;
}

// ==========================================
// SERVER TAG GENERATION
// ==========================================
const generateServerTag = () => {
  const host = window.location.hostname
    .replace(/^www\./, "")
    .replace(/\.travian\.[a-z]+$/, "");

  const regionShorteners = {
    europe: "eur",
    america: "ame",
    arabia: "ara",
    international: "int",
    hispano: "esp",
    nordic: "nor",
    balkans: "blk",
    asia: "asi",
    com: "",
  };

  const parts = host
    .split(".")
    .map((part) => regionShorteners[part] ?? part)
    .filter((p) => p !== "");

  return `[${parts.join(".")}]`;
};

const serverTag = generateServerTag();

const DEFAULT_SHORTCUTS = [
  { label: "10m", minutes: 10 },
  { label: "15m", minutes: 15 },
  { label: "20m", minutes: 20 },
  { label: "30m", minutes: 30 },
];

const cleanText = (str) => str.replace(/\s+/g, " ").trim();
const cleanCoords = (str) => str.replace(/[^\d|−-]/g, "").replace("−", "-");

