// Where a ringing reminder came from: an alarm you set, an event reminder (and which
// calendar, account or email it belongs to), or a birthday.

const CATEGORY_LABELS = {
  personal: "Personal",
  work: "Work",
  email: "From email",
  birthdays: "Birthdays",
};

const REPEAT_LABELS = {
  daily: "Repeats daily",
  weekdays: "Repeats on weekdays",
  weekly: "Repeats weekly",
  monthly: "Repeats monthly",
  yearly: "Repeats yearly",
};

function accountName(state, accountId) {
  const account = (state.accounts || []).find((a) => a.id === accountId);
  return account?.email || account?.name || "";
}

const isEmailSource = (source) =>
  source?.type === "email" ||
  (source?.type === "calendar" && Boolean(source.from || source.subject));

// Where an event lives: "iCloud · Casa", "Google Calendar · Work", "Email from Ana", ...
export function eventSource(state, event) {
  const source = event?.source || {};
  const account = accountName(state, source.accountId);
  if (isEmailSource(source)) return source.from ? `Email from ${source.from}` : "Email";
  switch (source.type) {
    case "icloud-calendar":
      return ["iCloud", source.name].filter(Boolean).join(" · ");
    case "google-calendar":
      return ["Google Calendar", source.name || account].filter(Boolean).join(" · ");
    case "icloud-contacts":
    case "contacts":
      return "iCloud contacts";
    case "calendar-file":
      return ["Imported file", source.name].filter(Boolean).join(" · ");
    case "email":
      return source.from ? `Email from ${source.from}` : "Email";
    default:
      return "Aurora calendar";
  }
}

function leadText(minutes) {
  if (!minutes) return "At the start time";
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"} before`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"} before`;
  return `${minutes} min before`;
}

// { kind, label, source, details[] } for the ringing screen.
export function alarmOrigin(state, record) {
  if (record?.kind === "test") {
    return {
      kind: "test",
      label: "Alarm preview",
      source: "Settings",
      details: [],
    };
  }
  if (record?.kind === "alarm") {
    const alarm = (state.alarms || []).find((a) => a.id === record.itemId);
    return {
      kind: "alarm",
      label: "Alarm",
      source: "Set in Aurora",
      details: [REPEAT_LABELS[alarm?.repeat] || "One-time"],
    };
  }
  const event = (state.events || []).find((e) => e.id === record?.itemId);
  const birthday = event?.category === "birthdays";
  const details = [];
  if (!birthday && event?.category) details.push(CATEGORY_LABELS[event.category] || "Personal");
  if (event?.reminder != null) details.push(leadText(Number(event.reminder)));
  if (isEmailSource(event?.source) && event.source.subject)
    details.push(`“${event.source.subject}”`);
  return {
    kind: birthday ? "birthday" : "event",
    label: birthday ? "Birthday" : "Event reminder",
    source: event ? eventSource(state, event) : "Calendar",
    details,
  };
}
