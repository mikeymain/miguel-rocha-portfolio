// Local, synthetic data only. Run against the desired checkout with Node.
import { performance } from "node:perf_hooks";
import { allOccurrences, collectDue, emptyState, DAY } from "../src/core/calendar.js";

const count = 25;
const now = new Date("2026-11-11T12:00:00Z");
const makeState = (prefix) => ({
  ...emptyState(),
  events: Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    title: "Synthetic daily event",
    reminder: 10,
    start: "2020-01-01T08:00:00Z",
    end: "2020-01-01T09:00:00Z",
    ical: [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `UID:${prefix}-${i}`,
      "DTSTART:20200101T080000Z",
      "DTEND:20200101T090000Z",
      "RRULE:FREQ=DAILY",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n"),
  })),
});
function measure(label, run) {
  const started = performance.now();
  const rows = run();
  return { query: label, ms: +(performance.now() - started).toFixed(3), rows: rows.length };
}
const alarms = makeState("benchmark-alarm");
const renderer = makeState("benchmark-renderer");
const nextSecond = new Date(+now + 1000);
const results = [
  measure("collectDue cold", () => collectDue(alarms, now)),
  measure("collectDue same window", () => collectDue(alarms, now)),
  measure("collectDue +1s cloned state", () => collectDue(structuredClone(alarms), nextSecond)),
  measure("allOccurrences cold", () =>
    allOccurrences(renderer, new Date(+now - 7 * DAY), new Date(+now + 8 * DAY)),
  ),
  measure("allOccurrences same window", () =>
    allOccurrences(renderer, new Date(+now - 7 * DAY), new Date(+now + 8 * DAY)),
  ),
  measure("allOccurrences +1s cloned state", () =>
    allOccurrences(
      structuredClone(renderer),
      new Date(+nextSecond - 7 * DAY),
      new Date(+nextSecond + 8 * DAY),
    ),
  ),
];
console.log(JSON.stringify({ events: count, now: now.toISOString(), results }, null, 2));
