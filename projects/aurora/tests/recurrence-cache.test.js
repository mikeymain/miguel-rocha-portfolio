import test from "node:test";
import assert from "node:assert/strict";
import ICAL from "ical.js";
import { allOccurrences, collectDue, emptyState, occurrences } from "../src/core/calendar.js";

process.env.TZ = "Europe/Lisbon";
const from = new Date("2026-11-05T09:00:00Z");
const to = new Date("2026-11-07T09:00:00Z");
const calendar = (uid, extra = "", zone = "", local = false) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    zone,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART${local ? ";TZID=Cache/Test" : ""}:20261105T100000${local ? "" : "Z"}`,
    `DTEND${local ? ";TZID=Cache/Test" : ""}:20261105T110000${local ? "" : "Z"}`,
    "RRULE:FREQ=DAILY;COUNT=5",
    extra,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
const item = (uid, extra = "") => ({
  id: uid,
  title: "Current title",
  location: "Current place",
  start: "2026-11-05T10:00:00Z",
  end: "2026-11-05T11:00:00Z",
  reminder: 10,
  ical: calendar(uid, extra),
});
const fixedZone = (offset) =>
  [
    "BEGIN:VTIMEZONE",
    "TZID:Cache/Test",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    `TZOFFSETFROM:${offset}`,
    `TZOFFSETTO:${offset}`,
    "END:STANDARD",
    "END:VTIMEZONE",
  ].join("\r\n");

test("reuses expansion for identical and adjacent-second windows after state cloning", (t) => {
  const event = item("cache-warm");
  const iterator = t.mock.method(ICAL.Event.prototype, "iterator");
  const first = occurrences(event, from, to);
  const second = occurrences(structuredClone(event), new Date(+from + 1000), new Date(+to + 1000));
  assert.deepEqual(second, first);
  assert.equal(iterator.mock.callCount(), 1);
});

test("cached schedules use the current ID and metadata and return fresh rows", (t) => {
  const event = item("cache-metadata");
  const iterator = t.mock.method(ICAL.Event.prototype, "iterator");
  const first = occurrences(event, from, to);
  first[0].start = "broken";
  first[0].title = "mutated output";
  const edited = {
    ...event,
    id: "edited-id",
    title: "Edited title",
    location: "Edited place",
    reminder: 30,
    category: "work",
    source: { name: "New source" },
  };
  const second = occurrences(edited, from, to);
  assert.equal(second[0].start, "2026-11-05T10:00:00.000Z");
  assert.equal(second[0].title, edited.title);
  assert.equal(second[0].location, edited.location);
  assert.equal(second[0].occurrenceId, "edited-id@2026-11-05T10:00:00.000Z");
  assert.equal(second[0].reminder, 30);
  assert.equal(second[0].category, "work");
  assert.equal(second[0].source, edited.source);
  assert.equal(iterator.mock.callCount(), 1);
});

test("changing ICS invalidates expansion while summary overrides remain intact", (t) => {
  const event = item("cache-edit", "SUMMARY:Calendar title");
  const iterator = t.mock.method(ICAL.Event.prototype, "iterator");
  assert.equal(occurrences(event, from, to)[0].title, "Calendar title");
  event.ical = event.ical
    .replace("SUMMARY:Calendar title", "SUMMARY:Changed title")
    .replace("20261105T100000Z", "20261105T120000Z");
  const result = occurrences(event, from, to);
  assert.equal(result[0].title, "Changed title");
  assert.equal(result[0].start, "2026-11-05T12:00:00.000Z");
  assert.equal(iterator.mock.callCount(), 2);
});

test("widened windows still honor exact overlap and zero-duration boundaries", () => {
  const event = item("cache-boundaries");
  occurrences(event, from, to);
  assert.equal(
    occurrences(event, new Date("2026-11-05T11:00:00Z"), new Date("2026-11-06T10:00:00Z")).length,
    0,
  );
  const zero = item("cache-zero");
  zero.ical = zero.ical.replace("DTEND:20261105T110000Z", "DTEND:20261105T100000Z");
  occurrences(zero, from, to);
  assert.equal(
    occurrences(zero, new Date("2026-11-05T10:00:00Z"), new Date("2026-11-05T10:00:00.001Z"))
      .length,
    1,
  );
  assert.equal(
    occurrences(zero, new Date("2026-11-05T09:59:59Z"), new Date("2026-11-05T10:00:00Z")).length,
    0,
  );
});

test("adjacent alarm checks keep exact due times, dismissals, and snoozes", (t) => {
  const state = { ...emptyState(), events: [item("cache-alarm")] };
  const iterator = t.mock.method(ICAL.Event.prototype, "iterator");
  const before = new Date("2026-11-05T09:49:59Z");
  assert.equal(collectDue(state, before).length, 0);
  const due = collectDue(state, new Date(+before + 1000));
  assert.equal(due.length, 1);
  state.alarmState[due[0].key] = { ...due[0], status: "dismissed" };
  assert.equal(collectDue(state, new Date(+before + 2000)).length, 0);
  assert.equal(iterator.mock.callCount(), 1);
  state.alarmState[due[0].key] = {
    ...due[0],
    status: "snoozed",
    snoozedUntil: "2026-11-05T10:00:00Z",
  };
  assert.equal(collectDue(state, new Date("2026-11-05T09:59:59Z")).length, 0);
  assert.equal(collectDue(state, new Date("2026-11-05T10:00:00Z"))[0].status, "ringing");
});

test("allOccurrences shares cached expansion but reflects cancellation and disablement", (t) => {
  const event = item("cache-renderer");
  const state = { ...emptyState(), events: [event] };
  const iterator = t.mock.method(ICAL.Event.prototype, "iterator");
  assert.deepEqual(
    allOccurrences(state, from, to),
    allOccurrences(structuredClone(state), from, to),
  );
  assert.equal(iterator.mock.callCount(), 1);
  assert.deepEqual(occurrences({ ...event, cancelled: true }, from, to), []);
  assert.deepEqual(occurrences({ ...event, enabled: false }, from, to), []);
});

test("warm schedules restore their own zones and external timezone dependencies bypass caching", (t) => {
  const one = {
    ...item("cache-zone-one"),
    ical: calendar("cache-zone-one", "", fixedZone("+0100"), true),
  };
  const two = {
    ...item("cache-zone-two"),
    ical: calendar("cache-zone-two", "", fixedZone("+0200"), true),
  };
  const external = {
    ...item("cache-zone-external"),
    ical: calendar("cache-zone-external", "", "", true),
  };
  const parse = t.mock.method(ICAL, "parse");
  const windowFrom = new Date("2026-11-05T00:00:00Z");
  assert.equal(occurrences(one, windowFrom, to)[0].start, "2026-11-05T09:00:00.000Z");
  assert.equal(occurrences(two, windowFrom, to)[0].start, "2026-11-05T08:00:00.000Z");
  assert.equal(occurrences(external, windowFrom, to)[0].start, "2026-11-05T08:00:00.000Z");
  assert.equal(occurrences(one, windowFrom, to)[0].start, "2026-11-05T09:00:00.000Z");
  assert.equal(occurrences(external, windowFrom, to)[0].start, "2026-11-05T09:00:00.000Z");
  assert.equal(parse.mock.callCount(), 4);
});

test("nonrecurring ICS keeps current item copy instead of applying recurring overrides", () => {
  const event = item("cache-single", "SUMMARY:Original title\r\nLOCATION:Original place");
  event.ical = event.ical.replace("RRULE:FREQ=DAILY;COUNT=5\r\n", "");
  occurrences(event, from, to);
  const changed = occurrences(
    { ...event, title: "Edited single title", location: "Edited single place" },
    from,
    to,
  );
  assert.equal(changed[0].title, "Edited single title");
  assert.equal(changed[0].location, "Edited single place");
});

test("warm recurrence preserves DST, interval, count, and excluded dates", (t) => {
  const zone = [
    "BEGIN:VTIMEZONE",
    "TZID:Cache/DST",
    "BEGIN:STANDARD",
    "DTSTART:19701025T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0000",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T010000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "TZOFFSETFROM:+0000",
    "TZOFFSETTO:+0100",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
  ].join("\r\n");
  const event = {
    ...item("cache-dst"),
    ical: calendar("cache-dst", "EXDATE;TZID=Cache/DST:20261026T080000", zone, true)
      .replaceAll("TZID=Cache/Test", "TZID=Cache/DST")
      .replace("20261105T100000", "20261024T080000")
      .replace("20261105T110000", "20261024T090000")
      .replace("FREQ=DAILY;COUNT=5", "FREQ=DAILY;INTERVAL=2;COUNT=3"),
  };
  const iterator = t.mock.method(ICAL.Event.prototype, "iterator");
  const lo = new Date("2026-10-23T12:00:00Z"),
    hi = new Date("2026-10-31T12:00:00Z");
  const expected = ["2026-10-24T07:00:00.000Z", "2026-10-28T08:00:00.000Z"];
  assert.deepEqual(
    occurrences(event, lo, hi).map((row) => row.start),
    expected,
  );
  assert.deepEqual(
    occurrences(event, new Date(+lo + 1000), new Date(+hi + 1000)).map((row) => row.start),
    expected,
  );
  assert.equal(iterator.mock.callCount(), 1);
});

test("warm windows retain detached moves and single and future cancellations", (t) => {
  const event = item("cache-exceptions");
  const exceptions = [
    "BEGIN:VEVENT",
    "UID:cache-exceptions",
    "RECURRENCE-ID:20261106T100000Z",
    "DTSTART:20261106T090000Z",
    "DTEND:20261106T100000Z",
    "SUMMARY:Moved",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:cache-exceptions",
    "RECURRENCE-ID:20261107T100000Z",
    "STATUS:CANCELLED",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:cache-exceptions",
    "RECURRENCE-ID;RANGE=THISANDFUTURE:20261108T100000Z",
    "STATUS:CANCELLED",
    "END:VEVENT",
  ].join("\r\n");
  event.ical = event.ical.replace("END:VCALENDAR", `${exceptions}\r\nEND:VCALENDAR`);
  const iterator = t.mock.method(ICAL.Event.prototype, "iterator");
  const lo = new Date("2026-11-05T08:59:00Z"),
    hi = new Date("2026-11-10T12:00:00Z");
  const first = occurrences(event, lo, hi);
  assert.deepEqual(
    first.map((row) => row.start),
    ["2026-11-05T10:00:00.000Z", "2026-11-06T09:00:00.000Z"],
  );
  assert.deepEqual(occurrences(event, new Date(+lo + 1000), new Date(+hi + 1000)), first);
  assert.equal(iterator.mock.callCount(), 1);
  const moved = occurrences(
    event,
    new Date("2026-11-06T08:59:00Z"),
    new Date("2026-11-06T09:01:00Z"),
  );
  assert.equal(moved[0].title, "Moved");
});

test("cache evicts old schedules and bypasses oversized calendar text", (t) => {
  const event = item("cache-eviction");
  occurrences(event, from, to);
  for (let i = 0; i < 256; i++) occurrences(item(`cache-fill-${i}`), from, to);
  const iterator = t.mock.method(ICAL.Event.prototype, "iterator");
  occurrences(event, from, to);
  assert.equal(iterator.mock.callCount(), 1);
  const oversized = item("cache-large", `COMMENT:${"x".repeat(70_000)}`);
  const first = occurrences(oversized, from, to);
  assert.deepEqual(occurrences(oversized, from, to), first);
  assert.equal(iterator.mock.callCount(), 3);
});

test("dense windows bypass storage and a fresh module starts with a cold cache", async (t) => {
  const dense = item("cache-dense");
  dense.ical = dense.ical.replace("FREQ=DAILY;COUNT=5", "FREQ=HOURLY;COUNT=2100");
  const hi = new Date("2027-03-01T00:00:00Z");
  const iterator = t.mock.method(ICAL.Event.prototype, "iterator");
  assert.equal(occurrences(dense, from, hi).length, 2100);
  assert.equal(occurrences(dense, from, hi).length, 2100);
  assert.equal(iterator.mock.callCount(), 2);
  const event = item("cache-restart");
  occurrences(event, from, to);
  const fresh = await import("../src/core/calendar.js?cache-restart-test");
  assert.deepEqual(fresh.occurrences(event, from, to), occurrences(event, from, to));
  assert.equal(iterator.mock.callCount(), 4);
});
