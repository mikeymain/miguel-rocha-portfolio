import test from "node:test";
import assert from "node:assert/strict";
import { occurrences, collectDue, emptyState, validateEvent } from "../src/core/calendar.js";

process.env.TZ = "Europe/Lisbon";
const daily = {
  id: "a",
  title: "Morning",
  start: "2026-10-24T08:00:00+01:00",
  end: "2026-10-24T09:00:00+01:00",
  repeat: "daily",
  enabled: true,
};

test("daily recurrence keeps 08:00 across the daylight-saving change", () => {
  const result = occurrences(
    daily,
    new Date("2026-10-24T00:00:00Z"),
    new Date("2026-10-27T00:00:00Z"),
  );
  assert.deepEqual(
    result.map((e) => new Date(e.start).getHours()),
    [8, 8, 8],
  );
  assert.equal(result[1].start, "2026-10-25T08:00:00.000Z");
});
test("monthly recurrence skips months without the selected day", () => {
  const result = occurrences(
    { ...daily, start: "2026-01-31T08:00:00Z", end: "2026-01-31T09:00:00Z", repeat: "monthly" },
    new Date("2026-02-01"),
    new Date("2026-04-01"),
  );
  assert.equal(result.length, 1);
  assert.equal(new Date(result[0].start).getDate(), 31);
});
test("weekday alarms skip weekends", () => {
  const result = occurrences(
    { ...daily, repeat: "weekdays" },
    new Date("2026-10-24T00:00:00Z"),
    new Date("2026-10-28T00:00:00Z"),
  );
  assert.deepEqual(
    result.map((e) => new Date(e.start).getDay()),
    [1, 2],
  );
});
test("events spanning midnight remain visible on the next day", () => {
  const result = occurrences(
    { ...daily, repeat: "none", start: "2026-11-02T23:00:00Z", end: "2026-11-03T02:00:00Z" },
    new Date("2026-11-03"),
    new Date("2026-11-04"),
  );
  assert.equal(result.length, 1);
});
test("reminders fire before the appointment and dismissal prevents duplicates", () => {
  const state = emptyState();
  state.events = [
    {
      ...daily,
      repeat: "none",
      start: "2026-11-03T10:00:00Z",
      end: "2026-11-03T11:00:00Z",
      reminder: 10,
    },
  ];
  const due = collectDue(state, new Date("2026-11-03T09:50:00Z"));
  assert.equal(due.length, 1);
  state.alarmState[due[0].key] = { ...due[0], status: "dismissed" };
  assert.equal(collectDue(state, new Date("2026-11-03T09:51:00Z")).length, 0);
});
test("snoozed reminders wait until due and survive an app restart", () => {
  const state = emptyState();
  state.alarmState.test = {
    key: "test",
    title: "Saved alarm",
    status: "snoozed",
    snoozedUntil: "2026-11-03T11:00:00Z",
  };
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(collectDue(restored, new Date("2026-11-03T10:59:00Z")).length, 0);
  assert.equal(collectDue(restored, new Date("2026-11-03T11:00:00Z"))[0].title, "Saved alarm");
});
test("disabled and cancelled alarms never ring, overdue alarms do", () => {
  const state = emptyState();
  state.alarms = [{ ...daily, repeat: "none", start: "2026-11-03T10:00:00Z", enabled: false }];
  assert.equal(collectDue(state, new Date("2026-11-03T11:00:00Z")).length, 0);
  state.alarms[0].enabled = true;
  assert.equal(collectDue(state, new Date("2026-11-03T11:00:00Z"))[0].missed, true);
  state.alarms[0].cancelled = true;
  assert.equal(collectDue(state, new Date("2026-11-03T11:00:00Z")).length, 0);
});
test("invalid titles and backwards event ranges are rejected", () => {
  assert.throws(() => validateEvent({ ...daily, title: "   " }), /title/i);
  assert.throws(() => validateEvent({ ...daily, end: "2020-01-01" }), /after/i);
});
