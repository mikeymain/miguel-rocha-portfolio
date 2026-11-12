import { sportsSettings, validateSportsSettings } from "./sports.js";
import { emptyState, validateEvent, reconcileReminders } from "./calendar.js";
import { mergeInvitations, parseCalendar, suggestFromText } from "./imports.js";
import { parseBirthdays } from "./birthdays.js";

export function validateBackup(input) {
  if (
    !input ||
    input.version !== 1 ||
    !Array.isArray(input.events) ||
    !Array.isArray(input.alarms) ||
    !Array.isArray(input.suggestions)
  )
    throw new Error("This is not a valid Aurora backup.");
  const result = {
    ...emptyState(),
    ...input,
    settings: { ...emptyState().settings, ...input.settings },
  };
  if (result.settings.sports != null) validateSportsSettings(result.settings.sports);
  for (const event of result.events) if (!event.cancelled && !event.detached) validateEvent(event);
  for (const alarm of result.alarms) validateEvent(alarm, true);
  if (
    !result.alarmState ||
    typeof result.alarmState !== "object" ||
    Array.isArray(result.alarmState)
  )
    throw new Error("Invalid alarm history in backup.");
  return result;
}
export function applyAction(state, action) {
  const next = structuredClone(state);
  const upsert = (key, item) => {
    const index = next[key].findIndex((e) => e.id === item.id);
    if (index < 0) next[key].push(item);
    else next[key][index] = item;
  };
  const clearReminders = (id) => {
    for (const [key, value] of Object.entries(next.alarmState))
      if (value.itemId === id && value.status !== "dismissed") delete next.alarmState[key];
  };
  switch (action.type) {
    case "saveEvent":
    case "saveAlarm": {
      const isAlarm = action.type === "saveAlarm";
      const item = validateEvent(action.item, isAlarm);
      item.id ||= crypto.randomUUID();
      const previous = next[isAlarm ? "alarms" : "events"].find((e) => e.id === item.id);
      if (
        previous &&
        (previous.start !== item.start ||
          previous.reminder !== item.reminder ||
          item.enabled === false)
      )
        clearReminders(item.id);
      upsert(isAlarm ? "alarms" : "events", item);
      break;
    }
    case "deleteEvent":
    case "deleteAlarm": {
      const key = action.type === "deleteEvent" ? "events" : "alarms";
      next[key] = next[key].filter((e) => e.id !== action.id);
      clearReminders(action.id);
      break;
    }
    case "settings": {
      const patch = action.settings || {};
      if (patch.theme && !["light", "dark", "system"].includes(patch.theme))
        throw new Error("Choose a valid theme.");
      if (
        patch.volume != null &&
        (!Number.isFinite(patch.volume) || patch.volume < 0 || patch.volume > 1)
      )
        throw new Error("Choose a volume between 0 and 100%.");
      if (patch.sports) {
        validateSportsSettings(patch.sports);
        const current = sportsSettings(next.settings);
        next.settings = {
          ...next.settings,
          ...patch,
          sports: {
            ...current,
            ...patch.sports,
            teams: { ...current.teams, ...patch.sports.teams },
          },
        };
        break;
      }
      next.settings = { ...next.settings, ...patch };
      break;
    }
    case "dismiss":
    case "snooze": {
      if (!next.alarmState[action.key]) throw new Error("This alarm is no longer active.");
      const minutes = Number(action.minutes || 5);
      if (action.type === "snooze" && (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440))
        throw new Error("Choose a snooze from 1 minute to 1 day.");
      next.alarmState[action.key] = {
        ...next.alarmState[action.key],
        status: action.type === "dismiss" ? "dismissed" : "snoozed",
        snoozedUntil:
          action.type === "snooze"
            ? new Date(Date.now() + minutes * 60000).toISOString()
            : undefined,
      };
      break;
    }
    case "acceptSuggestion": {
      const suggestion = next.suggestions.find((s) => s.id === action.id);
      if (!suggestion || suggestion.status !== "pending") break;
      const item = validateEvent({ ...suggestion, ...action.item, id: suggestion.id });
      upsert("events", item);
      suggestion.status = "accepted";
      break;
    }
    case "rejectSuggestion": {
      const suggestion = next.suggestions.find((s) => s.id === action.id);
      if (suggestion) suggestion.status = "dismissed";
      break;
    }
    case "importCalendar":
      next.events = mergeInvitations(next.events, parseCalendar(action.text, action.source));
      reconcileReminders(next);
      break;
    case "importBirthdays": {
      const birthdays = parseBirthdays(action.text, action.source);
      if (!birthdays.length)
        throw new Error(
          "No birthday dates were found in this contact file. Check that birthdays are saved on the contacts you exported.",
        );
      next.events = mergeInvitations(next.events, birthdays);
      reconcileReminders(next);
      break;
    }
    case "importText": {
      const suggestions = suggestFromText(action.mail);
      for (const item of suggestions)
        if (!next.suggestions.some((s) => s.id === item.id)) next.suggestions.push(item);
      break;
    }
    default:
      throw new Error("Unsupported action.");
  }
  return next;
}
