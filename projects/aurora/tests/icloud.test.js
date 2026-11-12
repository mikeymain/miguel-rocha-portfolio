import test from "node:test";
import assert from "node:assert/strict";
import { readOnlyICloudFetch, syncICloud } from "../electron/icloud.js";
import { emptyState } from "../src/core/calendar.js";
import { occurrences } from "../src/core/calendar.js";
import { mergeInvitations } from "../src/core/imports.js";
const calendar =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:icloud-event-1\r\nDTSTART:20261110T100000Z\r\nDTEND:20261110T110000Z\r\nSUMMARY:Phone appointment\r\nEND:VEVENT\r\nEND:VCALENDAR";
const vcard =
  "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:contact-1\r\nFN:Alice\r\nBDAY:1992-07-09\r\nEND:VCARD";
const clients =
  (objects = [{ data: calendar }]) =>
  async (type) =>
    type === "caldav"
      ? {
          fetchCalendars: async () => [
            {
              url: "https://p01-caldav.icloud.com/calendars/home/",
              displayName: "Home",
              components: ["VEVENT"],
            },
          ],
          fetchCalendarObjects: async () => objects,
        }
      : {
          fetchAddressBooks: async () => [{ url: "https://contacts.icloud.com/addressbook/" }],
          fetchVCards: async () => [{ data: vcard }],
        };
test("iCloud sync imports phone calendars and Contacts birthdays", async () => {
  const result = await syncICloud(
    { id: "icloud:test", email: "test@icloud.com" },
    { username: "test@icloud.com", password: "test" },
    emptyState(),
    { clientFactory: clients() },
  );
  assert.equal(result.events.length, 2);
  assert.equal(result.account.birthdayCount, 1);
  assert.ok(result.events.some((e) => e.title === "Phone appointment"));
  assert.ok(result.events.some((e) => e.title === "Alice’s birthday" && e.repeat === "yearly"));
});
test("removed iCloud events become cancellation tombstones", async () => {
  const first = await syncICloud(
    { id: "icloud:test", email: "test@icloud.com" },
    {},
    emptyState(),
    { clientFactory: clients() },
  );
  const state = emptyState();
  state.events = first.events;
  const next = await syncICloud(first.account, {}, state, { clientFactory: clients([]) });
  const merged = mergeInvitations(state.events, next.events);
  assert.equal(merged.find((e) => e.externalId === "icloud-event-1").cancelled, true);
  assert.equal(merged.find((e) => e.category === "birthdays").cancelled, false);
});
test("the iCloud transport blocks writes and credential redirects to other hosts", async () => {
  await assert.rejects(
    readOnlyICloudFetch("https://caldav.icloud.com/", { method: "DELETE" }),
    /read.only/i,
  );
  await assert.rejects(
    readOnlyICloudFetch("https://example.com/", { method: "PROPFIND" }),
    /iCloud/i,
  );
});
test("deleting a selected iCloud calendar cancels its saved events", async () => {
  const first = await syncICloud(
    { id: "icloud:test", email: "test@icloud.com" },
    {},
    emptyState(),
    { clientFactory: clients() },
  );
  const state = emptyState();
  state.events = first.events;
  const emptyCalendars = async (type) =>
    type === "caldav" ? { fetchCalendars: async () => [] } : await clients()(type);
  const next = await syncICloud(first.account, {}, state, { clientFactory: emptyCalendars });
  assert.equal(
    mergeInvitations(state.events, next.events).find((e) => e.externalId === "icloud-event-1")
      .cancelled,
    true,
  );
});
test("a phone resource snapshot removes recurrence exceptions reset on the phone", async () => {
  const master = calendar.replace("END:VEVENT", "RRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT");
  const detached =
    "BEGIN:VEVENT\r\nUID:icloud-event-1\r\nRECURRENCE-ID:20261111T100000Z\r\nDTSTART:20261111T120000Z\r\nDTEND:20261111T130000Z\r\nSUMMARY:Moved\r\nEND:VEVENT\r\n";
  const first = await syncICloud(
    { id: "icloud:test", email: "test@icloud.com" },
    {},
    emptyState(),
    {
      clientFactory: clients([
        { data: master.replace("END:VCALENDAR", `${detached}END:VCALENDAR`) },
      ]),
    },
  );
  const state = emptyState();
  state.events = first.events;
  const next = await syncICloud(first.account, {}, state, {
    clientFactory: clients([{ data: master }]),
  });
  const result = mergeInvitations(state.events, next.events).find(
    (e) => e.externalId === "icloud-event-1",
  );
  assert.deepEqual(
    occurrences(result, new Date("2026-11-11"), new Date("2026-11-12")).map((e) => e.start),
    ["2026-11-11T10:00:00.000Z"],
  );
});
test("an unchanged resource restored on iCloud supersedes a local absence tombstone", async () => {
  const data = calendar.replace(
    "SUMMARY:Phone appointment",
    "LAST-MODIFIED:20260101T000000Z\r\nSUMMARY:Phone appointment",
  );
  const first = await syncICloud(
    { id: "icloud:test", email: "test@icloud.com" },
    {},
    emptyState(),
    { clientFactory: clients([{ data }]) },
  );
  const state = emptyState();
  state.events = first.events;
  const removed = await syncICloud(first.account, {}, state, { clientFactory: clients([]) });
  state.events = mergeInvitations(state.events, removed.events);
  const restored = await syncICloud(first.account, {}, state, {
    clientFactory: clients([{ data }]),
  });
  assert.equal(
    mergeInvitations(state.events, restored.events).find((e) => e.externalId === "icloud-event-1")
      .cancelled,
    false,
  );
});
test("iCloud sync records each event address and version tag for two-way editing", async () => {
  const result = await syncICloud(
    { id: "icloud:test", email: "test@icloud.com" },
    {},
    emptyState(),
    {
      clientFactory: clients([
        {
          data: calendar,
          url: "https://p01-caldav.icloud.com/calendars/home/icloud-event-1.ics",
          etag: '"abc"',
        },
      ]),
    },
  );
  const event = result.events.find((e) => e.externalId === "icloud-event-1");
  assert.equal(event.source.url, "https://p01-caldav.icloud.com/calendars/home/icloud-event-1.ics");
  assert.equal(event.source.etag, '"abc"');
});
