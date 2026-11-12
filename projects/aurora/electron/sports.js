// Keeps followed teams' schedules fresh, stores them in sports.json next to the calendar data,
// and shows a Windows notification shortly before each game.
import { Notification, shell } from "electron";
import { join } from "node:path";
import { boxScoreUrl, parseBoxScore } from "../src/core/boxscore.js";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { STREAM_HOST, streamUrl } from "../src/core/streams.js";
import {
  emptySports,
  refreshSports,
  dueSportsAlerts,
  pruneSent,
  teamCatalog,
  searchUrl,
  parseTeamSearch,
} from "../src/core/sports.js";

const REQUEST_TIMEOUT_MS = 20_000;
const STREAM_TIMEOUT_MS = 10_000;
export const SPORTS_LINK_HOSTS = ["www.espn.com", "www.formula1.com"];

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Aurora/0.1" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`the server answered ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`the server answered ${response.status}`);
  return response.text();
}

const BRAVE_PATHS = [
  join(
    process.env.ProgramFiles || "C:\\Program Files",
    "BraveSoftware",
    "Brave-Browser",
    "Application",
    "brave.exe",
  ),
  join(
    process.env.LOCALAPPDATA || "",
    "BraveSoftware",
    "Brave-Browser",
    "Application",
    "brave.exe",
  ),
];

// Streams open in Brave, where the box score extension lives; the default browser otherwise.
function openStreamPage(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== STREAM_HOST)
    throw new Error("This link is not a stream page.");
  const brave = BRAVE_PATHS.find((p) => existsSync(p));
  if (!brave) return shell.openExternal(parsed.href);
  spawn(brave, [parsed.href], { detached: true, stdio: "ignore" }).unref();
}

function alertText(game, minutes, settings) {
  const team = teamCatalog(settings)[game.team]?.label || "Sports";
  const when = minutes > 0 ? `starts in ${minutes} min` : "starting now";
  const time = new Date(game.start).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return {
    title: `${team} ${when}`,
    body: `${game.title}\n${time}${game.venue ? ` · ${game.venue}` : ""}`,
  };
}

export function createSports({ dataDir, onChange, offline = false }) {
  const file = join(dataDir, "sports.json");
  let data = emptySports();
  let refreshing = false;
  const notifications = new Set();

  if (existsSync(file)) {
    try {
      data = { ...emptySports(), ...JSON.parse(readFileSync(file, "utf8")) };
    } catch (error) {
      console.error("Sports cache could not be read; starting fresh:", error.message);
    }
  }

  const save = () => {
    try {
      const temp = `${file}.tmp`;
      writeFileSync(temp, JSON.stringify(data));
      renameSync(temp, file);
    } catch (error) {
      console.error("Sports cache could not be saved:", error.message);
    }
  };
  let inflight = null;

  // Resolves the stream page from the cached game (never from a renderer-supplied URL) and opens it.
  async function openStream(gameId, settings) {
    const game = Object.values(data.events || {})
      .flat()
      .find((g) => g.id === gameId);
    if (!game) throw new Error("Choose a game.");
    const entry = teamCatalog(settings)[game.team] || {};
    const url = offline ? null : await streamUrl(game, entry, fetchText);
    if (url) openStreamPage(url);
  }

  return {
    snapshot: () => ({
      events: data.events,
      fetched: data.fetched,
      errors: data.errors,
      rosters: data.rosters || {},
      refreshing,
    }),

    // One download at a time. A forced update that arrives mid-download runs again once it finishes.
    async refresh(settings, force = false) {
      if (offline) return;
      while (inflight) {
        await inflight;
        if (!force) return;
      }
      inflight = (async () => {
        refreshing = true;
        if (force) onChange();
        const errorsBefore = JSON.stringify(data.errors);
        let changed = false;
        try {
          const result = await refreshSports(data, settings, fetchJson, {
            force,
          });
          changed = result.changed;
          data = { ...result.next, sent: data.sent };
          if (changed) save();
        } finally {
          refreshing = false;
          inflight = null;
          if (force || changed || JSON.stringify(data.errors) !== errorsBefore) onChange();
        }
      })();
      return inflight;
    },

    openStream,

    // Fetches the box score for a cached game. The URL is built from cached ESPN data, never from the renderer.
    async boxScore(gameId) {
      if (offline) throw new Error("No box score while offline.");
      const game = Object.values(data.events || {})
        .flat()
        .find((g) => g.id === gameId);
      const url = boxScoreUrl(game);
      if (!url) throw new Error("No box score for this game.");
      return parseBoxScore(await fetchJson(url), game.summaryPath);
    },

    async search(query) {
      if (offline) return [];
      return parseTeamSearch(await fetchJson(searchUrl(query)));
    },

    checkAlerts(settings) {
      if (offline || !Notification.isSupported()) return;
      const due = dueSportsAlerts(data, settings, data.sent);
      if (!due.length) return;
      const now = new Date().toISOString();
      const sent = { ...pruneSent(data.sent) };
      for (const { game, key, minutes } of due) {
        const { title, body } = alertText(game, minutes, settings);
        const notification = new Notification({ title, body });
        // Keep a reference so the click handler survives garbage collection.
        notifications.add(notification);
        notification.on("click", () =>
          openStream(game.id, settings).catch((error) =>
            console.error("Stream link failed:", error.message),
          ),
        );
        notification.on("close", () => notifications.delete(notification));
        notification.show();
        sent[key] = now;
      }
      data = { ...data, sent };
      save();
    },
  };
}
