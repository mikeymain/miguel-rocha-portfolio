import ICAL from "ical.js";

export const DAY = 86_400_000;
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
    const component = new ICAL.Component(ICAL.parse(item.ical));
    for (const zone of component.getAllSubcomponents("vtimezone"))
      ICAL.TimezoneService.register(new ICAL.Timezone(zone));
    const components = component.getAllSubcomponents("vevent");
    const master = components.find((c) => !c.hasProperty("recurrence-id"));
    if (!master) return [];
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
    if (!event.isRecurring()) {
      add(event.startDate.toJSDate(), event.endDate.toJSDate());
      return result;
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
      add(detail.startDate.toJSDate(), detail.endDate.toJSDate(), {
        title: detail.item.summary || item.title,
        location: detail.item.location || item.location,
      });
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
