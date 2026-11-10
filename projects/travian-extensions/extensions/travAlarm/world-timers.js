/**
 * TRAVALARM - GAME WORLD TIMERS
 * Countdown to the end of the game world's starting beginner's protection.
 * Oasis animals start respawning at the same moment.
 *
 * World start time and speed come from the public game world calendar
 * (fetched by the background worker) and are cached per host, because the
 * calendar drops a world a few days after it starts.
 */

// Base protection days per world speed (optional per-player extension excluded).
// https://support.travian.com/en/articles/20-game-versions-and-speed
const WORLD_PROTECTION_DAYS = { 1: 5, 2: 3, 3: 3, 5: 2, 10: 1 };
const WORLD_CACHE_KEY = "_twWorld";
const WORLD_RETRY_KEY = `_twWorldTry_${location.hostname}`;
const WORLD_RETRY_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

let worldProtectionEnd = null; // ms timestamp, or null when unknown
let worldRowsLastText = "";

/** Falls back to the speed in hosts such as ts21.x2.international.travian.com. */
function speedFromHost() {
  const m = location.hostname.match(/(?:^|\.)x(\d+)\./);
  return m ? Number(m[1]) : null;
}

/** @returns {number|null} protection end in ms */
function computeProtectionEnd(world) {
  if (!world || !Number.isFinite(world.start)) return null;
  const days = WORLD_PROTECTION_DAYS[world.speed ?? speedFromHost()];
  if (!days) return null;
  return world.start * 1000 + days * DAY_MS;
}

async function readCachedWorld() {
  const res = await api.storage.local.get({ [WORLD_CACHE_KEY]: {} });
  return res[WORLD_CACHE_KEY][location.hostname] || null;
}

async function cacheWorld(world) {
  const res = await api.storage.local.get({ [WORLD_CACHE_KEY]: {} });
  const next = { ...res[WORLD_CACHE_KEY], [location.hostname]: world };
  await api.storage.local.set({ [WORLD_CACHE_KEY]: next });
}

async function fetchWorldFromCalendar() {
  const lastTry = parseInt(localStorage.getItem(WORLD_RETRY_KEY), 10) || 0;
  if (Date.now() - lastTry < WORLD_RETRY_MS) return null;
  localStorage.setItem(WORLD_RETRY_KEY, String(Date.now()));
  try {
    const res = await api.runtime.sendMessage({
      type: "GET_WORLD_START",
      host: location.hostname,
    });
    if (!res?.world) return null;
    await cacheWorld(res.world);
    return res.world;
  } catch (err) {
    console.warn("[TravAlarm] world calendar lookup failed:", err);
    return null;
  }
}

/**
 * Loads the world start once at startup; renders on the next tick.
 * Hosts are reused across rounds, so a cached world whose protection has
 * already ended triggers a fresh calendar lookup.
 */
async function loadWorldTimers() {
  const cachedEnd = computeProtectionEnd(await readCachedWorld());
  worldProtectionEnd =
    cachedEnd !== null && cachedEnd > Date.now()
      ? cachedEnd
      : computeProtectionEnd(await fetchWorldFromCalendar());
  const alarms = buildWorldAlarms(worldProtectionEnd, Date.now());
  if (alarms.length > 0) {
    await api.runtime.sendMessage({ type: "REFRESH_ALARMS", buildings: alarms });
  }
}

const OASIS_WARNING_MS = 45 * 60 * 1000;

/**
 * Alarms for the end of the world's base beginner's protection: a warning
 * 45 minutes before oasis animals respawn, and the protection end itself.
 * Matched by name in the background, so repeat page loads update them in place.
 * Only future times are sent, so a fired alarm is not recreated.
 */
function buildWorldAlarms(protectionEnd, now) {
  if (protectionEnd === null) return [];
  return [
    { name: `⭐ Oasis respawn in 45 min ${serverTag}`, at: protectionEnd - OASIS_WARNING_MS },
    { name: `⭐ Beginner's protection ends ${serverTag}`, at: protectionEnd },
  ]
    .filter((a) => a.at > now)
    .map((a) => ({ name: a.name, delay: a.at - now, customType: "world" }));
}

/** Formats seconds as "Dd H:MM:SS" when over a day, else H:MM:SS. */
function formatWorldCountdown(totalSeconds) {
  const d = (totalSeconds / 86400) | 0;
  const rest = formatHMS(totalSeconds % 86400);
  return d > 0 ? `${d}d ${rest}` : rest;
}

/** Called from tick() once per second. */
function renderWorldTimers(now) {
  const footer = document.getElementById("_tw-world");
  if (!footer) return;
  const remainingMs = worldProtectionEnd === null ? 0 : worldProtectionEnd - now;
  if (remainingMs <= 0) {
    if (!footer.hidden) {
      footer.hidden = true;
      updateSectionHeights(listContainer);
    }
    return;
  }
  if (footer.hidden) {
    footer.hidden = false;
    const endText = new Date(worldProtectionEnd).toLocaleString([], {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    footer.querySelectorAll(".tw-world-row").forEach((row) => {
      row.title = endText;
    });
    updateSectionHeights(listContainer);
  }
  const text = formatWorldCountdown((remainingMs / 1000) | 0);
  if (text === worldRowsLastText) return;
  worldRowsLastText = text;
  footer.querySelectorAll(".tw-world-time").forEach((el) => {
    el.textContent = text;
  });
}
