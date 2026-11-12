import ICAL from "ical.js";

// Builds the iCalendar text Aurora sends to iCloud when an event is edited or created.
// Only fields that actually changed are rewritten; everything else from the phone is kept.

const REPEAT_RULES = {
  daily: "FREQ=DAILY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MINUTE_MS = 60000;
const PRODID = "-//Aurora//EN";

const utc = (date) => ICAL.Time.fromJSDate(new Date(date), true);
function localDate(iso) {
  const d = new Date(iso);
  return new ICAL.Time({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    isDate: true,
  });
}
// Wall-clock time in a named zone, so repeating events keep their local time across clock changes.
function zonedTime(iso, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, Number(p.value)]),
  );
  return new ICAL.Time({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  });
}
function setTime(component, name, iso, allDay, timeZone) {
  component.removeAllProperties(name);
  const property = new ICAL.Property(name);
  if (allDay) property.setValue(localDate(iso));
  else if (timeZone) {
    property.setValue(zonedTime(iso, timeZone));
    property.setParameter("tzid", timeZone);
  } else property.setValue(utc(iso));
  component.addProperty(property);
}
function setText(component, name, value) {
  component.removeAllProperties(name);
  if (value) component.addPropertyWithValue(name, String(value));
}
function setTiming(component, { start, end, allDay }, timeZone) {
  const fallback = allDay ? DAY_MS : HOUR_MS;
  const safeEnd =
    +new Date(end) > +new Date(start) ? end : new Date(+new Date(start) + fallback).toISOString();
  component.removeAllProperties("duration");
  setTime(component, "dtstart", start, allDay, timeZone);
  setTime(component, "dtend", safeEnd, allDay, timeZone);
}
function stamp(component, now) {
  component.updatePropertyWithValue("last-modified", utc(now));
  component.updatePropertyWithValue("dtstamp", utc(now));
}
// The editor works in whole minutes, so seconds in a phone event never count as a time change.
const minute = (iso) => Math.floor(+new Date(iso) / MINUTE_MS);
const timingChanged = (event, item) =>
  minute(item.start) !== minute(event.start) ||
  minute(item.end) !== minute(event.end) ||
  Boolean(item.allDay) !== Boolean(event.allDay);
const text = (value) => value || "";

export function isRepeating(event) {
  return /^(RRULE|RDATE|RECURRENCE-ID)[:;]/m.test(event.ical || "");
}

// True when an edit touches something stored on iCloud (reminder and category stay in Aurora).
export function remoteFieldsChanged(event, item) {
  return (
    text(item.title) !== text(event.title) ||
    text(item.location) !== text(event.location) ||
    text(item.notes) !== text(event.notes) ||
    timingChanged(event, item)
  );
}

export function editedEventIcs(event, item, now = new Date(), { timeZone } = {}) {
  if (!event.ical)
    throw new Error("This event has no iCloud data to update. Sync iCloud and try again.");
  const calendar = new ICAL.Component(ICAL.parse(event.ical));
  const master = calendar
    .getAllSubcomponents("vevent")
    .find(
      (c) => c.getFirstPropertyValue("uid") === event.externalId && !c.hasProperty("recurrence-id"),
    );
  if (!master)
    throw new Error(
      "Aurora could not find this event in its iCloud data. Sync iCloud and try again.",
    );
  if (timingChanged(event, item)) {
    if (isRepeating(event))
      throw new Error(
        "Change the time of repeating events on your iPhone. You can still edit the title, place and notes here.",
      );
    setTiming(master, item, timeZone);
  }
  if (text(item.title) !== text(event.title)) setText(master, "summary", item.title);
  if (text(item.location) !== text(event.location)) {
    setText(master, "location", item.location);
    master.removeAllProperties("x-apple-structured-location");
  }
  if (text(item.notes) !== text(event.notes)) setText(master, "description", item.notes);
  if (!calendar.getFirstPropertyValue("prodid")) calendar.updatePropertyWithValue("prodid", PRODID);
  master.updatePropertyWithValue(
    "sequence",
    Number(master.getFirstPropertyValue("sequence") || 0) + 1,
  );
  stamp(master, now);
  return calendar.toString();
}

export function newEventIcs(item, uid, now = new Date(), { timeZone } = {}) {
  const calendar = new ICAL.Component("vcalendar");
  calendar.updatePropertyWithValue("version", "2.0");
  calendar.updatePropertyWithValue("prodid", PRODID);
  const event = new ICAL.Component("vevent");
  event.updatePropertyWithValue("uid", uid);
  event.updatePropertyWithValue("sequence", 0);
  setTiming(event, item, timeZone);
  setText(event, "summary", item.title);
  setText(event, "location", item.location);
  setText(event, "description", item.notes);
  if (REPEAT_RULES[item.repeat])
    event.addPropertyWithValue("rrule", ICAL.Recur.fromString(REPEAT_RULES[item.repeat]));
  stamp(event, now);
  calendar.addSubcomponent(event);
  return calendar.toString();
}
