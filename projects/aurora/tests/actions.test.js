import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, validateBackup } from "../src/core/actions.js";
import { emptyState } from "../src/core/calendar.js";
import { collectDue } from "../src/core/calendar.js";
const event = {
  id: "one",
  title: "Lunch",
  start: "2026-11-03T12:00:00Z",
  end: "2026-11-03T13:00:00Z",
  repeat: "none",
  reminder: 10,
};

test("backup validation rejects corrupt embedded calendars before saving", () => {
  const backup = emptyState();
  backup.events = [{ ...event, ical: "garbage" }];
  assert.throws(() => validateBackup(backup));
});
test("saving then editing retains one event and deleting clears pending reminders", () => {
  let state = applyAction(emptyState(), { type: "saveEvent", item: event });
  state = applyAction(state, { type: "saveEvent", item: { ...event, title: "Dinner" } });
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "Dinner");
  state.alarmState.test = { itemId: "one", status: "snoozed" };
  state = applyAction(state, { type: "deleteEvent", id: "one" });
  assert.equal(state.events.length, 0);
  assert.equal(Object.keys(state.alarmState).length, 0);
});
test("accepting a suggestion is idempotent and rejection never creates an event", () => {
  const initial = emptyState();
  initial.suggestions = [{ ...event, status: "pending" }];
  let state = applyAction(initial, { type: "acceptSuggestion", id: "one", item: event });
  state = applyAction(state, { type: "acceptSuggestion", id: "one", item: event });
  assert.equal(state.events.length, 1);
  assert.equal(state.suggestions[0].status, "accepted");
  assert.equal(applyAction(initial, { type: "rejectSuggestion", id: "one" }).events.length, 0);
});
test("invalid backups and unknown actions cannot replace user data", () => {
  assert.throws(() => validateBackup({ version: 1, events: "oops" }), /backup/i);
  assert.throws(() => applyAction(emptyState(), { type: "runShell" }), /unsupported/i);
});

test("backup validation rejects malformed records before they can break startup", () => {
  for (const record of [null, false, 7, "bad record", []]) {
    assert.throws(() => validateBackup({ ...emptyState(), suggestions: [record] }), /suggestion/i);
    assert.throws(() => validateBackup({ ...emptyState(), accounts: [record] }), /account/i);
    assert.throws(
      () => validateBackup({ ...emptyState(), alarmState: { reminder: record } }),
      /alarm/i,
    );
  }
  for (const accounts of [null, {}, "bad accounts"]) {
    assert.throws(() => validateBackup({ ...emptyState(), accounts }), /account/i);
  }
});

test("backup validation keeps historical backups with optional accounts omitted", () => {
  const historical = emptyState();
  delete historical.accounts;
  historical.suggestions = [{ ...event, status: "pending" }];
  historical.alarmState.saved = {
    key: "saved",
    kind: "test",
    title: "Saved alarm",
    status: "snoozed",
    snoozedUntil: event.start,
  };
  const restored = validateBackup(historical);
  assert.deepEqual(restored.accounts, []);
  assert.deepEqual(restored.suggestions, historical.suggestions);
  assert.deepEqual(restored.alarmState, historical.alarmState);
  assert.deepEqual(
    validateBackup({
      ...restored,
      accounts: [{ id: "icloud:test@example.com", provider: "icloud", email: "test@example.com" }],
    }).accounts[0].provider,
    "icloud",
  );
});
test("editing notes preserves a snoozed reminder", () => {
  const initial = emptyState();
  initial.events = [event];
  initial.alarmState.test = {
    itemId: "one",
    status: "snoozed",
    snoozedUntil: "2026-11-03T13:00:00Z",
  };
  const updated = applyAction(initial, {
    type: "saveEvent",
    item: { ...event, notes: "Bring a notebook" },
  });
  assert.equal(updated.alarmState.test.status, "snoozed");
});
test("import cancellation removes snoozed and ringing reminders", () => {
  let state = emptyState();
  state.events = [{ ...event, externalId: "invite-1", sequence: 0 }];
  state.alarmState.snooze = {
    key: "snooze",
    kind: "event",
    itemId: "one",
    start: event.start,
    status: "snoozed",
    snoozedUntil: "2026-11-03T12:05:00Z",
  };
  state.alarmState.ring = {
    key: "ring",
    kind: "event",
    itemId: "one",
    start: event.start,
    status: "ringing",
  };
  const text =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:CANCEL\r\nBEGIN:VEVENT\r\nUID:invite-1\r\nSEQUENCE:1\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR";
  state = applyAction(state, { type: "importCalendar", text });
  assert.equal(Object.keys(state.alarmState).length, 0);
  assert.equal(collectDue(state, new Date("2026-11-03T12:10:00Z")).length, 0);
});
