import test from "node:test";
import assert from "node:assert/strict";
import { alarmOrigin, eventSource } from "../src/core/origin.js";

const state = {
  accounts: [{ id: "google:me@example.com", email: "me@example.com" }],
  alarms: [
    { id: "a1", repeat: "weekdays" },
    { id: "a2", repeat: "none" },
  ],
  events: [
    {
      id: "e1",
      category: "personal",
      reminder: 10,
      source: { type: "icloud-calendar", name: "Casa" },
    },
    {
      id: "e2",
      category: "work",
      reminder: 60,
      source: {
        type: "google-calendar",
        name: "Team",
        accountId: "google:me@example.com",
      },
    },
    {
      id: "e3",
      category: "email",
      reminder: 1440,
      source: {
        type: "email",
        from: "Ana <ana@example.com>",
        subject: "Dinner",
      },
    },
    {
      id: "e4",
      category: "birthdays",
      reminder: 0,
      source: { type: "icloud-contacts" },
    },
    { id: "e5", category: "personal", reminder: 0 },
  ],
};

test("says an alarm you set is an alarm, with its repeat", () => {
  assert.deepEqual(alarmOrigin(state, { kind: "alarm", itemId: "a1" }), {
    kind: "alarm",
    label: "Alarm",
    source: "Set in Aurora",
    details: ["Repeats on weekdays"],
  });
  assert.deepEqual(alarmOrigin(state, { kind: "alarm", itemId: "a2" }).details, ["One-time"]);
});

test("names the calendar, category and lead time for event reminders", () => {
  assert.deepEqual(alarmOrigin(state, { kind: "event", itemId: "e1" }), {
    kind: "event",
    label: "Event reminder",
    source: "iCloud · Casa",
    details: ["Personal", "10 min before"],
  });
  assert.deepEqual(alarmOrigin(state, { kind: "event", itemId: "e2" }).details, [
    "Work",
    "1 hour before",
  ]);
  assert.equal(
    alarmOrigin(state, { kind: "event", itemId: "e2" }).source,
    "Google Calendar · Team",
  );
  const email = alarmOrigin(state, { kind: "event", itemId: "e3" });
  assert.equal(email.source, "Email from Ana <ana@example.com>");
  assert.deepEqual(email.details, ["From email", "1 day before", "“Dinner”"]);
});

test("marks birthdays and local events", () => {
  assert.deepEqual(alarmOrigin(state, { kind: "event", itemId: "e4" }), {
    kind: "birthday",
    label: "Birthday",
    source: "iCloud contacts",
    details: ["At the start time"],
  });
  assert.equal(alarmOrigin(state, { kind: "event", itemId: "e5" }).source, "Aurora calendar");
  assert.equal(alarmOrigin(state, { kind: "test" }).label, "Alarm preview");
  assert.equal(alarmOrigin(state, { kind: "event", itemId: "gone" }).source, "Calendar");
  assert.equal(
    eventSource(state, { source: { type: "calendar-file", name: "work.ics" } }),
    "Imported file · work.ics",
  );
});
