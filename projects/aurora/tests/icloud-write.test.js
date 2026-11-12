import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { editedEventIcs, newEventIcs } from "../src/core/icloud-ics.js";
import { parseCalendar } from "../src/core/imports.js";
import { emptyState, occurrences } from "../src/core/calendar.js";
import { icloudWrite, changeICloudEvent } from "../electron/icloud-write.js";

const CALENDAR_URL = "https://p01-caldav.icloud.com/123/calendars/CASA/";
const OBJECT_URL = `${CALENDAR_URL}event-1.ics`;
const source = {
  type: "icloud-calendar",
  accountId: "icloud:me",
  calendarId: CALENDAR_URL,
  name: "Casa",
  url: OBJECT_URL,
  etag: '"v1"',
};
const single =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Apple Inc.//iPhone//EN\r\nBEGIN:VEVENT\r\nUID:event-1\r\nSEQUENCE:2\r\nDTSTART:20261110T100000Z\r\nDTEND:20261110T110000Z\r\nSUMMARY:Dentist\r\nLOCATION:Lisbon\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
const series =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:event-1\r\nDTSTART:20261110T100000Z\r\nDTEND:20261110T110000Z\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nSUMMARY:Gym\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:event-1\r\nRECURRENCE-ID:20261117T100000Z\r\nDTSTART:20261117T120000Z\r\nDTEND:20261117T130000Z\r\nSUMMARY:Gym (moved)\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
const imported = (text) => ({
  ...parseCalendar(text, source)[0],
  id: "local-1",
  category: "personal",
  reminder: 10,
});
const NOW = new Date("2026-11-04T12:00:00Z");

test("editing an iCloud event changes only the edited fields and bumps its sequence", () => {
  const event = imported(single);
  const ics = editedEventIcs(
    event,
    {
      ...event,
      title: "Dentist (Dr Silva)",
      location: "",
      notes: "Bring X-rays",
    },
    NOW,
  );
  const [parsed] = parseCalendar(ics, source);
  assert.equal(parsed.title, "Dentist (Dr Silva)");
  assert.equal(parsed.location, "");
  assert.equal(parsed.notes, "Bring X-rays");
  assert.equal(parsed.externalId, "event-1");
  assert.equal(parsed.sequence, 3);
  assert.equal(parsed.start, event.start);
  assert.match(ics, /LAST-MODIFIED:20261104T120000Z/);
});

test("moving a one-off iCloud event writes the new time, and all-day uses date values", () => {
  const event = imported(single);
  const moved = parseCalendar(
    editedEventIcs(
      event,
      {
        ...event,
        start: "2026-11-12T15:30:00.000Z",
        end: "2026-11-12T16:00:00.000Z",
      },
      NOW,
    ),
    source,
  )[0];
  assert.equal(moved.start, "2026-11-12T15:30:00.000Z");
  assert.equal(moved.end, "2026-11-12T16:00:00.000Z");
  const dayStart = new Date(2026, 10, 12),
    dayEnd = new Date(2026, 10, 13);
  const allDayIcs = editedEventIcs(
    event,
    {
      ...event,
      allDay: true,
      start: dayStart.toISOString(),
      end: dayEnd.toISOString(),
    },
    NOW,
  );
  assert.match(allDayIcs, /DTSTART;VALUE=DATE:20261112/);
  assert.match(allDayIcs, /DTEND;VALUE=DATE:20261113/);
  assert.equal(parseCalendar(allDayIcs, source)[0].allDay, true);
});

test("repeating iCloud events keep their schedule and exceptions; their time cannot be changed here", () => {
  const event = imported(series);
  const ics = editedEventIcs(event, { ...event, title: "Gym class" }, NOW);
  const [parsed] = parseCalendar(ics, source);
  assert.equal(parsed.title, "Gym class");
  assert.match(ics, /RRULE:FREQ=WEEKLY;COUNT=4/);
  assert.match(ics, /SUMMARY:Gym \(moved\)/);
  assert.equal(occurrences(parsed, new Date("2026-11-01"), new Date("2026-12-31")).length, 4);
  assert.throws(
    () =>
      editedEventIcs(
        event,
        {
          ...event,
          start: "2026-11-10T11:00:00.000Z",
          end: "2026-11-10T12:00:00.000Z",
        },
        NOW,
      ),
    /repeating/i,
  );
});

test("new iCloud events get a UID, the chosen repeat schedule and valid all-day dates", () => {
  const ics = newEventIcs(
    {
      title: "Bea bday",
      start: new Date(2027, 6, 23).toISOString(),
      end: new Date(2027, 6, 24).toISOString(),
      allDay: true,
      repeat: "yearly",
      location: "",
      notes: "",
    },
    "new-uid",
    NOW,
  );
  assert.match(ics, /UID:new-uid/);
  assert.match(ics, /RRULE:FREQ=YEARLY/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270723/);
  const [parsed] = parseCalendar(ics, source);
  assert.equal(parsed.title, "Bea bday");
  assert.equal(occurrences(parsed, new Date("2028-07-01"), new Date("2028-08-01")).length, 1);
  assert.match(
    newEventIcs(
      {
        title: "Gym",
        start: "2026-11-10T10:00:00.000Z",
        end: "2026-11-10T11:00:00.000Z",
        allDay: false,
        repeat: "weekdays",
      },
      "u2",
      NOW,
    ),
    /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR/,
  );
});

test("the iCloud writer only sends guarded PUT and DELETE requests to iCloud", async () => {
  const credentials = { username: "me@icloud.com", password: "app-password" };
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status: 204, headers: { etag: '"v2"' } });
  };
  await assert.rejects(
    icloudWrite("https://example.com/x.ics", {
      method: "PUT",
      body: "x",
      ifMatch: '"v1"',
      credentials,
      fetch: fake,
    }),
    /iCloud/,
  );
  await assert.rejects(
    icloudWrite(OBJECT_URL, {
      method: "PROPPATCH",
      ifMatch: '"v1"',
      credentials,
      fetch: fake,
    }),
    /PUT or DELETE/,
  );
  await assert.rejects(
    icloudWrite(OBJECT_URL, {
      method: "PUT",
      body: "x",
      credentials,
      fetch: fake,
    }),
    /version/i,
  );
  await assert.rejects(
    icloudWrite(OBJECT_URL, { method: "DELETE", credentials, fetch: fake }),
    /version/i,
  );
  assert.equal(calls.length, 0);
  const { etag } = await icloudWrite(OBJECT_URL, {
    method: "PUT",
    body: "x",
    ifMatch: '"v1"',
    credentials,
    fetch: fake,
  });
  assert.equal(etag, '"v2"');
  assert.equal(calls[0].init.headers["If-Match"], '"v1"');
  assert.equal(
    calls[0].init.headers.Authorization,
    `Basic ${Buffer.from("me@icloud.com:app-password").toString("base64")}`,
  );
  assert.equal(calls[0].init.redirect, "manual");
  const conflict = async () => new Response(null, { status: 412 });
  await assert.rejects(
    icloudWrite(OBJECT_URL, {
      method: "PUT",
      body: "x",
      ifMatch: '"old"',
      credentials,
      fetch: conflict,
    }),
    (error) => error.conflict === true && /another device/i.test(error.message),
  );
  const redirect = async () =>
    new Response(null, {
      status: 301,
      headers: { location: "https://example.com/" },
    });
  await assert.rejects(
    icloudWrite(OBJECT_URL, {
      method: "DELETE",
      ifMatch: '"v1"',
      credentials,
      fetch: redirect,
    }),
    /redirect/i,
  );
});

const account = {
  id: "icloud:me",
  provider: "icloud",
  calendars: [
    { id: CALENDAR_URL, name: "Casa" },
    { id: "icloud-contacts-birthdays", name: "Birthdays from iPhone Contacts" },
  ],
};
const logDir = () => mkdtempSync(join(tmpdir(), "daybook-icloud-"));
const recorder = (response = { etag: '"v2"' }) => {
  const calls = [];
  const write = async (url, options) => {
    calls.push({ url, ...options });
    return response;
  };
  return { calls, write };
};

test("saving an edited iCloud event updates iCloud first, logs the old version, and keeps the Daybook reminder", async () => {
  const event = imported(single),
    state = { ...emptyState(), events: [event] },
    dir = logDir(),
    { calls, write } = recorder();
  const apply = await changeICloudEvent({
    action: {
      type: "saveEvent",
      item: { ...event, title: "Dentist 2", reminder: 30 },
    },
    previous: event,
    account,
    credentials: {},
    logFile: join(dir, "log.jsonl"),
    write,
    now: NOW,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].url, OBJECT_URL);
  assert.equal(calls[0].ifMatch, '"v1"');
  const saved = apply(state).events.find((e) => e.id === "local-1");
  assert.equal(saved.title, "Dentist 2");
  assert.equal(saved.reminder, 30);
  assert.equal(saved.source.etag, '"v2"');
  const log = readFileSync(join(dir, "log.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(log[0].kind, "update");
  assert.equal(log[0].previousIcs, event.ical);
});

test("the old version is logged even when iCloud rejects the change", async () => {
  const event = imported(single),
    dir = logDir();
  const write = async () => {
    throw Object.assign(new Error("This event was changed on another device."), { conflict: true });
  };
  await assert.rejects(
    changeICloudEvent({
      action: { type: "deleteEvent", id: event.id },
      previous: event,
      account,
      credentials: {},
      logFile: join(dir, "log.jsonl"),
      write,
      now: NOW,
    }),
    /another device/,
  );
  assert.ok(existsSync(join(dir, "log.jsonl")));
});

test("deleting an iCloud event deletes it on iCloud with its version tag, then locally", async () => {
  const event = imported(single),
    state = { ...emptyState(), events: [event] },
    { calls, write } = recorder({ etag: null });
  const apply = await changeICloudEvent({
    action: { type: "deleteEvent", id: event.id },
    previous: event,
    account,
    credentials: {},
    logFile: join(logDir(), "log.jsonl"),
    write,
    now: NOW,
  });
  assert.deepEqual(
    calls.map((c) => [c.method, c.url, c.ifMatch]),
    [["DELETE", OBJECT_URL, '"v1"']],
  );
  assert.equal(apply(state).events.length, 0);
});

test("creating an event in an iCloud calendar uses a new address that must not already exist", async () => {
  const { calls, write } = recorder();
  const item = {
    title: "Lunch",
    start: "2026-11-20T12:00:00.000Z",
    end: "2026-11-20T13:00:00.000Z",
    allDay: false,
    repeat: "none",
    reminder: 10,
    category: "personal",
    location: "",
    notes: "",
    saveTo: { accountId: account.id, calendarId: CALENDAR_URL },
  };
  const apply = await changeICloudEvent({
    action: { type: "saveEvent", item },
    previous: null,
    account,
    credentials: {},
    logFile: join(logDir(), "log.jsonl"),
    write,
    now: NOW,
  });
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].ifNoneMatch, "*");
  assert.ok(calls[0].url.startsWith(CALENDAR_URL) && calls[0].url.endsWith(".ics"));
  const [saved] = apply(emptyState()).events;
  assert.equal(saved.title, "Lunch");
  assert.equal(saved.source.type, "icloud-calendar");
  assert.equal(saved.source.url, calls[0].url);
  assert.equal(saved.source.etag, '"v2"');
  assert.equal(saved.category, "personal");
  assert.equal("saveTo" in saved, false);
  await assert.rejects(
    changeICloudEvent({
      action: {
        type: "saveEvent",
        item: {
          ...item,
          saveTo: {
            accountId: account.id,
            calendarId: "icloud-contacts-birthdays",
          },
        },
      },
      previous: null,
      account,
      credentials: {},
      logFile: join(logDir(), "log.jsonl"),
      write,
      now: NOW,
    }),
    /calendar/i,
  );
});

test("events synced before two-way editing must sync once before they can be changed", async () => {
  const event = {
      ...imported(single),
      source: { ...source, url: undefined, etag: undefined },
    },
    { calls, write } = recorder();
  await assert.rejects(
    changeICloudEvent({
      action: { type: "saveEvent", item: { ...event, title: "x" } },
      previous: event,
      account,
      credentials: {},
      logFile: join(logDir(), "log.jsonl"),
      write,
      now: NOW,
    }),
    /sync/i,
  );
  assert.equal(calls.length, 0);
});

test("an invalid edit is rejected before anything is sent to iCloud", async () => {
  const event = imported(single),
    { calls, write } = recorder();
  await assert.rejects(
    changeICloudEvent({
      action: { type: "saveEvent", item: { ...event, title: "   " } },
      previous: event,
      account,
      credentials: {},
      logFile: join(logDir(), "log.jsonl"),
      write,
      now: NOW,
    }),
    /title/i,
  );
  assert.equal(calls.length, 0);
});

test("changing only the Daybook reminder or category stays local and sends nothing to iCloud", async () => {
  const event = imported(single),
    state = { ...emptyState(), events: [event] },
    { calls, write } = recorder();
  const apply = await changeICloudEvent({
    action: { type: "saveEvent", item: { ...event, reminder: 60, category: "work" } },
    previous: event,
    account,
    credentials: {},
    logFile: join(logDir(), "log.jsonl"),
    write,
    now: NOW,
  });
  assert.equal(calls.length, 0);
  const saved = apply(state).events[0];
  assert.equal(saved.reminder, 60);
  assert.equal(saved.category, "work");
  assert.equal(saved.source.etag, '"v1"');
});

test("new repeating iCloud events use the local time zone so they keep their time across clock changes", async () => {
  const { calls, write } = recorder();
  const item = {
    title: "Gym",
    start: "2026-07-06T08:00:00.000Z",
    end: "2026-07-06T09:00:00.000Z",
    allDay: false,
    repeat: "weekly",
    reminder: 10,
    category: "personal",
    location: "",
    notes: "",
    saveTo: { accountId: account.id, calendarId: CALENDAR_URL },
  };
  const apply = await changeICloudEvent({
    action: { type: "saveEvent", item },
    previous: null,
    account,
    credentials: {},
    logFile: join(logDir(), "log.jsonl"),
    write,
    now: NOW,
    timeZone: "Europe/Lisbon",
  });
  assert.match(calls[0].body, /DTSTART;TZID=Europe\/Lisbon:20260706T090000/);
  assert.match(calls[0].body, /BEGIN:VTIMEZONE/);
  const [saved] = apply(emptyState()).events;
  assert.deepEqual(
    occurrences(saved, new Date("2026-11-02T00:00:00Z"), new Date("2026-11-03T00:00:00Z")).map(
      (o) => o.start,
    ),
    ["2026-11-02T09:00:00.000Z"],
  );
});

test("edits rewrite only changed fields and drop the phone map pin when the place changes", () => {
  const withPin = single.replace(
    "LOCATION:Lisbon\r\n",
    "LOCATION;LANGUAGE=pt:Lisbon\r\nX-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-TITLE=Lisbon:geo:38.7,-9.1\r\n",
  );
  const event = imported(withPin);
  const titleOnly = editedEventIcs(event, { ...event, title: "Dentist 2" }, NOW);
  assert.match(titleOnly, /LOCATION;LANGUAGE=pt:Lisbon/);
  assert.match(titleOnly, /X-APPLE-STRUCTURED-LOCATION/);
  const moved = editedEventIcs(event, { ...event, location: "Porto" }, NOW);
  assert.match(moved, /LOCATION:Porto/);
  assert.doesNotMatch(moved, /X-APPLE-STRUCTURED-LOCATION/);
});

test("times are compared to the minute, so a title edit never counts as moving a repeating event", () => {
  const event = imported(series.replace("DTSTART:20261110T100000Z", "DTSTART:20261110T100030Z"));
  const minuteStart = new Date(Math.floor(+new Date(event.start) / 60000) * 60000).toISOString();
  assert.doesNotThrow(() =>
    editedEventIcs(event, { ...event, start: minuteStart, title: "Gym class" }, NOW),
  );
});

test("edited events keep a calendar PRODID", () => {
  const event = imported(single);
  assert.match(editedEventIcs(event, { ...event, title: "x" }, NOW), /PRODID:/);
});
