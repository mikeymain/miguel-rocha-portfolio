import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCalendar,
  mergeInvitations,
  suggestFromText,
  keepUsefulSuggestions,
} from "../src/core/imports.js";
import { occurrences, reconcileReminders, emptyState } from "../src/core/calendar.js";
const ics = (body, method = "REQUEST") =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Daybook tests//EN\r\nMETHOD:${method}\r\nBEGIN:VEVENT\r\nUID:booking-1\r\nSEQUENCE:1\r\nDTSTART:20261105T100000Z\r\nDTEND:20261105T110000Z\r\nSUMMARY:Dentist\r\n${body}\r\nEND:VEVENT\r\nEND:VCALENDAR`;

test("structured invitations preserve UTC instants and source UID", () => {
  const [event] = parseCalendar(ics("LOCATION:Lisbon"));
  assert.equal(event.start, "2026-11-05T10:00:00.000Z");
  assert.equal(event.externalId, "booking-1");
  assert.equal(event.location, "Lisbon");
});
test("reimport is idempotent and newer revisions update instead of duplicating", () => {
  const first = parseCalendar(ics(""));
  const initial = mergeInvitations([], first);
  assert.equal(mergeInvitations(initial, first).length, 1);
  const revision = parseCalendar(
    ics("").replace("SEQUENCE:1", "SEQUENCE:2").replace("SUMMARY:Dentist", "SUMMARY:New dentist"),
  );
  const updated = mergeInvitations(initial, revision);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, initial[0].id);
  assert.equal(updated[0].title, "New dentist");
  assert.equal(mergeInvitations(updated, first)[0].title, "New dentist");
});
test("cancellation disables the existing event and its reminders", () => {
  const initial = mergeInvitations([], parseCalendar(ics("")));
  const cancelled = mergeInvitations(
    initial,
    parseCalendar(ics("STATUS:CANCELLED", "CANCEL").replace("SEQUENCE:1", "SEQUENCE:2")),
  );
  assert.equal(cancelled[0].cancelled, true);
  assert.equal(occurrences(cancelled[0], new Date("2026-11-01"), new Date("2026-12-01")).length, 0);
});
test("all-day and recurring ICS files remain calendar events", () => {
  const text = ics("RRULE:FREQ=DAILY;COUNT=3")
    .replace("DTSTART:20261105T100000Z", "DTSTART;VALUE=DATE:20261105")
    .replace("DTEND:20261105T110000Z", "DTEND;VALUE=DATE:20261106");
  const [event] = parseCalendar(text);
  assert.equal(event.allDay, true);
  assert.equal(occurrences(event, new Date("2026-11-01"), new Date("2026-12-01")).length, 3);
});
test("invalid calendar input is rejected with a useful message", () => {
  assert.throws(() => parseCalendar("hello world"), /calendar/i);
});
test("a cancellation without dates still matches the original invitation", () => {
  const initial = parseCalendar(ics(""));
  const cancellation =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:CANCEL\r\nBEGIN:VEVENT\r\nUID:booking-1\r\nSEQUENCE:2\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const result = mergeInvitations(initial, parseCalendar(cancellation));
  assert.equal(result[0].cancelled, true);
  assert.equal(result[0].start, initial[0].start);
});
test("ordinary emails produce reviewable suggestions, not imported events", () => {
  const suggestions = suggestFromText(
    {
      subject: "Dinner booking",
      text: "Your table is reserved on November 5, 2026 at 7pm.",
      sourceId: "mail-1",
    },
    new Date("2026-11-03T12:00:00Z"),
    new Date("2026-11-03T12:00:00Z"),
  );
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].status, "pending");
  assert.equal(suggestions[0].sourceId, "mail-1");
  assert.equal(new Date(suggestions[0].start).getDate(), 5);
});
test("separately emailed recurrence updates preserve the series master", () => {
  const initial = parseCalendar(ics("RRULE:FREQ=DAILY;COUNT=3"));
  const exception = ics("RECURRENCE-ID:20261106T100000Z")
    .replace("SEQUENCE:1", "SEQUENCE:2")
    .replace("DTSTART:20261105T100000Z", "DTSTART:20261106T120000Z")
    .replace("DTEND:20261105T110000Z", "DTEND:20261106T130000Z");
  const updated = mergeInvitations(initial, parseCalendar(exception));
  assert.deepEqual(
    occurrences(updated[0], new Date("2026-11-01"), new Date("2026-12-01")).map((e) => e.start),
    ["2026-11-05T10:00:00.000Z", "2026-11-06T12:00:00.000Z", "2026-11-07T10:00:00.000Z"],
  );
});
test("a detached cancellation removes only the selected recurrence", () => {
  const initial = parseCalendar(ics("RRULE:FREQ=DAILY;COUNT=3"));
  const cancellation =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:CANCEL\r\nBEGIN:VEVENT\r\nUID:booking-1\r\nRECURRENCE-ID:20261106T100000Z\r\nSEQUENCE:2\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const updated = mergeInvitations(initial, parseCalendar(cancellation));
  assert.equal(updated[0].cancelled, false);
  assert.equal(occurrences(updated[0], new Date("2026-11-01"), new Date("2026-12-01")).length, 2);
});
test("relative arrival instructions do not become a second booking", () => {
  assert.equal(
    suggestFromText(
      {
        subject: "Dinner reservation",
        text: "Your table is reserved on November 5, 2026 at 7pm. Please arrive five minutes early.",
      },
      new Date("2026-11-03T12:00:00Z"),
      new Date("2026-11-03T12:00:00Z"),
    ).length,
    1,
  );
});
test("a moved-earlier occurrence retains its active snooze during reconciliation", () => {
  const initial = parseCalendar(ics("RRULE:FREQ=DAILY;COUNT=3"));
  const exception = ics("RECURRENCE-ID:20261106T100000Z")
    .replace("SEQUENCE:1", "SEQUENCE:2")
    .replace("DTSTART:20261105T100000Z", "DTSTART:20261106T090000Z")
    .replace("DTEND:20261105T110000Z", "DTEND:20261106T100000Z");
  const state = emptyState();
  state.events = mergeInvitations(initial, parseCalendar(exception));
  state.alarmState.snooze = {
    key: "snooze",
    kind: "event",
    itemId: state.events[0].id,
    start: "2026-11-06T09:00:00.000Z",
    status: "snoozed",
    snoozedUntil: "2026-11-06T09:10:00.000Z",
  };
  reconcileReminders(state);
  assert.equal(state.alarmState.snooze?.status, "snoozed");
  assert.equal(
    occurrences(state.events[0], new Date("2026-11-06T08:59:59Z"), new Date("2026-11-06T09:00:01Z"))
      .length,
    1,
  );
});

test("calendar events titled with bday shorthand are filed as birthdays", () => {
  const event = (uid, summary) =>
    `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:20270118T000000Z\r\nDTEND:20270118T010000Z\r\nRRULE:FREQ=YEARLY\r\nSUMMARY:${summary}\r\nEND:VEVENT\r\n`;
  const text = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Daybook tests//EN\r\n${event("b1", "JOAO BDAY")}${event("b2", "bea bday")}${event("b3", "Ana b-day")}${event("b4", "Aniversário da Rita")}${event("n1", "Abdayan review")}${event("n2", "Dentist")}END:VCALENDAR`;
  const categories = Object.fromEntries(
    parseCalendar(text, { type: "icloud-calendar" }).map((e) => [e.externalId, e.category]),
  );
  assert.deepEqual(
    [categories.b1, categories.b2, categories.b3, categories.b4],
    ["birthdays", "birthdays", "birthdays", "birthdays"],
  );
  assert.notEqual(categories.n1, "birthdays");
  assert.notEqual(categories.n2, "birthdays");
});

test("birthday calendar events ring at their start; other events keep the 10-minute default", () => {
  const event = (uid, summary) =>
    `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:20270118T000000Z\r\nDTEND:20270118T010000Z\r\nSUMMARY:${summary}\r\nEND:VEVENT\r\n`;
  const text = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Daybook tests//EN\r\n${event("b1", "bea bday")}${event("n1", "Dentist")}END:VCALENDAR`;
  const reminders = Object.fromEntries(
    parseCalendar(text, { type: "icloud-calendar" }).map((e) => [e.externalId, e.reminder]),
  );
  assert.equal(reminders.b1, 0);
  assert.equal(reminders.n1, 10);
});

test("Google Calendar and iCloud events are personal; only email invitations are labelled From email", () => {
  const text =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:g1\r\nDTSTART:20261110T100000Z\r\nDTEND:20261110T110000Z\r\nSUMMARY:Haircut\r\nEND:VEVENT\r\nEND:VCALENDAR";
  assert.equal(parseCalendar(text, { type: "google-calendar" })[0].category, "personal");
  assert.equal(parseCalendar(text, { type: "icloud-calendar" })[0].category, "personal");
  assert.equal(
    parseCalendar(text, { subject: "Invitation", from: "a@example.com" })[0].category,
    "email",
  );
});

const NOW = new Date("2026-11-04T12:00:00Z");
test("newsletter phrases like today, now or this morning do not become events", () => {
  const mail = {
    subject: "Your daily brief",
    text: "Visit our website today! Markets move now. Read this morning's event recap and book a demo.",
    sourceId: "n1",
  };
  assert.equal(suggestFromText(mail, NOW, NOW).length, 0);
});

test("dates already in the past are not suggested", () => {
  const mail = {
    subject: "Appointment confirmed",
    text: "Your appointment is on September 3, 2026 at 10:00.",
    sourceId: "p1",
  };
  assert.equal(suggestFromText(mail, new Date("2026-09-01T09:00:00Z"), NOW).length, 0);
});

test("booking words must be whole words, so Facebook is not a booking", () => {
  const mail = {
    subject: "Updates",
    text: "Follow our Facebook page. Prevent spam before 12 December 2026.",
    sourceId: "f1",
  };
  assert.equal(suggestFromText(mail, NOW, NOW).length, 0);
});

test("a weekday with a time in a booking email is suggested, and one email gives at most 3 suggestions", () => {
  assert.equal(
    suggestFromText(
      { subject: "Dentist appointment", text: "See you on Friday at 10:30.", sourceId: "d1" },
      NOW,
      NOW,
    ).length,
    1,
  );
  const many = {
    subject: "Your reservations",
    text: "Reserved: 10 December 2026 at 19:00, 11 December 2026 at 19:00, 12 December 2026 at 19:00, 13 December 2026 at 19:00, 14 December 2026 at 19:00.",
    sourceId: "m1",
  };
  assert.equal(suggestFromText(many, NOW, NOW).length, 3);
});

test("saved suggestions are pruned to useful pending ones; reviewed ones are kept", () => {
  const base = {
    title: "Dinner reservation",
    notes: "Your table is reserved.",
    status: "pending",
    sourceId: "s1",
  };
  const kept = keepUsefulSuggestions(
    [
      { ...base, id: "future", start: "2026-12-01T19:00:00Z", excerpt: "December 1, 2026 at 7pm" },
      { ...base, id: "past", start: "2026-10-01T19:00:00Z", excerpt: "October 1, 2026 at 7pm" },
      { ...base, id: "vague", start: "2026-12-02T12:00:00Z", excerpt: "today" },
      {
        ...base,
        id: "newsletter",
        title: "Market brief",
        notes: "Visit our site",
        start: "2026-12-03T12:00:00Z",
        excerpt: "December 3, 2026",
      },
      {
        ...base,
        id: "accepted",
        status: "accepted",
        start: "2026-10-01T19:00:00Z",
        excerpt: "today",
      },
    ],
    NOW,
  ).map((s) => s.id);
  assert.deepEqual(kept, ["future", "accepted"]);
});

test("a month name needs a day, link fragments are not dates, and far-future years are ignored", () => {
  const ask = (text) =>
    suggestFromText({ subject: "Your booking", text, sourceId: "x" }, NOW, NOW).length;
  assert.equal(ask("Book your December getaway now."), 0);
  assert.equal(ask("Read more at example.com/october-12198489 about tickets."), 0);
  assert.equal(ask("Ticket valid until 2099-01-01."), 0);
  assert.equal(ask("Your booking is confirmed for 5 December 2026 at 19:00."), 1);
  assert.equal(ask("Reserva confirmada para 5 de dezembro de 2026 às 19:00."), 1);
  assert.equal(ask("Booking reference for 12/12/2026."), 1);
});
