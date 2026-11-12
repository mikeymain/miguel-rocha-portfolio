import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";
import ICAL from "ical.js";
import timezoneData from "@touch4it/ical-timezones";
import { simpleParser } from "mailparser";
import { parseCalendar, mergeInvitations, suggestFromText } from "../src/core/imports.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];
export function oauthParameters(clientId, redirectUri) {
  const verifier = randomBytes(48).toString("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: randomBytes(32).toString("base64url"),
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  return { params, verifier };
}

async function tokenRequest(params) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `Google sign-in failed: ${data.error_description || data.error || response.status}. Reconnect your account.`,
    );
  return { ...data, expiresAt: Date.now() + data.expires_in * 1000 };
}
export async function connectGoogle({ clientId, clientSecret, openExternal }) {
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId || ""))
    throw new Error("Enter your Google Desktop OAuth client ID first.");
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
  const { params, verifier } = oauthParameters(clientId, redirectUri);
  try {
    const code = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error("Google sign-in timed out. Click Connect Google to try again."));
      }, 5 * 60000);
      server.on("request", (request, response) => {
        const url = new URL(request.url, redirectUri);
        if (url.pathname !== "/callback" || url.searchParams.get("state") !== params.get("state")) {
          response.writeHead(403).end("Invalid sign-in response.");
          return;
        }
        clearTimeout(timeout);
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        });
        response.end(
          '<!doctype html><title>Aurora</title><body style="font:18px system-ui;padding:64px"><h1>Return to Aurora</h1><p>Your Google sign-in response has been received. You can close this tab.</p></body>',
        );
        if (url.searchParams.has("error"))
          reject(new Error("Google access was not granted. You can try again from Accounts."));
        else if (!url.searchParams.get("code"))
          reject(new Error("Google did not return a sign-in code."));
        else resolve(url.searchParams.get("code"));
      });
      openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${params}`).catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    const tokens = await tokenRequest({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
    });
    const granted = (tokens.scope || "").split(" ");
    if (SCOPES.some((scope) => !granted.includes(scope)))
      throw new Error(
        "Aurora needs both Calendar and Gmail read access. Reconnect and select both permissions.",
      );
    const profile = await googleGet(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      tokens.access_token,
    );
    return {
      tokens: { ...tokens, clientId, clientSecret },
      email: profile.emailAddress,
    };
  } finally {
    server.close();
  }
}

export async function refreshGoogle(tokens) {
  if (tokens.expiresAt > Date.now() + 60000) return tokens;
  if (!tokens.refresh_token) throw new Error("Google access has expired. Reconnect from Accounts.");
  return {
    ...tokens,
    ...(await tokenRequest({
      client_id: tokens.clientId,
      ...(tokens.clientSecret ? { client_secret: tokens.clientSecret } : {}),
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    })),
  };
}
const RATE_LIMIT_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);
const MAX_RATE_LIMIT_RETRIES = 6;
const FIRST_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 60000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function googleError(status, body) {
  const detail = body?.error || {};
  const reason = detail.errors?.[0]?.reason || "";
  const rateLimited = status === 429 || RATE_LIMIT_REASONS.has(reason);
  const message =
    status === 401
      ? "Google access expired. Reconnect from Accounts."
      : reason === "accessNotConfigured"
        ? "Google could not sync: enable the Gmail API and Google Calendar API in your Google Cloud project."
        : rateLimited
          ? "Google is limiting requests right now. Aurora will try again at the next sync."
          : `Google could not sync (${status})${detail.message ? `: ${detail.message}` : ""}.`;
  return Object.assign(new Error(message), { status, rateLimited });
}
// Google answers "slow down" with 429 or a 403 rate-limit reason; wait and retry before giving up.
async function googleGet(url, accessToken, sleep = wait) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok) return response.json();
    const error = googleError(response.status, await response.json().catch(() => ({})));
    if (!error.rateLimited || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    await sleep(
      retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : Math.min(MAX_RETRY_DELAY_MS, FIRST_RETRY_DELAY_MS * 2 ** attempt),
    );
  }
}
async function pages(base, token, key, params = {}, sleep = wait) {
  const items = [];
  let pageToken, last;
  do {
    const query = new URLSearchParams({
      ...params,
      ...(pageToken ? { pageToken } : {}),
    });
    last = await googleGet(`${base}?${query}`, token, sleep);
    items.push(...(last[key] || []));
    pageToken = last.nextPageToken;
  } while (pageToken);
  return { items, syncToken: last.nextSyncToken };
}

export function enrichTimezones(text) {
  const calendar = new ICAL.Component(ICAL.parse(text));
  const existing = new Set(
    calendar.getAllSubcomponents("vtimezone").map((c) => c.getFirstPropertyValue("tzid")),
  );
  const tzids = [...text.matchAll(/TZID=["]?([^:;"\r\n]+)["]?[:;]/g)].map((m) => m[1]);
  for (const tzid of new Set(tzids)) {
    if (existing.has(tzid) || tzid === "UTC" || tzid === "Etc/UTC") continue;
    const definition = timezoneData.getVtimezoneComponent(tzid);
    if (!definition) throw new Error(`Calendar uses an unsupported timezone: ${tzid}.`);
    calendar.addSubcomponent(new ICAL.Component(ICAL.parse(definition)));
    existing.add(tzid);
  }
  return calendar.toString();
}

const escapeIcs = (text) =>
  String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function dateLine(name, value) {
  if (value.date) return `${name};VALUE=DATE:${value.date.replaceAll("-", "")}`;
  if (value.timeZone)
    return `${name};TZID=${value.timeZone}:${value.dateTime
      .replace(/(?:Z|[+-]\d\d:\d\d)$/, "")
      .replace(/[-:]/g, "")
      .replace(/\.\d+/, "")}`;
  return `${name}:${new Date(value.dateTime)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z/, "Z")}`;
}
export function googleCalendarToEvents(items, source = {}) {
  const byId = new Map(items.map((item) => [item.id, item]));
  items = items.map((item) =>
    item.recurringEventId && !item.iCalUID
      ? {
          ...item,
          iCalUID: byId.get(item.recurringEventId)?.iCalUID || item.recurringEventId,
        }
      : item,
  );
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Aurora//EN"];
  for (const event of items) {
    if (!event.start && event.status !== "cancelled") continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(event.iCalUID || event.id)}`,
      `SUMMARY:${escapeIcs(event.summary || "Untitled event")}`,
      `SEQUENCE:${event.sequence || 0}`,
    );
    if (event.start)
      lines.push(dateLine("DTSTART", event.start), dateLine("DTEND", event.end || event.start));
    if (event.originalStartTime) lines.push(dateLine("RECURRENCE-ID", event.originalStartTime));
    if (event.updated)
      lines.push(
        `LAST-MODIFIED:${new Date(event.updated)
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d+Z/, "Z")}`,
      );
    if (event.status === "cancelled") lines.push("STATUS:CANCELLED");
    if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
    if (event.description)
      lines.push(`DESCRIPTION:${escapeIcs(event.description.replace(/<[^>]*>/g, " "))}`);
    lines.push(...(event.recurrence || []), "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  if (lines.length === 4) return [];
  return parseCalendar(enrichTimezones(lines.join("\r\n")), {
    type: "google-calendar",
    ...source,
  }).map((event) => {
    const original =
      items.find((e) => (e.iCalUID || e.id) === event.externalId && !e.originalStartTime) ||
      items.find((e) => (e.iCalUID || e.id) === event.externalId);
    const popup = original?.reminders?.overrides?.find((r) => r.method === "popup");
    return {
      ...event,
      source: { ...event.source, url: original?.htmlLink },
      reminder: popup ? popup.minutes : 10,
    };
  });
}

export async function syncGoogle(account, tokens, cache, state, { sleep = wait } = {}) {
  tokens = await refreshGoogle(tokens);
  const access = tokens.access_token;
  const calendars = (
    await pages(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      access,
      "items",
      { maxResults: "250" },
      sleep,
    )
  ).items;
  const selected = account.selectedCalendars || calendars.filter((c) => c.primary).map((c) => c.id);
  let events = [],
    suggestions = [];
  for (const calendar of calendars.filter((c) => selected.includes(c.id))) {
    const previous = cache[calendar.id] || { events: {}, syncToken: null };
    let response,
      full = !previous.syncToken;
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`;
    try {
      response = await pages(
        base,
        access,
        "items",
        {
          maxResults: "2500",
          showDeleted: "true",
          ...(previous.syncToken ? { syncToken: previous.syncToken } : {}),
        },
        sleep,
      );
    } catch (error) {
      if (error.status !== 410) throw error;
      full = true;
      response = await pages(
        base,
        access,
        "items",
        {
          maxResults: "2500",
          showDeleted: "true",
        },
        sleep,
      );
    }
    const byId = full ? {} : { ...previous.events };
    for (const item of response.items) byId[item.id] = { ...byId[item.id], ...item };
    const imported = googleCalendarToEvents(Object.values(byId), {
      accountId: account.id,
      calendarId: calendar.id,
      name: calendar.summary,
    });
    if (full) {
      const present = new Set(imported.map((e) => e.externalId));
      for (const missing of state.events.filter(
        (e) =>
          e.source?.accountId === account.id &&
          e.source?.calendarId === calendar.id &&
          !present.has(e.externalId),
      )) {
        events.push(
          ...googleCalendarToEvents(
            [
              {
                id: missing.externalId,
                iCalUID: missing.externalId,
                status: "cancelled",
                sequence: missing.sequence || 0,
                updated: new Date().toISOString(),
              },
            ],
            missing.source,
          ),
        );
      }
    }
    events = mergeInvitations(events, imported);
    cache[calendar.id] = { events: byId, syncToken: response.syncToken };
  }
  const mail = await syncMail(account, access, events, suggestions, sleep);
  return {
    tokens,
    cache,
    events: mail.events,
    suggestions: mail.suggestions,
    account: {
      ...account,
      selectedCalendars: selected,
      calendars: calendars.map((c) => ({
        id: c.id,
        name: c.summary,
        primary: Boolean(c.primary),
      })),
      processedMailIds: [...mail.processed].slice(-10000),
      lastSync: new Date().toISOString(),
      lastMailSync: mail.complete ? new Date().toISOString() : account.lastMailSync,
      error: "",
      warning: [...new Set(mail.warnings)].join("\n"),
    },
  };
}

const MAIL_RATE_LIMIT_WARNING =
  "Gmail is limiting requests. Aurora imported your calendar and will check the remaining email at the next sync.";

// Imports invitations and suggestions from recent Gmail messages. A Gmail rate limit stops
// only this step: messages already read are kept and the rest are retried next sync.
async function syncMail(account, access, events, suggestions, sleep) {
  const processed = new Set(account.processedMailIds || []);
  const warnings = [];
  const since = Math.floor(
    (account.lastMailSync
      ? +new Date(account.lastMailSync) - 2 * 86400000
      : Date.now() - 30 * 86400000) / 1000,
  );
  try {
    const listed = await pages(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
      access,
      "messages",
      // Newsletters and social mail never hold bookings worth suggesting, and they cost rate-limit quota.
      {
        q: `after:${since} -in:spam -in:trash -category:promotions -category:social -category:forums`,
        maxResults: "100",
      },
      sleep,
    );
    for (const message of listed.items) {
      if (processed.has(message.id)) continue;
      ({ events, suggestions } = await importMessage(
        account,
        access,
        message,
        events,
        suggestions,
        warnings,
        sleep,
      ));
      processed.add(message.id);
    }
  } catch (error) {
    if (!error.rateLimited) throw error;
    warnings.push(MAIL_RATE_LIMIT_WARNING);
    return { events, suggestions, processed, warnings, complete: false };
  }
  return { events, suggestions, processed, warnings, complete: true };
}

async function importMessage(account, access, message, events, suggestions, warnings, sleep) {
  const raw = await googleGet(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=raw`,
    access,
    sleep,
  );
  if ((raw.sizeEstimate || 0) > 25 * 1024 * 1024) {
    warnings.push(
      "An email larger than 25 MB was skipped. Import its calendar attachment manually.",
    );
    return { events, suggestions };
  }
  const mail = await simpleParser(Buffer.from(raw.raw, "base64url"), {
    skipHtmlToText: false,
    skipImageLinks: true,
  });
  const source = {
    accountId: account.id,
    sourceId: message.id,
    subject: mail.subject || "Email",
    from: mail.from?.text || "",
    url: `https://mail.google.com/mail/u/${encodeURIComponent(account.email)}/#all/${message.threadId}`,
  };
  let hasInvitation = false;
  for (const attachment of mail.attachments || []) {
    if (attachment.contentType !== "text/calendar" && !/\.ics$/i.test(attachment.filename || ""))
      continue;
    try {
      events = mergeInvitations(
        events,
        parseCalendar(enrichTimezones(attachment.content.toString("utf8")), source),
      );
      hasInvitation = true;
    } catch (error) {
      warnings.push(`${mail.subject || "Email"}: ${error.message}`);
    }
  }
  if (!hasInvitation) {
    const proposals = suggestFromText(
      { ...source, text: mail.text || "" },
      mail.date || new Date(),
    );
    suggestions = [
      ...suggestions,
      ...proposals.filter((p) => !suggestions.some((s) => s.id === p.id)),
    ];
  }
  return { events, suggestions };
}
