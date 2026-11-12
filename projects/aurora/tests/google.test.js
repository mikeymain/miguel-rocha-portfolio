import test from "node:test";
import assert from "node:assert/strict";
import {
  googleCalendarToEvents,
  enrichTimezones,
  oauthParameters,
  syncGoogle,
} from "../electron/google.js";
import { occurrences } from "../src/core/calendar.js";

test("Google recurring appointments keep their timezone across clock changes", () => {
  const [event] = googleCalendarToEvents([
    {
      id: "g1",
      iCalUID: "uid1",
      summary: "Breakfast",
      start: { dateTime: "2026-10-24T08:00:00+01:00", timeZone: "Europe/Lisbon" },
      end: { dateTime: "2026-10-24T09:00:00+01:00", timeZone: "Europe/Lisbon" },
      recurrence: ["RRULE:FREQ=DAILY;COUNT=3"],
    },
  ]);
  const result = occurrences(
    event,
    new Date("2026-10-24T00:00:00Z"),
    new Date("2026-10-27T00:00:00Z"),
  );
  assert.deepEqual(
    result.map((e) => e.start),
    ["2026-10-24T07:00:00.000Z", "2026-10-25T08:00:00.000Z", "2026-10-26T08:00:00.000Z"],
  );
});
test("OAuth requests use PKCE, random state, and read-only Google scopes", () => {
  const request = oauthParameters(
    "my-client.apps.googleusercontent.com",
    "http://127.0.0.1:1234/callback",
  );
  assert.equal(request.params.get("code_challenge_method"), "S256");
  assert.ok(request.params.get("state").length >= 32);
  assert.ok(request.verifier.length >= 43);
  assert.match(request.params.get("scope"), /gmail.readonly/);
  assert.doesNotMatch(request.params.get("scope"), /gmail.modify|calendar.events /);
});
test("standalone TZIDs get definitions before parsing", () => {
  const text =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART;TZID=America/New_York:20261105T100000\r\nDTEND;TZID=America/New_York:20261105T110000\r\nEND:VEVENT\r\nEND:VCALENDAR";
  assert.match(enrichTimezones(text), /BEGIN:VTIMEZONE/);
});
test("a sparse Google cancellation exception resolves its master UID", () => {
  const items = [
    {
      id: "master",
      iCalUID: "uid-master",
      summary: "Daily",
      start: { dateTime: "2026-11-05T10:00:00Z" },
      end: { dateTime: "2026-11-05T11:00:00Z" },
      recurrence: ["RRULE:FREQ=DAILY;COUNT=3"],
    },
    {
      id: "cancelled-instance",
      recurringEventId: "master",
      status: "cancelled",
      originalStartTime: { dateTime: "2026-11-06T10:00:00Z" },
    },
  ];
  const result = googleCalendarToEvents(items);
  assert.equal(result.length, 1);
  assert.equal(occurrences(result[0], new Date("2026-11-01"), new Date("2026-12-01")).length, 2);
});
test("sync returns remote changes only, never an unchanged local snapshot", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (url) =>
      new Response(
        JSON.stringify(String(url).includes("calendarList") ? { items: [] } : { messages: [] }),
      ),
  );
  const result = await syncGoogle(
    { id: "account", email: "test@example.com", selectedCalendars: [] },
    { access_token: "test", expiresAt: Date.now() + 3600000 },
    {},
    {
      events: [{ id: "file-event", externalId: "file-uid", title: "Local imported event" }],
      suggestions: [],
    },
  );
  assert.equal(result.events.length, 0);
});

const rateLimited = () =>
  new Response(
    JSON.stringify({
      error: {
        code: 403,
        message: "Quota exceeded for quota metric 'Total Query Cost'",
        errors: [{ reason: "rateLimitExceeded" }],
      },
    }),
    { status: 403 },
  );
const rawMail = Buffer.from(
  "From: a@example.com\r\nSubject: Hello\r\nDate: Wed, 04 Nov 2026 10:00:00 +0000\r\n\r\nJust saying hi.\r\n",
).toString("base64url");
const calendarItem = {
  id: "evt1",
  iCalUID: "evt1@google",
  summary: "Dentist",
  start: { dateTime: "2026-11-10T10:00:00Z" },
  end: { dateTime: "2026-11-10T11:00:00Z" },
  updated: "2026-11-01T00:00:00Z",
};
function googleStub({ messageFailures = 0 } = {}) {
  let failures = 0;
  return async (url) => {
    const u = String(url);
    if (u.includes("calendarList"))
      return new Response(
        JSON.stringify({ items: [{ id: "primary@example.com", summary: "Me", primary: true }] }),
      );
    if (u.includes("/events"))
      return new Response(JSON.stringify({ items: [calendarItem], nextSyncToken: "sync1" }));
    if (/messages\/m1/.test(u)) {
      if (failures++ < messageFailures) return rateLimited();
      return new Response(
        JSON.stringify({ id: "m1", threadId: "t1", raw: rawMail, sizeEstimate: 200 }),
      );
    }
    if (u.includes("/messages"))
      return new Response(JSON.stringify({ messages: [{ id: "m1", threadId: "t1" }] }));
    throw new Error(`unexpected ${u}`);
  };
}
const googleAccount = () => ({ id: "google:test@example.com", email: "test@example.com" });
const freshTokens = () => ({ access_token: "test", expiresAt: Date.now() + 3600000 });

test("a Gmail rate limit is retried after a pause and the sync completes", async (t) => {
  t.mock.method(globalThis, "fetch", googleStub({ messageFailures: 2 }));
  const pauses = [];
  const result = await syncGoogle(
    googleAccount(),
    freshTokens(),
    {},
    { events: [], suggestions: [] },
    {
      sleep: async (ms) => {
        pauses.push(ms);
      },
    },
  );
  assert.equal(pauses.length, 2);
  assert.ok(pauses.every((ms) => ms > 0));
  assert.deepEqual(result.account.processedMailIds, ["m1"]);
  assert.equal(result.account.error, "");
});

test("a persistent Gmail rate limit keeps calendar events and retries email next sync", async (t) => {
  t.mock.method(globalThis, "fetch", googleStub({ messageFailures: Infinity }));
  const result = await syncGoogle(
    googleAccount(),
    freshTokens(),
    {},
    { events: [], suggestions: [] },
    { sleep: async () => {} },
  );
  assert.equal(result.events.filter((e) => e.externalId === "evt1@google").length, 1);
  assert.equal(result.account.lastMailSync, undefined);
  assert.deepEqual(result.account.processedMailIds, []);
  assert.match(result.account.warning, /Gmail/);
  assert.equal(result.account.error, "");
});

test("Google errors explain the real cause instead of always blaming disabled APIs", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: "Gmail API has not been used in project 1 before or it is disabled.",
            errors: [{ reason: "accessNotConfigured" }],
          },
        }),
        { status: 403 },
      ),
  );
  await assert.rejects(
    syncGoogle(
      googleAccount(),
      freshTokens(),
      {},
      { events: [], suggestions: [] },
      { sleep: async () => {} },
    ),
    /enable the Gmail API and Google Calendar API/i,
  );
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: "The caller does not have permission",
            errors: [{ reason: "forbidden" }],
          },
        }),
        { status: 403 },
      ),
  );
  await assert.rejects(
    syncGoogle(
      googleAccount(),
      freshTokens(),
      {},
      { events: [], suggestions: [] },
      { sleep: async () => {} },
    ),
    /caller does not have permission/,
  );
});

test("Gmail scanning skips the Promotions, Social and Forums tabs", async (t) => {
  const urls = [];
  const stub = googleStub();
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(String(url));
    return stub(url);
  });
  await syncGoogle(
    googleAccount(),
    freshTokens(),
    {},
    { events: [], suggestions: [] },
    { sleep: async () => {} },
  );
  const list = decodeURIComponent(urls.find((u) => /\/messages\?/.test(u)).replace(/\+/g, " "));
  assert.match(list, /-category:promotions/);
  assert.match(list, /-category:social/);
  assert.match(list, /-category:forums/);
});
