import ICAL from "ical.js";

export const DAY = 86_400_000;
const ICAL_CACHE_ENTRIES = 128;
const ICAL_CACHE_ROWS = 2048;
const ICAL_CACHE_TEXT_LIMIT = 65_536;
const icalWindows = new Map();

// Cache only temporal templates: edits and cloned state must retain their current metadata.
function calendarWindow(text, from, to) {
  const bounded =
    Number.isFinite(+from) &&
    Number.isFinite(+to) &&
    from < to &&
    text.length <= ICAL_CACHE_TEXT_LIMIT;
  const lower = bounded ? new Date(Math.floor(+from / DAY) * DAY) : from;
  const upper = bounded ? new Date(Math.ceil(+to / DAY) * DAY) : to;
  const key = bounded
    ? JSON.stringify([text, +lower, +upper, Intl.DateTimeFormat().resolvedOptions().timeZone])
    : null;
  const cached = icalWindows.get(key);
  if (cached) {
    icalWindows.delete(key);
    icalWindows.set(key, cached);
    // Registration is observable by other calendars with externally defined TZIDs.
    for (const zone of cached.zones) ICAL.TimezoneService.register(zone);
    return cached;
  }
  const expanded = expandCalendar(text, lower, upper);
  if (bounded && expanded.cacheable && expanded.rows.length <= ICAL_CACHE_ROWS) {
    icalWindows.set(key, expanded);
    if (icalWindows.size > ICAL_CACHE_ENTRIES) icalWindows.delete(icalWindows.keys().next().value);
  }
  return expanded;
}

function expandCalendar(text, from, to) {
  const component = new ICAL.Component(ICAL.parse(text));
  const zones = component.getAllSubcomponents("vtimezone").map((zone) => new ICAL.Timezone(zone));
  for (const zone of zones) ICAL.TimezoneService.register(zone);
  const defined = new Set(zones.map((zone) => zone.tzid));
  const expanded = { rows: [], zones, cacheable: true, exceptionAdvance: 0 };
  const pending = [component];
  while (pending.length) {
    const child = pending.pop();
    for (const property of child.getAllProperties()) {
      const tzid = property.getParameter("tzid");
      if (tzid && !defined.has(tzid)) expanded.cacheable = false;
    }
    pending.push(...child.getAllSubcomponents());
  }
  const add = (s, e, extra, recurrence) => {
    if (s < to && (e > from || (+e === +s && s >= from)))
      expanded.rows.push({ start: +s, end: +e, extra, recurrence });
  };
  const components = component.getAllSubcomponents("vevent");
  const master = components.find((c) => !c.hasProperty("recurrence-id"));
  if (!master) return expanded;
  const event = new ICAL.Event(master);
  const cancelledIds = new Set(),
    cancelledRanges = [];
  let exceptionAdvance = 0;
  for (const exception of components.filter((c) => c.hasProperty("recurrence-id"))) {
    if (exception.getFirstPropertyValue("status") === "CANCELLED") {
      const recurrenceId = exception.getFirstPropertyValue("recurrence-id");
      cancelledIds.add(recurrenceId.toString());
      cancelledIds.add(recurrenceId.convertToZone(ICAL.Timezone.utcTimezone).toString());
      if (exception.getFirstProperty("recurrence-id").getParameter("range") === "THISANDFUTURE")
        cancelledRanges.push(+recurrenceId.toJSDate());
    } else {
      const instance = new ICAL.Event(exception);
      exceptionAdvance = Math.max(
        exceptionAdvance,
        +instance.recurrenceId.toJSDate() - +instance.startDate.toJSDate(),
      );
      event.relateException(instance);
    }
  }
  expanded.exceptionAdvance = exceptionAdvance;
  if (!event.isRecurring()) {
    add(event.startDate.toJSDate(), event.endDate.toJSDate());
    return expanded;
  }
  const iterator = event.iterator();
  let next,
    safety = 0;
  while ((next = iterator.next()) && safety++ < 100000) {
    if (+next.toJSDate() >= +to + exceptionAdvance) break;
    if (
      cancelledIds.has(next.toString()) ||
      cancelledIds.has(next.convertToZone(ICAL.Timezone.utcTimezone).toString()) ||
      cancelledRanges.some((start) => +next.toJSDate() >= start)
    )
      continue;
    const detail = event.getOccurrenceDetails(next);
    if (detail.item.component.getFirstPropertyValue("status") === "CANCELLED") continue;
    add(
      detail.startDate.toJSDate(),
      detail.endDate.toJSDate(),
      { title: detail.item.summary, location: detail.item.location },
      +next.toJSDate(),
    );
  }
  return expanded;
}

export const dateKey = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function emptyState() {
  return {
    version: 1,
    events: [],
    alarms: [],
    suggestions: [],
    accounts: [],
    alarmState: {},
    settings: {
      theme: "light",
      defaultReminder: 10,
      sound: "bell",
      volume: 0.6,
      startAtLogin: false,
    },
  };
}
export function validateEvent(item, alarm = false) {
  if (!item || typeof item.title !== "string" || !item.title.trim())
    throw new Error("Give it a title.");
  if (!Number.isFinite(new Date(item.start).getTime()))
    throw new Error("Choose a valid date and time.");
  if (
    !alarm &&
    (!Number.isFinite(new Date(item.end).getTime()) || new Date(item.end) <= new Date(item.start))
  )
    throw new Error("The end must be after the start.");
  if (
    item.reminder != null &&
    (!Number.isFinite(Number(item.reminder)) || item.reminder < 0 || item.reminder > 10080)
  )
    throw new Error("Reminder must be between 0 minutes and 7 days.");
  if (!["none", "daily", "weekdays", "weekly", "monthly", "yearly"].includes(item.repeat || "none"))
    throw new Error("Choose a supported repeat schedule.");
  return { ...item, title: item.title.trim().slice(0, 300) };
}

export function occurrences(item, from, to) {
  from = new Date(from);
  to = new Date(to);
  if (item.cancelled || item.enabled === false) return [];
  const start = new Date(item.start),
    end = new Date(item.end || item.start);
  if (!Number.isFinite(+start) || !Number.isFinite(+end)) return [];
  const duration = Math.max(0, +end - +start);
  const calendarDays = Math.max(
    1,
    Math.round(
      (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
        Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
        DAY,
    ),
  );
  const result = [];
  const add = (
    s,
    e = item.allDay
      ? new Date(s.getFullYear(), s.getMonth(), s.getDate() + calendarDays)
      : new Date(+s + duration),
    extra = {},
  ) => {
    if (s < to && (e > from || (+e === +s && s >= from)))
      result.push({
        ...item,
        ...extra,
        start: s.toISOString(),
        end: e.toISOString(),
        occurrenceId: `${item.id}@${s.toISOString()}`,
      });
  };
  if (item.ical) {
    const expanded = calendarWindow(item.ical, from, to);
    for (const row of expanded.rows) {
      // Preserve the original iterator cutoff as well as the exact overlap bounds.
      if (row.recurrence != null && row.recurrence >= +to + expanded.exceptionAdvance) continue;
      add(
        new Date(row.start),
        new Date(row.end),
        row.extra
          ? { title: row.extra.title || item.title, location: row.extra.location || item.location }
          : {},
      );
    }
    return result;
  }
  if (!item.repeat || item.repeat === "none") {
    add(start, end);
    return result;
  }
  const cursor = new Date(
    Math.max(
      +new Date(
        from.getFullYear(),
        from.getMonth(),
        from.getDate() - Math.ceil(duration / DAY) - 1,
      ),
      +new Date(start.getFullYear(), start.getMonth(), start.getDate()),
    ),
  );
  // Advance calendar dates, not milliseconds: local alarms keep their wall time across DST.
  for (
    let safety = 0;
    cursor < to && safety < 4000;
    safety++, cursor.setDate(cursor.getDate() + 1)
  ) {
    const candidate = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate(),
      start.getHours(),
      start.getMinutes(),
      start.getSeconds(),
    );
    if (candidate < start) continue;
    const matches =
      item.repeat === "daily" ||
      (item.repeat === "weekdays" && candidate.getDay() > 0 && candidate.getDay() < 6) ||
      (item.repeat === "weekly" && candidate.getDay() === start.getDay()) ||
      (item.repeat === "monthly" && candidate.getDate() === start.getDate()) ||
      (item.repeat === "yearly" &&
        candidate.getDate() === start.getDate() &&
        candidate.getMonth() === start.getMonth());
    if (matches) add(candidate);
  }
  return result;
}

export function collectDue(state, now = new Date()) {
  now = new Date(now);
  const result = [],
    records = state.alarmState || {};
  const from = new Date(+now - 7 * DAY),
    to = new Date(+now + 8 * DAY);
  for (const [kind, items] of [
    ["event", state.events],
    ["alarm", state.alarms],
  ]) {
    for (const item of items || []) {
      if (kind === "event" && item.reminder == null) continue;
      for (const occurrence of occurrences(
        kind === "alarm" ? { ...item, end: item.start } : item,
        from,
        to,
      )) {
        const dueAt = new Date(
          +new Date(occurrence.start) - (kind === "event" ? Number(item.reminder) * 60000 : 0),
        );
        const key = `${kind}:${occurrence.occurrenceId}`;
        if (dueAt > now || dueAt < from || records[key]) continue;
        result.push({
          key,
          kind,
          itemId: item.id,
          title: occurrence.title,
          start: occurrence.start,
          dueAt: dueAt.toISOString(),
          missed: +now - +dueAt > 60000,
          sound: item.sound || state.settings?.sound || "bell",
        });
      }
    }
  }
  for (const record of Object.values(records))
    if (
      record.status === "snoozed" &&
      new Date(record.snoozedUntil) <= now &&
      reminderIsValid(state, record)
    )
      result.push({ ...record, status: "ringing" });
  return result;
}

function reminderIsValid(state, record) {
  if (!record.itemId || record.kind === "test") return true;
  const item = (record.kind === "alarm" ? state.alarms : state.events).find(
    (e) => e.id === record.itemId,
  );
  if (!item || item.cancelled || item.enabled === false) return false;
  const start = new Date(record.start);
  return occurrences(
    record.kind === "alarm" ? { ...item, end: item.start } : item,
    new Date(+start - 1),
    new Date(+start + 1),
  ).some((e) => +new Date(e.start) === +start);
}
export function reconcileReminders(state) {
  for (const [key, record] of Object.entries(state.alarmState))
    if (record.status !== "dismissed" && !reminderIsValid(state, record))
      delete state.alarmState[key];
  return state;
}

export function allOccurrences(state, from, to) {
  return (state.events || [])
    .flatMap((item) => occurrences(item, from, to))
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
}
