import { emptyState, collectDue } from "./core/calendar.js";
import { applyAction, validateBackup } from "./core/actions.js";
import { emptySports, refreshSports, searchUrl, parseTeamSearch } from "./core/sports.js";
import { boxScoreUrl, parseBoxScore } from "./core/boxscore.js";

export const desktop = Boolean(window.daybook);
const STORAGE = "daybook-preview-v1";
const subscribers = new Set();
let preview;
let previewSports = emptySports();
const fetchJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`the server answered ${r.status}`);
  return r.json();
};
function readPreview() {
  if (preview) return preview;
  try {
    const value = localStorage.getItem(STORAGE);
    preview = value ? validateBackup(JSON.parse(value)) : emptyState();
  } catch {
    preview = emptyState();
    preview.storageWarning =
      "Browser preview data could not be read. Use the Windows app for automatic backups.";
  }
  return preview;
}
function publish(state) {
  localStorage.setItem(STORAGE, JSON.stringify(state));
  preview = state;
  const publicValue = { ...state, desktop: false, sports: previewSports };
  for (const callback of subscribers) callback(publicValue);
  return publicValue;
}
export async function request(action) {
  if (desktop) return window.daybook.request(action);
  const state = readPreview();
  switch (action.type) {
    case "getState":
      return { ...state, desktop: false, sports: previewSports };
    case "boxScore": {
      const game = Object.values(previewSports.events || {})
        .flat()
        .find((g) => g.id === action.gameId);
      const url = boxScoreUrl(game);
      if (!url) throw new Error("No box score for this game.");
      return { box: parseBoxScore(await fetchJson(url), game.summaryPath) };
    }
    case "searchTeams": {
      const query = String(action.query || "").trim();
      if (query.length < 2 || query.length > 60)
        throw new Error("Type 2 to 60 characters to search.");
      return { results: parseTeamSearch(await fetchJson(searchUrl(query))) };
    }
    case "refreshSports": {
      previewSports = (
        await refreshSports(previewSports, state.settings, fetchJson, {
          force: true,
        })
      ).next;
      return publish(state);
    }
    case "testAlarm": {
      const next = structuredClone(state),
        key = `test:${Date.now()}`;
      next.alarmState[key] = {
        key,
        title: "This is your alarm",
        kind: "test",
        start: new Date().toISOString(),
        sound: state.settings.sound,
        status: "ringing",
      };
      return publish(next);
    }
    case "restorePreview":
      return publish(validateBackup(action.state));
    case "openExternal": {
      const url = new URL(action.url);
      if (url.protocol !== "https:") throw new Error("Only secure web links can be opened.");
      window.open(url.href, "_blank", "noopener,noreferrer");
      return { ...state, desktop: false };
    }
    case "openStream":
    case "sync":
    case "connectGoogle":
    case "connectICloud":
    case "disconnectGoogle":
    case "disconnectAccount":
    case "chooseSound":
      throw new Error("Open the Windows app to use this feature.");
    default:
      return publish(applyAction(state, action));
  }
}
export function subscribe(callback) {
  if (desktop) return window.daybook.subscribe(callback);
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}
if (!desktop)
  setInterval(() => {
    const state = readPreview(),
      due = collectDue(state);
    if (due.length) {
      const next = structuredClone(state);
      for (const alarm of due) next.alarmState[alarm.key] = { ...alarm, status: "ringing" };
      publish(next);
    }
  }, 1000);

let audioContext;
export function playSound(sound = "bell", settings = {}) {
  if (sound === "silent") return () => {};
  if (sound === "custom" && settings.customSound?.data) {
    const audio = new Audio(settings.customSound.data);
    audio.volume = settings.volume ?? 0.6;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
    };
  }
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return () => {};
  audioContext ||= new Context();
  audioContext.resume().catch(() => {});
  const nodes = [];
  const notes =
    sound === "pulse"
      ? [440, 440, 440]
      : sound === "chime"
        ? [523.25, 659.25, 783.99]
        : [880, 1174.66];
  notes.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator(),
      gain = audioContext.createGain(),
      time = audioContext.currentTime + index * 0.22;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime((settings.volume ?? 0.6) * 0.3, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.9);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(time);
    oscillator.stop(time + 1);
    nodes.push(oscillator);
  });
  return () =>
    nodes.forEach((node) => {
      try {
        node.stop();
      } catch {}
    });
}
