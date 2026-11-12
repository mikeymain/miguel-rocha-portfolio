import { DAVClient } from "tsdav";
import ICAL from "ical.js";
import { parseCalendar, mergeInvitations } from "../src/core/imports.js";
import { parseBirthdays } from "../src/core/birthdays.js";
import { enrichTimezones } from "./google.js";

export async function readOnlyICloudFetch(input, init = {}) {
  let url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const method = (init.method || input.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS", "PROPFIND", "REPORT"].includes(method))
    throw new Error("The iCloud connection is read-only.");
  for (let redirects = 0; redirects < 6; redirects++) {
    if (
      url.protocol !== "https:" ||
      !(url.hostname === "icloud.com" || url.hostname.endsWith(".icloud.com"))
    )
      throw new Error(
        "iCloud redirected to an unsupported destination. No credentials were sent there.",
      );
    const signal = init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000);
    const response = await fetch(url, {
      ...init,
      method,
      redirect: "manual",
      signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get("location")) {
      url = new URL(response.headers.get("location"), url);
      continue;
    }
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "iCloud sign-in failed. Check your Apple Account email and app-specific password.",
      );
    if (response.status >= 500)
      throw new Error("iCloud is temporarily unavailable. Try syncing again in a few minutes.");
    return response;
  }
  throw new Error("iCloud returned too many redirects.");
}
async function clientFactory(type, credentials) {
  const client = new DAVClient({
    serverUrl: type === "caldav" ? "https://caldav.icloud.com" : "https://contacts.icloud.com",
    credentials,
    authMethod: "Basic",
    defaultAccountType: type,
    fetch: readOnlyICloudFetch,
  });
  await client.login({ loadCollections: false, loadObjects: false });
  return client;
}
function tombstone(event) {
  if (!event.ical) return { ...event, cancelled: true };
  const calendar = new ICAL.Component(ICAL.parse(event.ical));
  const master = calendar
    .getAllSubcomponents("vevent")
    .find((c) => !c.hasProperty("recurrence-id"));
  if (!master) return { ...event, cancelled: true };
  master.updatePropertyWithValue("status", "CANCELLED");
  return {
    ...event,
    ...parseCalendar(calendar.toString(), event.source)[0],
    id: event.id,
    reminder: event.reminder,
  };
}
export async function syncICloud(
  account,
  credentials,
  state,
  { clientFactory: factory = clientFactory } = {},
) {
  const client = await factory("caldav", credentials);
  const calendars = (await client.fetchCalendars()).filter(
    (c) => !c.components || c.components.includes("VEVENT"),
  );
  const contactsId = "icloud-contacts-birthdays";
  const selected = account.selectedCalendars || [...calendars.map((c) => c.url), contactsId];
  let events = [],
    birthdayCount = account.birthdayCount || 0;
  const listed = new Set(calendars.map((c) => c.url));
  const checked = new Set(selected.filter((id) => id !== contactsId && !listed.has(id)));
  for (const calendar of calendars.filter((c) => selected.includes(c.url))) {
    checked.add(calendar.url);
    const objects = await client.fetchCalendarObjects({ calendar });
    for (const object of objects) {
      if (typeof object.data !== "string")
        throw new Error(
          "iCloud returned an event without calendar data. The saved calendar was kept.",
        );
      const imported = parseCalendar(enrichTimezones(object.data), {
        type: "icloud-calendar",
        accountId: account.id,
        calendarId: calendar.url,
        name: calendar.displayName || "iCloud calendar",
        url: object.url,
        etag: object.etag,
      }).map((e) => ({
        ...e,
        category: e.category === "birthdays" ? "birthdays" : "personal",
      }));
      events = mergeInvitations(events, imported);
    }
  }
  if (selected.includes(contactsId)) {
    const contacts = await factory("carddav", credentials);
    checked.add(contactsId);
    birthdayCount = 0;
    for (const addressBook of await contacts.fetchAddressBooks()) {
      for (const card of await contacts.fetchVCards({ addressBook })) {
        if (typeof card.data !== "string")
          throw new Error(
            "iCloud returned a contact without vCard data. Saved birthdays were kept.",
          );
        const birthdays = parseBirthdays(card.data, {
          type: "icloud-contacts",
          accountId: account.id,
          calendarId: contactsId,
          name: "iPhone contact birthdays",
        });
        events = mergeInvitations(events, birthdays);
        birthdayCount += birthdays.length;
      }
    }
  }
  const present = new Set(events.map((e) => e.externalId));
  for (const previous of state.events.filter(
    (e) =>
      !e.cancelled &&
      e.source?.accountId === account.id &&
      checked.has(e.source?.calendarId) &&
      !present.has(e.externalId),
  ))
    events.push(tombstone(previous));
  return {
    events: events.map((e) => (e.ical ? { ...e, _completeSeries: true } : e)),
    suggestions: [],
    tokens: credentials,
    cache: {},
    account: {
      ...account,
      provider: "icloud",
      selectedCalendars: selected,
      birthdayCount,
      calendars: [
        ...calendars.map((c) => ({
          id: c.url,
          name: c.displayName || "iCloud calendar",
        })),
        { id: contactsId, name: "Birthdays from iPhone Contacts" },
      ],
      lastSync: new Date().toISOString(),
      error: "",
      warning: "",
    },
  };
}
