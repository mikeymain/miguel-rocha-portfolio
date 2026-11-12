import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { editedEventIcs, newEventIcs, remoteFieldsChanged } from "../src/core/icloud-ics.js";
import { validateEvent } from "../src/core/calendar.js";
import { enrichTimezones } from "./google.js";
import { parseCalendar } from "../src/core/imports.js";
import { applyAction } from "../src/core/actions.js";

// The only code allowed to change iCloud. Syncing stays read-only (see icloud.js).
// Every write targets one event address on icloud.com, carries the version Aurora last saw,
// and never follows redirects, so a stale copy can't overwrite a newer phone edit.

const WRITE_TIMEOUT_MS = 30000;
const isICloudHost = (host) => host === "icloud.com" || host.endsWith(".icloud.com");

export async function icloudWrite(
  url,
  { method, body, ifMatch, ifNoneMatch, credentials, fetch: send = fetch },
) {
  const target = new URL(url);
  if (target.protocol !== "https:" || !isICloudHost(target.hostname))
    throw new Error("Aurora only sends calendar changes to iCloud.");
  if (!["PUT", "DELETE"].includes(method))
    throw new Error("Aurora only sends PUT or DELETE changes to iCloud.");
  if (!ifMatch && !(method === "PUT" && ifNoneMatch === "*"))
    throw new Error(
      "Aurora needs the event version from iCloud before changing it. Sync iCloud and try again.",
    );
  const headers = {
    Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
    ...(ifMatch ? { "If-Match": ifMatch } : { "If-None-Match": ifNoneMatch }),
    ...(method === "PUT" ? { "Content-Type": "text/calendar; charset=utf-8" } : {}),
  };
  const response = await send(target.href, {
    method,
    headers,
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
  });
  if (response.status >= 300 && response.status < 400)
    throw new Error(
      "iCloud tried to redirect the change. Nothing was changed. Sync iCloud and try again.",
    );
  if (response.status === 412)
    throw Object.assign(
      new Error(
        "This event was changed on another device. Aurora synced the latest version. Check it and try again.",
      ),
      { conflict: true },
    );
  if (response.status === 401 || response.status === 403)
    throw new Error("iCloud did not accept your sign-in. Reconnect iCloud from Accounts.");
  if (response.status === 404 && method === "DELETE") return { etag: null };
  if (response.status >= 500)
    throw new Error(
      "iCloud is temporarily unavailable. Nothing was changed. Try again in a few minutes.",
    );
  if (!response.ok)
    throw new Error(`iCloud refused the change (${response.status}). Nothing was changed.`);
  return { etag: response.headers.get("etag") };
}

function logChange(logFile, entry) {
  appendFileSync(logFile, `${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`, {
    mode: 0o600,
  });
}
function remoteAddress(event) {
  if (!event.source?.url || !event.source?.etag)
    throw new Error(
      "Sync iCloud once more before changing this event, so Aurora has its latest version.",
    );
  return { url: event.source.url, etag: event.source.etag };
}
// Parses the text that will be sent and validates the resulting event, so nothing invalid reaches iCloud.
function checkedCopy(ics, source, fields) {
  const [parsed] = parseCalendar(enrichTimezones(ics), source);
  return validateEvent({ ...parsed, ...fields });
}
// iCloud and tsdav may give version tags with or without quotes; If-Match needs the quoted form.
export function normaliseEtag(etag) {
  if (!etag) return null;
  const tag = String(etag).trim();
  return /^(W\/)?"/.test(tag) ? tag : `"${tag}"`;
}
const systemTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

async function deleteRemote({ previous, credentials, logFile, write }) {
  const { url, etag } = remoteAddress(previous);
  logChange(logFile, { kind: "delete", url, etag, previousIcs: previous.ical });
  await write(url, { method: "DELETE", ifMatch: normaliseEtag(etag), credentials });
  return (state) => applyAction(state, { type: "deleteEvent", id: previous.id });
}

async function updateRemote({ previous, item, credentials, logFile, write, now, timeZone }) {
  const local = {
    id: previous.id,
    reminder: item.reminder,
    category: item.category || previous.category,
  };
  // Reminder and category live only in Aurora: keep those edits local.
  if (!remoteFieldsChanged(previous, item)) {
    const saved = validateEvent({ ...previous, ...local });
    return (state) => applyAction(state, { type: "saveEvent", item: saved });
  }
  const { url, etag } = remoteAddress(previous);
  const ics = enrichTimezones(editedEventIcs(previous, item, now, { timeZone }));
  checkedCopy(ics, previous.source, local);
  logChange(logFile, { kind: "update", url, etag, previousIcs: previous.ical });
  const result = await write(url, {
    method: "PUT",
    body: ics,
    ifMatch: normaliseEtag(etag),
    credentials,
  });
  const saved = checkedCopy(ics, { ...previous.source, etag: normaliseEtag(result.etag) }, local);
  return (state) => applyAction(state, { type: "saveEvent", item: saved });
}

async function createRemote({ item, saveTo, account, credentials, logFile, write, now, timeZone }) {
  const calendar = account.calendars?.find(
    (c) => c.id === saveTo?.calendarId && /^https:\/\//.test(c.id),
  );
  if (!calendar) throw new Error("Choose one of your iCloud calendars to save this event to.");
  const uid = randomUUID();
  const url = new URL(`${uid}.ics`, calendar.id.endsWith("/") ? calendar.id : `${calendar.id}/`)
    .href;
  const ics = enrichTimezones(newEventIcs(item, uid, now, { timeZone }));
  const source = {
    type: "icloud-calendar",
    accountId: account.id,
    calendarId: calendar.id,
    name: calendar.name,
    url,
  };
  const local = { reminder: item.reminder, category: item.category || "personal" };
  checkedCopy(ics, source, local);
  logChange(logFile, { kind: "create", url, etag: null, previousIcs: null });
  const result = await write(url, { method: "PUT", body: ics, ifNoneMatch: "*", credentials });
  const saved = checkedCopy(ics, { ...source, etag: normaliseEtag(result.etag) }, local);
  return (state) => applyAction(state, { type: "saveEvent", item: saved });
}

// Sends one change to iCloud, then returns a function that applies the same change to Aurora's state.
// Everything is validated before the first byte is sent.
export async function changeICloudEvent({
  action,
  previous,
  account,
  credentials,
  logFile,
  write = icloudWrite,
  now = new Date(),
  timeZone = systemTimeZone(),
}) {
  if (action.type === "deleteEvent") return deleteRemote({ previous, credentials, logFile, write });
  const { saveTo, ...item } = action.item;
  if (previous) return updateRemote({ previous, item, credentials, logFile, write, now, timeZone });
  return createRemote({ item, saveTo, account, credentials, logFile, write, now, timeZone });
}
