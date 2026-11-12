import ICAL from "ical.js";
import * as chrono from "chrono-node";

// Event titles that mark a birthday: "birthday", "aniversário", or the "bday" / "b-day" shorthand.
const BIRTHDAY_TITLE = /birthday|anivers[aá]rio|\bb-?day\b/i;
// Events from these sources are the user's own calendar entries; anything else came from an email.
const CALENDAR_SOURCES = new Set(["calendar-file", "google-calendar", "icloud-calendar"]);

// Email scanning: only whole booking words count, and a date must be explicit — a day with a
// month name, a numeric date that is not part of a link, or a weekday with a time.
// "today", "now", "3d" or a bare "December" never count.
const BOOKING_WORDS =
  /\b(booking|booked|reservation|reserved|appointment|meeting|flight|boarding|check-in|concert|tickets?|dentist|doctor|dinner|consulta|marcação|reunião|reserva|voo|bilhetes?)\b/i;
const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
const DAY_AND_MONTH = new RegExp(
  String.raw`\b\d{1,2}(?:st|nd|rd|th|º)?\s+(?:de\s+|of\s+)?(?:${MONTHS})\b|\b(?:${MONTHS})\.?\s+\d{1,2}(?:st|nd|rd|th)?\b`,
  "i",
);
const NUMERIC_DATE =
  /(?<![\w/.-])(?:\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?|\d{4}-\d{2}-\d{2})(?![\w/-])/;
const WEEKDAY =
  /\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b|\b(segunda|terça|quarta|quinta|sexta|sábado|domingo)\b/i;
const CLOCK_TIME = /\b\d{1,2}([:h.]\d{2})\b|\b\d{1,2}\s?(am|pm)\b/i;
const MAX_SUGGESTIONS_PER_EMAIL = 3;
const MAX_YEARS_AHEAD = 2;
const isExplicitDate = (phrase) =>
  DAY_AND_MONTH.test(phrase) ||
  NUMERIC_DATE.test(phrase) ||
  (WEEKDAY.test(phrase) && CLOCK_TIME.test(phrase));
const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const latestUseful = (now) => {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() + MAX_YEARS_AHEAD);
  return d;
};
const inUsefulRange = (start, now) => start >= startOfDay(now) && start <= latestUseful(now);
// English and Portuguese dates, without counting the same moment twice.
function findDates(text, reference) {
  const seen = new Set();
  return [
    ...chrono.parse(text, reference, { forwardDate: true }),
    ...chrono.pt.parse(text, reference, { forwardDate: true }),
  ]
    .sort((a, b) => a.index - b.index)
    .filter((match) => {
      const key = +match.start.date();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function parseCalendar(text, source = {}) {
  try {
    const root = new ICAL.Component(ICAL.parse(text));
    if (root.name !== "vcalendar") throw new Error("Not a calendar");
    for (const zone of root.getAllSubcomponents("vtimezone"))
      ICAL.TimezoneService.register(new ICAL.Timezone(zone));
    const components = root.getAllSubcomponents("vevent");
    if (!components.length) throw new Error("No events");
    const uids = [...new Set(components.map((c) => c.getFirstPropertyValue("uid")))];
    return uids.map((uid) => {
      if (!uid) throw new Error("An invitation is missing its UID");
      const group = components.filter((c) => c.getFirstPropertyValue("uid") === uid);
      const detached = !group.some((c) => !c.hasProperty("recurrence-id"));
      if (root.getFirstPropertyValue("method") === "CANCEL")
        for (const child of group) child.updatePropertyWithValue("status", "CANCELLED");
      const master = group.find((c) => !c.hasProperty("recurrence-id")) || group[0];
      const cancelled = !detached && master.getFirstPropertyValue("status") === "CANCELLED";
      const event = new ICAL.Event(master);
      const calendar = new ICAL.Component("vcalendar");
      calendar.updatePropertyWithValue("version", "2.0");
      for (const zone of root.getAllSubcomponents("vtimezone"))
        calendar.addSubcomponent(new ICAL.Component(zone.toJSON()));
      for (const child of group) calendar.addSubcomponent(new ICAL.Component(child.toJSON()));
      if (!cancelled && !detached && !event.startDate)
        throw new Error("An event is missing its start date");
      return {
        id: `ical:${uid}`,
        externalId: uid,
        sequence: Number(master.getFirstPropertyValue("sequence") || 0),
        modified:
          master.getFirstPropertyValue("last-modified")?.toString() ||
          master.getFirstPropertyValue("dtstamp")?.toString() ||
          "",
        title: event.summary || "Untitled event",
        ...(event.startDate
          ? {
              start: event.startDate.toJSDate().toISOString(),
              end: event.endDate.toJSDate().toISOString(),
            }
          : {}),
        allDay: Boolean(event.startDate?.isDate),
        location: event.location || "",
        notes: event.description || "",
        category: BIRTHDAY_TITLE.test(event.summary || "")
          ? "birthdays"
          : CALENDAR_SOURCES.has(source.type)
            ? "personal"
            : "email",
        repeat: "none",
        reminder: BIRTHDAY_TITLE.test(event.summary || "") ? 0 : 10,
        cancelled,
        detached,
        ical: calendar.toString(),
        source: { type: "calendar", ...source },
      };
    });
  } catch (error) {
    throw new Error(`Could not read this calendar file. ${error.message}`);
  }
}

export function mergeInvitations(existing, incoming) {
  const result = [...existing];
  for (const incomingEvent of incoming) {
    const { _completeSeries, ...event } = incomingEvent;
    const index = result.findIndex((e) => e.externalId && e.externalId === event.externalId);
    if (index < 0) {
      result.push(event);
      continue;
    }
    const previous = result[index];
    let update = event;
    if (previous.ical && event.ical && !_completeSeries) {
      const calendar = new ICAL.Component(ICAL.parse(previous.ical));
      const incomingCalendar = new ICAL.Component(ICAL.parse(event.ical));
      const identity = (component) =>
        component.getFirstPropertyValue("recurrence-id")?.toString() || "master";
      for (const child of incomingCalendar.getAllSubcomponents("vevent")) {
        const old = calendar
          .getAllSubcomponents("vevent")
          .find((c) => identity(c) === identity(child));
        if (old) {
          const oldSequence = Number(old.getFirstPropertyValue("sequence") || 0),
            newSequence = Number(child.getFirstPropertyValue("sequence") || 0);
          const oldStamp =
            (
              old.getFirstPropertyValue("last-modified") || old.getFirstPropertyValue("dtstamp")
            )?.toString() || "";
          const newStamp =
            (
              child.getFirstPropertyValue("last-modified") || child.getFirstPropertyValue("dtstamp")
            )?.toString() || "";
          if (
            newSequence < oldSequence ||
            (newSequence === oldSequence && newStamp && oldStamp && newStamp < oldStamp)
          )
            continue;
          calendar.removeSubcomponent(old);
        }
        calendar.addSubcomponent(new ICAL.Component(child.toJSON()));
      }
      for (const zone of incomingCalendar.getAllSubcomponents("vtimezone")) {
        const old = calendar
          .getAllSubcomponents("vtimezone")
          .find((c) => c.getFirstPropertyValue("tzid") === zone.getFirstPropertyValue("tzid"));
        if (old) calendar.removeSubcomponent(old);
        calendar.addSubcomponent(new ICAL.Component(zone.toJSON()));
      }
      update = parseCalendar(calendar.toString(), event.source)[0];
    } else if (
      !_completeSeries &&
      (event.sequence < previous.sequence ||
        (event.sequence === previous.sequence &&
          event.modified &&
          previous.modified &&
          event.modified < previous.modified))
    )
      continue;
    result[index] = {
      ...previous,
      ...update,
      id: previous.id,
      reminder: previous.reminder,
      source: { ...previous.source, ...event.source },
    };
  }
  return result;
}

export function suggestFromText(mail, reference = new Date(), now = new Date()) {
  const text = `${mail.subject || ""}\n${mail.text || ""}`;
  if (!BOOKING_WORDS.test(text)) return [];
  return findDates(text.slice(0, 40000), reference)
    .filter(
      (match) =>
        isExplicitDate(match.text) &&
        (!match.tags().has("result/relativeDateAndTime") ||
          /^(in|after)\b|from now|later$/i.test(match.text)) &&
        inUsefulRange(match.start.date(), now),
    )
    .slice(0, MAX_SUGGESTIONS_PER_EMAIL)
    .map((match, index) => {
      const start = match.start.date();
      const end = match.end?.date() || new Date(+start + 3600000);
      return {
        id: `mail:${mail.sourceId || "paste"}:${index}:${start.toISOString()}`,
        title: mail.subject || "Event from email",
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: !match.start.isCertain("hour"),
        location: "",
        notes: mail.text?.slice(0, 5000) || "",
        category: "email",
        repeat: "none",
        reminder: 10,
        status: "pending",
        sourceId: mail.sourceId,
        source: {
          type: "email",
          subject: mail.subject,
          from: mail.from,
          url: mail.url,
          accountId: mail.accountId,
        },
        excerpt: match.text,
        inferredTime: !match.start.isCertain("hour"),
      };
    });
}

// Applies the same rules to suggestions saved earlier: pending ones that are past, vague or not about
// a booking are dropped, with at most 3 per email. Suggestions already accepted or dismissed are kept.
export function keepUsefulSuggestions(suggestions, now = new Date()) {
  const perEmail = new Map();
  return suggestions.filter((s) => {
    if (s.status !== "pending") return true;
    const useful =
      inUsefulRange(new Date(s.start), now) &&
      isExplicitDate(s.excerpt || "") &&
      BOOKING_WORDS.test(`${s.title || ""}\n${s.notes || ""}`);
    if (!useful) return false;
    const count = perEmail.get(s.sourceId) || 0;
    perEmail.set(s.sourceId, count + 1);
    return count < MAX_SUGGESTIONS_PER_EMAIL;
  });
}
