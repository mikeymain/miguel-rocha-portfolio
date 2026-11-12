import React, { useEffect, useMemo, useRef, useState } from "react";
import Aurora from "./vendor/Aurora.jsx";
import {
  CalendarDays,
  Bell,
  Inbox,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  ArrowUpRight,
  Mail,
  RefreshCw,
  Upload,
  Clock3,
  MapPin,
  Check,
  Trash2,
  Download,
  Monitor,
  Moon,
  Sun,
  Volume2,
  Link2,
  CalendarCheck,
  Repeat2,
  Menu,
  ChevronDown,
  CheckCheck,
  AlarmClock,
  CircleHelp,
  ArrowRight,
  Trophy,
  Cake,
  Smartphone,
} from "lucide-react";
import { request, subscribe, desktop, playSound } from "./bridge.js";
import AccountsPage from "./Accounts.jsx";
import SportsPage from "./Sports.jsx";
import SportsSettings from "./SportsSettings.jsx";
import { cx, Empty, Toggle } from "./ui.jsx";
import ImportDialog from "./ImportDialog.jsx";
import { dateKey, allOccurrences, occurrences, DAY } from "./core/calendar.js";
import { sportsOccurrences, sportsSettings } from "./core/sports.js";
import { alarmOrigin } from "./core/origin.js";

const ORIGIN_ICONS = {
  alarm: AlarmClock,
  event: CalendarDays,
  birthday: Cake,
  test: Bell,
};
import { isRepeating } from "./core/icloud-ics.js";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
// Aurora background colours: polar night for the dark theme, a softer dawn for the light theme.
const AURORA_NIGHT = ["#2bffb0", "#22c8ff", "#8f6bff"];
const AURORA_DAWN = ["#3ccf9a", "#4aa8e8", "#9a7cf0"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CATEGORIES = {
  personal: "Personal",
  work: "Work",
  email: "From email",
  birthdays: "Birthdays",
};
const REPEATS = {
  none: "Does not repeat",
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};
const SOUNDS = {
  bell: "Bell",
  chime: "Chime",
  pulse: "Pulse",
  silent: "Silent",
  custom: "Custom sound",
};
const PAGES = ["calendar", "alarms", "inbox", "sports", "accounts", "settings"];
const time = (value) =>
  new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
const shortDate = (value) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
const fullDate = (value) =>
  new Date(value).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
const localInput = (value) => {
  const d = new Date(value);
  return `${dateKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const dayStart = (value) => {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const addDays = (value, n) => {
  const d = new Date(value);
  d.setDate(d.getDate() + n);
  return d;
};
const weekStart = (value) => {
  const d = dayStart(value);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};
const freshStart = (value) => {
  const d = new Date(value);
  if (dateKey(d) === dateKey(new Date())) {
    d.setHours(new Date().getHours() + 1, 0, 0, 0);
  } else d.setHours(9, 0, 0, 0);
  return d;
};

function IconButton({ label, children, className, ...props }) {
  return (
    <button
      type="button"
      className={cx("icon-button", className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("input,textarea,select,button")?.focus();
    const key = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const nodes = [
          ...ref.current.querySelectorAll(
            "button:not(:disabled), input:not(:disabled), textarea, select, a[href]",
          ),
        ];
        if (event.shiftKey && document.activeElement === nodes[0]) {
          event.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
          event.preventDefault();
          nodes[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={cx("modal", wide && "wide")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}

function MiniCalendar({ selected, setSelected }) {
  const [month, setMonth] = useState(new Date(selected));
  useEffect(() => {
    setMonth(new Date(selected));
  }, [selected]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1),
    begin = weekStart(first);
  return (
    <section className="mini-calendar" aria-label="Date picker">
      <div className="mini-header">
        <strong>
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </strong>
        <div>
          <IconButton
            label="Previous month in date picker"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronLeft size={14} />
          </IconButton>
          <IconButton
            label="Next month in date picker"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <ChevronRight size={14} />
          </IconButton>
        </div>
      </div>
      <div className="mini-grid">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d[0]}</span>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const d = addDays(begin, i);
          return (
            <button
              key={i}
              aria-label={fullDate(d)}
              aria-pressed={dateKey(d) === dateKey(selected)}
              className={cx(
                d.getMonth() !== month.getMonth() && "outside",
                dateKey(d) === dateKey(new Date()) && "today",
                dateKey(d) === dateKey(selected) && "selected",
              )}
              onClick={() => setSelected(d)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Personal events created in Aurora (no synced source) get the alarm colour.
const madeHere = (e) => !e.source && !e.readOnly && (e.category || "personal") === "personal";

// Where a synced item came from, as a short tag: icon + label.
function sourceTag(source) {
  switch (source?.type) {
    case "icloud-calendar":
      return {
        Icon: Smartphone,
        label: ["iPhone", source.name].filter(Boolean).join(" · "),
      };
    case "icloud-contacts":
    case "contacts":
      return { Icon: Smartphone, label: "iPhone contacts" };
    case "google-calendar":
      return { Icon: CalendarDays, label: "Google Calendar" };
    case "email":
      return {
        Icon: Mail,
        label: source.from ? `Email · ${source.from}` : "Email",
      };
    case "calendar-file":
      return { Icon: Upload, label: "Imported file" };
    default:
      return null;
  }
}

function EventEditor({ editor, settings, accounts = [], onClose, run }) {
  const alarm = editor.kind === "alarm",
    suggestion = editor.kind === "suggestion";
  const base = editor.item || {};
  const initialStart = base.start || freshStart(editor.date || new Date()).toISOString();
  const [form, setForm] = useState({
    title: base.title || "",
    start: localInput(initialStart),
    end: localInput(
      base.allDay && base.end
        ? addDays(base.end, -1)
        : base.end || new Date(+new Date(initialStart) + 3600000),
    ),
    allDay: base.allDay || false,
    repeat: base.repeat || "none",
    reminder: base.reminder === null ? "" : (base.reminder ?? settings.defaultReminder),
    category: base.category || "personal",
    location: base.location || "",
    notes: base.notes || "",
    enabled: base.enabled !== false,
    sound: base.sound || settings.sound,
    saveTo: "",
  });
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const synced = ["google-calendar", "icloud-contacts"].includes(base.source?.type);
  const icloud = base.source?.type === "icloud-calendar";
  // Repeating iCloud events keep their times; change those on the phone so a series can't shift by mistake.
  const lockedTime = synced || (icloud && isRepeating(base));
  const icloudCalendars = accounts
    .filter((a) => a.provider === "icloud")
    .flatMap((a) =>
      (a.calendars || [])
        .filter((c) => c.id.startsWith("https://"))
        .map((c) => ({ value: `${a.id}|${c.id}`, name: c.name })),
    );
  const canChooseCalendar = !base.id && !alarm && !suggestion && icloudCalendars.length > 0;
  const field = (name, value) => setForm((f) => ({ ...f, [name]: value }));
  const save = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      let start = new Date(form.start),
        end = new Date(form.end);
      if (form.allDay && !alarm) {
        start = dayStart(start);
        end = addDays(dayStart(end), 1);
      }
      const item = {
        ...base,
        ...form,
        id: base.id || crypto.randomUUID(),
        start: lockedTime || base.birthday ? base.start : start.toISOString(),
        end: lockedTime || base.birthday ? base.end : end.toISOString(),
        reminder: form.reminder === "" ? null : Number(form.reminder),
        enabled: form.enabled,
      };
      delete item.saveTo;
      if (form.saveTo) {
        const [accountId, calendarId] = form.saveTo.split("|");
        item.saveTo = { accountId, calendarId };
      }
      if (
        base.ical &&
        !synced &&
        !icloud &&
        (item.start !== base.start || item.end !== base.end || item.repeat !== base.repeat)
      ) {
        delete item.ical;
        delete item.externalId;
      }
      const ok = await run(
        suggestion
          ? { type: "acceptSuggestion", id: base.id, item }
          : { type: alarm ? "saveAlarm" : "saveEvent", item },
        suggestion ? "Added to your calendar" : alarm ? "Alarm saved" : "Event saved",
        true,
      );
      if (ok) onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={
        suggestion
          ? "Review email event"
          : base.id
            ? alarm
              ? "Edit alarm"
              : "Edit event"
            : alarm
              ? "New alarm"
              : "New event"
      }
      onClose={onClose}
    >
      <form onSubmit={save} className="editor-form">
        {sourceTag(base.source) && (
          <p className="source-tag">
            {React.createElement(sourceTag(base.source).Icon, { size: 13 })}
            {sourceTag(base.source).label}
          </p>
        )}
        {icloud && lockedTime && (
          <p className="subtle">Repeating: change its time on your iPhone.</p>
        )}
        {suggestion && (
          <p className="notice">
            Found “{base.excerpt}” in your email. Check the date and time before adding.
            {base.inferredTime && " No exact time was found."}
          </p>
        )}
        <label>
          Title
          <input
            autoFocus
            required
            maxLength={300}
            placeholder={alarm ? "What do you need to remember?" : "Give your event a name"}
            value={form.title}
            readOnly={synced}
            onChange={(e) => field("title", e.target.value)}
          />
        </label>
        {base.birthday ? (
          <div className="birthday-details">
            <CalendarDays size={23} />
            <div>
              <strong>
                {MONTHS[base.birthday.month - 1]} {base.birthday.day}
              </strong>
              <span>
                {base.birthday.year ? `Born in ${base.birthday.year}` : "No birth year saved"} ·
                Repeats every year
              </span>
            </div>
          </div>
        ) : (
          <div className="form-row">
            <label>
              {alarm ? "When" : "Starts"}
              <input
                required
                type="datetime-local"
                value={form.start}
                readOnly={lockedTime}
                onInput={(e) => {
                  const value = e.target.value;
                  field("start", value);
                  if (+new Date(form.end) <= +new Date(value))
                    field("end", localInput(new Date(+new Date(value) + 3600000)));
                }}
              />
            </label>
            {!alarm && (
              <label>
                Ends
                <input
                  required
                  type="datetime-local"
                  value={form.end}
                  readOnly={lockedTime}
                  onInput={(e) => field("end", e.target.value)}
                />
              </label>
            )}
          </div>
        )}
        {!alarm && !base.birthday && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={form.allDay}
              disabled={lockedTime}
              onChange={(e) => field("allDay", e.target.checked)}
            />
            All day
          </label>
        )}
        <div className="form-row">
          <label>
            Repeat
            <select
              value={form.repeat}
              disabled={synced || Boolean(base.ical) || Boolean(base.birthday)}
              onChange={(e) => field("repeat", e.target.value)}
            >
              {Object.entries(REPEATS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            {base.ical && <span className="field-hint">Imported schedule is preserved.</span>}
          </label>
          {alarm ? (
            <label>
              Sound
              <select value={form.sound} onChange={(e) => field("sound", e.target.value)}>
                {Object.entries(SOUNDS)
                  .filter(([v]) => v !== "custom" || settings.customSound)
                  .map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <label>
              Remind me
              <select value={form.reminder} onChange={(e) => field("reminder", e.target.value)}>
                <option value="">No reminder</option>
                {[0, 5, 10, 15, 30, 60, 120, 1440].map((v) => (
                  <option key={v} value={v}>
                    {v === 0
                      ? "At start"
                      : v < 60
                        ? `${v} minutes before`
                        : v < 1440
                          ? `${v / 60} hour${v > 60 ? "s" : ""} before`
                          : "1 day before"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {canChooseCalendar && (
          <label>
            Save to
            <select value={form.saveTo} onChange={(e) => field("saveTo", e.target.value)}>
              <option value="">Aurora only</option>
              {icloudCalendars.map((c) => (
                <option key={c.value} value={c.value}>
                  iCloud: {c.name} (also on your iPhone)
                </option>
              ))}
            </select>
          </label>
        )}
        {!alarm && (
          <>
            <div className="form-row">
              <label>
                Calendar
                <select
                  value={form.category}
                  disabled={synced}
                  onChange={(e) => field("category", e.target.value)}
                >
                  {Object.entries(CATEGORIES).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Location
                <input
                  placeholder="Add a place or meeting link"
                  value={form.location}
                  readOnly={synced}
                  onChange={(e) => field("location", e.target.value)}
                />
              </label>
            </div>
            <label>
              Notes
              <textarea
                rows={3}
                value={form.notes}
                readOnly={synced}
                placeholder="Anything else to remember"
                onChange={(e) => field("notes", e.target.value)}
              />
            </label>
          </>
        )}
        {base.source?.subject && (
          <div className="source-note">
            <Mail size={15} />
            <span>
              {base.source.subject}
              {base.source.from && <small>{base.source.from}</small>}
            </span>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="editor-footer">
          {base.id && !suggestion && !synced ? (
            <button
              type="button"
              className="danger ghost"
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                if (
                  await run(
                    {
                      type: alarm ? "deleteAlarm" : "deleteEvent",
                      id: base.id,
                    },
                    alarm ? "Alarm deleted" : "Event deleted",
                  )
                )
                  onClose();
              }}
            >
              <Trash2 size={15} />
              {confirmDelete
                ? icloud
                  ? isRepeating(base)
                    ? "Delete whole series from iPhone too"
                    : "Delete from iPhone too"
                  : "Confirm delete"
                : "Delete"}
            </button>
          ) : synced && base.source.url ? (
            <button
              type="button"
              className="ghost"
              onClick={() => run({ type: "openExternal", url: base.source.url })}
            >
              Open original
              <ArrowUpRight size={14} />
            </button>
          ) : (
            <span />
          )}
          <div>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={saving} type="submit">
              {saving
                ? "Saving…"
                : suggestion
                  ? "Add to calendar"
                  : alarm
                    ? "Save alarm"
                    : "Save event"}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}

function MonthView({ date, selected, setSelected, events, edit, create, setView }) {
  const begin = weekStart(new Date(date.getFullYear(), date.getMonth(), 1));
  return (
    <div className="month-calendar">
      <div className="weekday-head">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="month-grid">
        {Array.from({ length: 42 }, (_, i) => {
          const day = addDays(begin, i),
            key = dateKey(day),
            dayEvents = events.filter(
              (e) =>
                (new Date(e.start) < addDays(day, 1) && new Date(e.end) > day) ||
                (e.start === e.end && dateKey(e.start) === key),
            );
          return (
            <div
              key={key}
              className={cx(
                "day-cell",
                day.getMonth() !== date.getMonth() && "outside",
                i % 7 > 4 && "weekend",
                key === dateKey(selected) && "selected-day",
              )}
              onClick={() => setSelected(day)}
              onDoubleClick={(e) => {
                if (e.target === e.currentTarget) create(day);
              }}
            >
              <button
                className={cx("day-number", key === dateKey(new Date()) && "today")}
                aria-label={`Select ${fullDate(day)}`}
                onClick={() => setSelected(day)}
              >
                {day.getDate() === 1
                  ? `${MONTHS[day.getMonth()].slice(0, 3)} ${day.getDate()}`
                  : day.getDate()}
              </button>
              <div className="day-events">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={e.occurrenceId}
                    className={cx(
                      "calendar-event",
                      e.category,
                      madeHere(e) && "local",
                      e.allDay && "all-day",
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      edit(e);
                    }}
                    title={`${e.title} · ${e.allDay ? "All day" : time(e.start)}`}
                  >
                    <span className="event-dot" />
                    {!e.allDay && <time>{time(e.start)}</time>}
                    <span>{e.title}</span>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <button
                    className="more-events"
                    onClick={() => {
                      setSelected(day);
                      setView("day");
                    }}
                  >
                    +{dayEvents.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeView({ date, events, edit, create, view }) {
  const scroll = useRef();
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 7 * 58;
  }, [view]);
  const begin = view === "day" ? dayStart(date) : weekStart(date),
    count = view === "day" ? 1 : 7;
  const days = Array.from({ length: count }, (_, i) => addDays(begin, i));
  return (
    <div className="time-calendar" style={{ "--days": count }}>
      <div className="time-day-head">
        <span />
        {days.map((d) => (
          <div key={dateKey(d)} className={dateKey(d) === dateKey(new Date()) ? "is-today" : ""}>
            <span>{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
            <strong>{d.getDate()}</strong>
          </div>
        ))}
      </div>
      <div className="all-day-row">
        <span>All day</span>
        {days.map((d) => (
          <div key={dateKey(d)}>
            {events
              .filter((e) => e.allDay && new Date(e.start) < addDays(d, 1) && new Date(e.end) > d)
              .map((e) => (
                <button
                  className="calendar-event all-day"
                  key={e.occurrenceId}
                  onClick={() => edit(e)}
                >
                  {e.title}
                </button>
              ))}
          </div>
        ))}
      </div>
      <div className="time-scroll" ref={scroll}>
        <div className="time-grid">
          <div className="hours">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h}>{String(h).padStart(2, "0")}:00</span>
            ))}
          </div>
          {days.map((day) => {
            const dayEvents = events.filter(
              (e) => !e.allDay && new Date(e.start) < addDays(day, 1) && new Date(e.end) > day,
            );
            const lanes = [];
            const positioned = dayEvents.map((e) => {
              let lane = lanes.findIndex((last) => last <= +new Date(e.start));
              if (lane < 0) lane = lanes.length;
              lanes[lane] = +new Date(e.end);
              return { e, lane };
            });
            return (
              <div className="time-column" key={dateKey(day)}>
                {Array.from({ length: 24 }, (_, h) => (
                  <button
                    className="hour-slot"
                    aria-label={`New event ${fullDate(day)} at ${h}:00`}
                    key={h}
                    onClick={() => {
                      const d = new Date(day);
                      d.setHours(h);
                      create(d, true);
                    }}
                  />
                ))}
                {positioned.map(({ e, lane }) => {
                  const s = new Date(e.start),
                    end = new Date(e.end),
                    top = s < day ? 0 : s.getHours() * 58 + (s.getMinutes() / 60) * 58,
                    bottom =
                      end >= addDays(day, 1)
                        ? 24 * 58
                        : end.getHours() * 58 + (end.getMinutes() / 60) * 58;
                  return (
                    <button
                      key={e.occurrenceId}
                      className={cx("time-event", e.category, madeHere(e) && "local")}
                      style={{
                        top,
                        height: Math.max(28, bottom - top),
                        left: `calc(${(lane / Math.max(1, lanes.length)) * 100}% + 3px)`,
                        width: `calc(${100 / Math.max(1, lanes.length)}% - 6px)`,
                      }}
                      onClick={() => edit(e)}
                    >
                      <strong>{e.title}</strong>
                      <span>
                        {time(e.start)}–{time(e.end)}
                      </span>
                      {e.location && <small>{e.location}</small>}
                    </button>
                  );
                })}
                {dateKey(day) === dateKey(new Date()) && (
                  <div
                    className="now-line"
                    style={{
                      top: new Date().getHours() * 58 + (new Date().getMinutes() / 60) * 58,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgendaView({ events, edit, create, date }) {
  const groups = Map.groupBy(events, (e) => dateKey(e.start));
  return events.length ? (
    <div className="agenda">
      {[...groups].map(([day, items]) => (
        <section key={day}>
          <div className="agenda-date">
            <strong>{new Date(`${day}T12:00:00`).getDate()}</strong>
            <span>
              {new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", {
                weekday: "short",
                month: "short",
              })}
            </span>
          </div>
          <div>
            {items.map((e) => (
              <button className="agenda-event" key={e.occurrenceId} onClick={() => edit(e)}>
                <span className={cx("category-mark", e.category, madeHere(e) && "local")} />
                <time>{e.allDay ? "All day" : `${time(e.start)} – ${time(e.end)}`}</time>
                <div>
                  <strong>{e.title}</strong>
                  {e.location && <span>{e.location}</span>}
                </div>
                <span className="agenda-category">
                  {e.category === "sports" ? "Sports" : CATEGORIES[e.category] || "Personal"}
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  ) : (
    <Empty
      title="Nothing on the calendar yet"
      action={
        <button onClick={() => create(date)}>
          <Plus size={15} />
          Add an event
        </button>
      }
    >
      Events you add or import appear here.
    </Empty>
  );
}

function DayPanel({ date, events, state, edit, create, setPage }) {
  const day = dayStart(date),
    dayEvents = events.filter((e) => new Date(e.start) < addDays(day, 1) && new Date(e.end) > day);
  const nextAlarms = state.alarms
    // One row per alarm: a repeating alarm shows only its next time.
    .flatMap((a) =>
      occurrences({ ...a, end: a.start }, new Date(), addDays(new Date(), 7)).slice(0, 1),
    )
    .sort((a, b) => +new Date(a.start) - +new Date(b.start))
    .slice(0, 3);
  return (
    <aside className="day-panel">
      <div className="day-panel-title">
        <h2>
          {new Date(date).getDate()} <span>{MONTHS[new Date(date).getMonth()]}</span>
          <small>
            {dateKey(date) === dateKey(new Date())
              ? "Today"
              : new Date(date).toLocaleDateString("en-GB", { weekday: "long" })}
          </small>
        </h2>
        <p>
          {dayEvents.length
            ? `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"} on your calendar`
            : "No events"}
        </p>
      </div>
      <div className="day-schedule">
        {dayEvents.length ? (
          dayEvents.map((e) => (
            <button key={e.occurrenceId} className="schedule-event" onClick={() => edit(e)}>
              <span className={cx("category-mark", e.category, madeHere(e) && "local")} />
              <div>
                <time>{e.allDay ? "All day" : `${time(e.start)} – ${time(e.end)}`}</time>
                <strong>{e.title}</strong>
                {e.location && (
                  <span>
                    <MapPin size={12} />
                    {e.location}
                  </span>
                )}
                {e.reminder != null && (
                  <span>
                    <Bell size={12} />
                    {e.reminder === 0 ? "At start" : `${e.reminder} min before`}
                  </span>
                )}
              </div>
            </button>
          ))
        ) : (
          <div className="open-day">
            <CalendarCheck size={24} strokeWidth={1.3} />
            <p>No plans for this day.</p>
            <button className="text-button" onClick={() => create(date)}>
              Add something
              <Plus size={14} />
            </button>
          </div>
        )}
      </div>
      <section className="up-next">
        <div className="section-line">
          <h3>Upcoming alarms</h3>
          <IconButton label="Open alarms" onClick={() => setPage("alarms")}>
            <ArrowUpRight size={16} />
          </IconButton>
        </div>
        {nextAlarms.length ? (
          nextAlarms.map((a) => (
            <button
              className="upcoming-alarm"
              key={a.occurrenceId}
              onClick={() => setPage("alarms")}
            >
              <Bell size={15} />
              <span>
                <strong>{a.title}</strong>
                <small>{shortDate(a.start)}</small>
              </span>
              <time>{time(a.start)}</time>
            </button>
          ))
        ) : (
          <p className="subtle">
            No alarms scheduled.
            <br />
            Set one for anything you don’t want to miss.
          </p>
        )}
        <button className="small-button" onClick={() => setPage("alarms")}>
          <Plus size={14} />
          Set an alarm
        </button>
      </section>
      <div className="rail-note">
        <span className="status-dot" />
        {desktop ? "Alarms stay on in the system tray" : "Preview alarms need this tab open"}
      </div>
    </aside>
  );
}

function AlarmPage({ state, run, setEditor }) {
  const [quick, setQuick] = useState(""),
    [quickError, setQuickError] = useState("");
  const quickAlarm = async (e) => {
    e.preventDefault();
    const match = quick.trim().match(/^(?:(.*?)\s+in\s+)?(\d+)\s*(m|min|minutes?|h|hours?)?$/i);
    if (!match) {
      setQuickError("Try “tea in 5 minutes” or “40”.");
      return;
    }
    const minutes = Number(match[2]) * (/^h/i.test(match[3] || "") ? 60 : 1);
    if (minutes < 1 || minutes > 10080) {
      setQuickError("Choose a time from 1 minute to 7 days.");
      return;
    }
    if (
      await run(
        {
          type: "saveAlarm",
          item: {
            id: crypto.randomUUID(),
            title: match[1] || "Quick reminder",
            start: new Date(Date.now() + minutes * 60000).toISOString(),
            repeat: "none",
            enabled: true,
            sound: state.settings.sound,
          },
        },
        "Alarm set",
      )
    ) {
      setQuick("");
      setQuickError("");
    }
  };
  const sorted = [...state.alarms].sort(
    (a, b) => Number(b.enabled) - Number(a.enabled) || +new Date(a.start) - +new Date(b.start),
  );
  return (
    <div className="page-content alarms-page">
      <div className="page-intro">
        <div>
          <h1>Alarms</h1>
          <p>One-time and repeating reminders.</p>
        </div>
        <button className="primary" onClick={() => setEditor({ kind: "alarm" })}>
          <Plus size={16} />
          New alarm
        </button>
      </div>
      <form className="quick-alarm" onSubmit={quickAlarm}>
        <Clock3 size={20} />
        <div>
          <label htmlFor="quick-alarm">Remind me in…</label>
          <input
            id="quick-alarm"
            placeholder="40 minutes, or tea in 5 minutes"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
          />
        </div>
        <button type="submit">
          Set alarm
          <ArrowRight size={15} />
        </button>
      </form>
      {quickError && (
        <p className="error" role="alert">
          {quickError}
        </p>
      )}
      <div className="section-line alarm-list-title">
        <h2>Your alarms</h2>
        <span className="subtle">{state.alarms.filter((a) => a.enabled).length} enabled</span>
      </div>
      {!sorted.length ? (
        <Empty
          icon={AlarmClock}
          title="No alarms"
          action={
            <button onClick={() => setEditor({ kind: "alarm" })}>
              <Plus size={15} />
              Create your first alarm
            </button>
          }
        >
          Alarms you create appear here.
        </Empty>
      ) : (
        <div className="alarm-list">
          {sorted.map((alarm) => {
            const next = occurrences(
              { ...alarm, end: alarm.start },
              new Date(),
              addDays(new Date(), 370),
            )[0];
            return (
              <article className={cx("alarm-row", !alarm.enabled && "disabled")} key={alarm.id}>
                <button
                  className="alarm-main"
                  onClick={() => setEditor({ kind: "alarm", item: alarm })}
                >
                  <time>{time(alarm.start)}</time>
                  <div>
                    <h3>{alarm.title}</h3>
                    <p>
                      {REPEATS[alarm.repeat] || "Once"}
                      {alarm.repeat === "none" && ` · ${shortDate(alarm.start)}`}
                    </p>
                    <span>
                      {!alarm.enabled
                        ? "Paused"
                        : next
                          ? `Next: ${fullDate(next.start)}`
                          : "This alarm has passed"}
                    </span>
                  </div>
                </button>
                <div className="alarm-actions">
                  <span>
                    <Volume2 size={14} />
                    {SOUNDS[alarm.sound] || "Bell"}
                  </span>
                  <Toggle
                    label={`Enable ${alarm.title}`}
                    checked={alarm.enabled}
                    onChange={(enabled) => run({ type: "saveAlarm", item: { ...alarm, enabled } })}
                  />
                  <IconButton
                    label={`Edit ${alarm.title}`}
                    onClick={() => setEditor({ kind: "alarm", item: alarm })}
                  >
                    <ChevronRight size={18} />
                  </IconButton>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="alarm-footnote">
        <Bell size={18} />
        <div>
          <strong>
            {desktop
              ? "Alarms ring with the window closed."
              : "You’re viewing the browser preview."}
          </strong>
          <p>
            {desktop
              ? "Aurora stays in your system tray. Alarms ring until you snooze or dismiss them. Your PC needs to be on; missed alarms appear when it wakes."
              : "Use the Windows app for background alarms, the system tray, and Google sign-in."}
          </p>
        </div>
        <button onClick={() => run({ type: "testAlarm" })}>Test alarm</button>
      </div>
    </div>
  );
}

function InboxPage({ state, run, setEditor, setImportOpen, setPage }) {
  const [filter, setFilter] = useState("pending"),
    [selected, setSelected] = useState(null);
  const items = state.suggestions.filter((s) => s.status === filter),
    item = items.find((s) => s.id === selected) || items[0];
  return (
    <div className="page-content inbox-page">
      <div className="page-intro">
        <div>
          <h1>Email events</h1>
          <p>Dates and bookings found in your email.</p>
        </div>
        <div className="button-group">
          <button onClick={() => setImportOpen(true)}>
            <Upload size={15} />
            Import
          </button>
          <button
            disabled={!state.accounts.some((a) => a.provider === "google") || state.syncing}
            onClick={() => run({ type: "sync" }, "Email checked")}
          >
            <RefreshCw size={15} className={state.syncing ? "spinning" : ""} />
            {state.syncing ? "Checking…" : "Check email"}
          </button>
        </div>
      </div>
      <div className="tabs">
        {[
          ["pending", "Needs review"],
          ["accepted", "Added"],
          ["dismissed", "Dismissed"],
        ].map(([v, label]) => (
          <button
            className={filter === v ? "active" : ""}
            key={v}
            onClick={() => {
              setFilter(v);
              setSelected(null);
            }}
          >
            {label}
            {v === "pending" && state.suggestions.filter((s) => s.status === v).length > 0 && (
              <span>{state.suggestions.filter((s) => s.status === v).length}</span>
            )}
          </button>
        ))}
      </div>
      {!items.length ? (
        <Empty
          icon={Inbox}
          title={
            filter === "pending"
              ? "All caught up"
              : filter === "accepted"
                ? "No email events added yet"
                : "No dismissed suggestions"
          }
          action={
            filter === "pending" && !state.accounts.some((a) => a.provider === "google") ? (
              <button onClick={() => setPage("accounts")}>
                <Link2 size={15} />
                Connect Google
              </button>
            ) : (
              <button onClick={() => setImportOpen(true)}>
                <Upload size={15} />
                Import an email
              </button>
            )
          }
        >
          {filter === "pending"
            ? "Bookings and dates detected in your emails will appear here for a quick check. Calendar invitations are added automatically."
            : "Events you review will appear here."}
        </Empty>
      ) : (
        <div className="inbox-layout">
          <div className="email-list">
            {items.map((s) => (
              <button
                key={s.id}
                className={cx("email-row", item?.id === s.id && "selected")}
                onClick={() => setSelected(s.id)}
              >
                <span className="mail-avatar">
                  <Mail size={18} />
                </span>
                <div>
                  <strong>{s.title}</strong>
                  <span>{s.source?.from || "Imported email"}</span>
                  <small>
                    {shortDate(s.start)} · {s.allDay ? "Time to confirm" : time(s.start)}
                  </small>
                </div>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          {item && (
            <section className="email-detail">
              <h2>{item.title}</h2>
              <p className="subtle">{item.source?.from || "Imported message"}</p>
              <div className="detected-date">
                <CalendarDays size={22} />
                <div>
                  <strong>{fullDate(item.start)}</strong>
                  <span>
                    {item.allDay
                      ? "No exact time found"
                      : `${time(item.start)} – ${time(item.end)}`}
                  </span>
                </div>
              </div>
              <p className="notice">
                {item.inferredTime
                  ? "This email doesn’t name an exact time. Choose one before adding."
                  : "Check the details before adding. Dates in ordinary emails can be ambiguous."}
              </p>
              <blockquote>“{item.excerpt}”</blockquote>
              <details>
                <summary>
                  Read email text
                  <ChevronDown size={14} />
                </summary>
                <pre>{item.notes}</pre>
              </details>
              {item.status === "pending" && (
                <div className="detail-actions">
                  <button
                    className="primary"
                    onClick={() => setEditor({ kind: "suggestion", item })}
                  >
                    <Check size={16} />
                    Review and add
                  </button>
                  <button
                    onClick={() =>
                      run({ type: "rejectSuggestion", id: item.id }, "Suggestion dismissed")
                    }
                  >
                    Dismiss
                  </button>
                </div>
              )}
              {item.source?.url && (
                <button
                  className="text-button"
                  onClick={() => run({ type: "openExternal", url: item.source.url })}
                >
                  Open original email
                  <ArrowUpRight size={15} />
                </button>
              )}
            </section>
          )}
        </div>
      )}
      <div className="inbox-explanation">
        <CheckCheck size={18} />
        <div>
          <strong>Invitations go straight to your calendar.</strong>
          <p>
            Structured invitations, updates, and cancellations are matched to the same event. Other
            bookings stay here until you approve them.
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ state, run }) {
  const backupInput = useRef();
  const save = (settings) => run({ type: "settings", settings }, "Settings saved");
  const downloadBackup = () => {
    if (desktop) {
      run({ type: "exportBackup" }, "Backup dialog opened");
      return;
    }
    const data = { ...state, accounts: [] };
    delete data.desktop;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `daybreak-backup-${dateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="page-content settings-page">
      <div className="page-intro">
        <div>
          <h1>Settings</h1>
          <p>Appearance, reminders, startup, and backups.</p>
        </div>
        <span className="version">Aurora 0.1.0</span>
      </div>
      <section className="setting-section">
        <div>
          <h2>Appearance</h2>
          <p>Light, dark, or match Windows.</p>
        </div>
        <div className="theme-options">
          {[
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "System", Monitor],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              aria-pressed={state.settings.theme === value}
              className={cx("theme-choice", state.settings.theme === value && "active")}
              onClick={() => save({ theme: value })}
            >
              <div className={cx("theme-preview", value)}>
                <span />
                <div>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <span>
                <Icon size={14} />
                {label}
                {state.settings.theme === value && <Check size={14} />}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="setting-section">
        <div>
          <h2>Reminders & sound</h2>
          <p>Defaults for new events and alarms.</p>
        </div>
        <div className="settings-fields">
          <label>
            Default event reminder
            <select
              value={state.settings.defaultReminder}
              onChange={(e) => save({ defaultReminder: Number(e.target.value) })}
            >
              {[0, 5, 10, 15, 30, 60, 1440].map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "At start" : v === 1440 ? "1 day before" : `${v} minutes before`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Alarm sound
            <div className="inline-fields">
              <select
                value={state.settings.sound}
                onChange={(e) => save({ sound: e.target.value })}
              >
                {Object.entries(SOUNDS)
                  .filter(([v]) => v !== "custom" || state.settings.customSound)
                  .map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
              </select>
              <button onClick={() => playSound(state.settings.sound, state.settings)}>
                <Volume2 size={15} />
                Preview
              </button>
            </div>
          </label>
          <label>
            Volume <span className="range-value">{Math.round(state.settings.volume * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={state.settings.volume}
              onChange={(e) => save({ volume: Number(e.target.value) })}
            />
          </label>
          <div className="section-line">
            <span className="subtle">
              {state.settings.customSound?.name || "Use your own MP3, WAV, or OGG"}
            </span>
            <button
              disabled={!desktop}
              onClick={() => run({ type: "chooseSound" }, "Custom sound selected")}
            >
              <Upload size={14} />
              Choose sound
            </button>
          </div>
        </div>
      </section>
      <SportsSettings state={state} run={run} />
      <section className="setting-section">
        <div>
          <h2>Run in the background</h2>
          <p>Keep alarms running when the window is closed.</p>
        </div>
        <div>
          <div className="setting-toggle-row">
            <div>
              <strong>Start with Windows</strong>
              <p>
                {desktop
                  ? "Launch quietly in the system tray when you sign in."
                  : "Available in the Windows app."}
              </p>
            </div>
            <Toggle
              checked={state.settings.startAtLogin}
              disabled={!desktop}
              label="Start with Windows"
              onChange={(value) => save({ startAtLogin: value })}
            />
          </div>
          <div className="setting-toggle-row">
            <div>
              <strong>Closing the window keeps alarms on</strong>
              <p>Quit Aurora from the tray to stop it completely.</p>
            </div>
            <Check size={18} className="subtle" />
          </div>
          <button onClick={() => run({ type: "testAlarm" })}>
            <Bell size={15} />
            Try an alarm
          </button>
        </div>
      </section>
      <section className="setting-section">
        <div>
          <h2>Your data</h2>
          <p>Export or restore a backup file.</p>
        </div>
        <div className="backup-actions">
          <button onClick={downloadBackup}>
            <Download size={15} />
            Export backup
          </button>
          <button
            onClick={() => (desktop ? run({ type: "restoreBackup" }) : backupInput.current.click())}
          >
            <Upload size={15} />
            Restore backup
          </button>
          <input
            ref={backupInput}
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              try {
                const file = e.target.files[0];
                if (
                  file &&
                  window.confirm("Replace your browser-preview calendar with this backup?")
                )
                  await run(
                    {
                      type: "restorePreview",
                      state: JSON.parse(await file.text()),
                    },
                    "Backup restored",
                  );
              } catch (error) {
                await run({ type: "invalid", message: error.message });
              }
              e.target.value = "";
            }}
          />
          <p>
            Backups include events, alarms, and settings. Account passwords and tokens are never
            included.
          </p>
          {state.dataPath && (
            <details>
              <summary>
                Data location
                <ChevronDown size={14} />
              </summary>
              <code className="data-path">{state.dataPath}</code>
            </details>
          )}
        </div>
      </section>
      <section className="setting-section keyboard-section">
        <div>
          <h2>Keyboard shortcuts</h2>
          <p>Keys for common actions.</p>
        </div>
        <div className="shortcuts">
          {[
            ["New event", "N"],
            ["Go to today", "T"],
            ["Search", "/"],
            ["Close dialog", "Esc"],
          ].map(([label, key]) => (
            <div key={key}>
              <span>{label}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Ringing({ state, run }) {
  const alarms = Object.values(state.alarmState).filter((a) => a.status === "ringing"),
    signature = alarms.map((a) => a.key).join("|");
  const [snooze, setSnooze] = useState(5);
  useEffect(() => {
    if (!alarms.length) return;
    let stop = () => {};
    const ring = () => {
      stop();
      stop = playSound(alarms[0].sound, state.settings);
    };
    ring();
    const interval = setInterval(ring, 3000);
    return () => {
      clearInterval(interval);
      stop();
    };
  }, [signature]);
  return (
    <div className="ringing-page">
      <div className="ringing-brand">
        <CalendarDays size={18} />
        Aurora
      </div>
      <div className="ringing-icon">
        <Bell size={34} strokeWidth={1.5} />
      </div>
      <h1>
        {alarms.length > 1
          ? `${alarms.length} reminders`
          : alarmOrigin(state, alarms[0] || {}).label}
      </h1>
      <div className="ringing-list">
        {alarms.map((a) => {
          const origin = alarmOrigin(state, a);
          const OriginIcon = ORIGIN_ICONS[origin.kind] || Bell;
          return (
            <div key={a.key}>
              <div className={cx("alarm-origin", origin.kind)}>
                <OriginIcon size={14} aria-hidden="true" />
                <strong>{origin.label}</strong>
                <span>{origin.source}</span>
              </div>
              <h2>{a.title}</h2>
              <p>
                {a.missed ? "Missed while you were away · " : ""}
                {a.kind === "test" ? "Alarm preview" : `${shortDate(a.start)} · ${time(a.start)}`}
              </p>
              {origin.details.length > 0 && (
                <p className="alarm-origin-details">{origin.details.join(" · ")}</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="ringing-actions">
        <label>
          Snooze for
          <select value={snooze} onChange={(e) => setSnooze(Number(e.target.value))}>
            {[1, 5, 10, 15, 30, 60].map((v) => (
              <option value={v} key={v}>
                {v} minutes
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={async () => {
            for (const a of alarms) await run({ type: "snooze", key: a.key, minutes: snooze });
          }}
        >
          <Clock3 size={16} />
          Snooze
        </button>
        <button
          className="primary"
          onClick={async () => {
            for (const a of alarms) await run({ type: "dismiss", key: a.key });
          }}
        >
          <Check size={17} />
          {alarms.length > 1 ? "Dismiss all" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(null),
    [loadError, setLoadError] = useState(""),
    [page, setPage] = useState(
      PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "calendar",
    ),
    [date, setDate] = useState(new Date()),
    [selected, setSelected] = useState(new Date()),
    [view, setView] = useState("month"),
    [editor, setEditor] = useState(null),
    [importOpen, setImportOpen] = useState(false),
    [search, setSearch] = useState(""),
    [filters, setFilters] = useState([...Object.keys(CATEGORIES), "sports"]),
    [toast, setToast] = useState(null),
    [navOpen, setNavOpen] = useState(false),
    [darkSky, setDarkSky] = useState(false),
    [windowFocused, setWindowFocused] = useState(() => document.hasFocus()),
    [now, setNow] = useState(Date.now());
  const searchRef = useRef(),
    toastTimeout = useRef(),
    soloClick = useRef(false);
  useEffect(() => {
    const change = () => {
      const page = location.hash.slice(1);
      if (PAGES.includes(page)) {
        setPage(page);
        setSearch("");
        setNavOpen(false);
      }
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const notify = (message, error = false) => {
    setToast({ message, error });
    clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), error ? 9000 : 3500);
  };
  const run = async (action, message, propagate = false) => {
    try {
      const next = await request(action);
      setState(next);
      if (message) notify(message);
      return true;
    } catch (error) {
      if (propagate) throw error;
      notify(error.message, true);
      return false;
    }
  };
  useEffect(() => {
    request({ type: "getState" })
      .then(setState)
      .catch((e) => setLoadError(e.message));
    const unsubscribe = subscribe(setState);
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      unsubscribe();
      clearInterval(interval);
      clearTimeout(toastTimeout.current);
    };
  }, []);
  useEffect(() => {
    const theme = state?.settings.theme || "light",
      media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      setDarkSky(resolved === "dark");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [state?.settings.theme]);
  useEffect(() => {
    // The aurora only animates while the window has focus; otherwise it holds still.
    const focus = () => setWindowFocused(true),
      blur = () => setWindowFocused(false);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
    };
  }, []);
  // Memoised so clock ticks and state updates don't redraw the shader.
  const auroraSky = useMemo(
    () => (
      <div className="aurora-sky" aria-hidden="true">
        <Aurora
          colorStops={darkSky ? AURORA_NIGHT : AURORA_DAWN}
          lightMode={!darkSky}
          layers={2}
          amplitude={0.9}
          blend={0.6}
          height={0.5}
          glow={0.7}
          speed={0.35}
          brightness={darkSky ? 0.9 : 0.8}
          mouseInteraction={false}
          paused={!windowFocused}
          dpr={1}
        />
      </div>
    ),
    [darkSky, windowFocused],
  );
  const chooseDate = (d) => {
    setSelected(new Date(d));
    setDate(new Date(d));
  };
  const goPage = (p) => {
    setPage(p);
    history.replaceState(null, "", "#" + p);
    setSearch("");
    setNavOpen(false);
  };
  const create = (d = selected, exact = false) => {
    const start = exact ? d : freshStart(d);
    setEditor({
      kind: "event",
      date: d,
      item: {
        start: start.toISOString(),
        end: new Date(+start + 3600000).toISOString(),
      },
    });
  };
  const edit = (occurrence) => {
    if (occurrence.readOnly) {
      // Games not yet over open their stream; finished ones show the results page.
      if (occurrence.gameId && Date.parse(occurrence.end) > Date.now())
        run({ type: "openStream", gameId: occurrence.gameId });
      else goPage("sports");
      return;
    }
    const original = state.events.find((e) => e.id === occurrence.id);
    setEditor({ kind: "event", item: original || occurrence });
  };
  useEffect(() => {
    const handler = (e) => {
      if (
        editor ||
        importOpen ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        create();
      }
      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        chooseDate(new Date());
        setPage("calendar");
      }
      if (e.key === "/") {
        e.preventDefault();
        setPage("calendar");
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editor, importOpen, selected]);
  const range = useMemo(() => {
    if (view === "month")
      return [
        weekStart(new Date(date.getFullYear(), date.getMonth(), 1)),
        addDays(weekStart(new Date(date.getFullYear(), date.getMonth(), 1)), 42),
      ];
    if (view === "week") return [weekStart(date), addDays(weekStart(date), 7)];
    if (view === "day") return [dayStart(date), addDays(dayStart(date), 1)];
    return [dayStart(date), addDays(dayStart(date), 60)];
  }, [view, date]);
  const events = useMemo(
    () =>
      state
        ? [
            ...allOccurrences(state, range[0], range[1]),
            ...sportsOccurrences(state.sports, state.settings, range[0], range[1]),
          ]
            .sort((a, b) => +new Date(a.start) - +new Date(b.start))
            .filter(
              (e) =>
                filters.includes(e.category || "personal") &&
                (!search ||
                  `${e.title} ${e.location || ""} ${e.notes || ""}`
                    .toLowerCase()
                    .includes(search.toLowerCase())),
            )
        : [],
    [state, range, filters, search],
  );
  if (loadError)
    return (
      <main className="fatal">
        <h1>Aurora couldn’t load your calendar.</h1>
        <p>{loadError}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>
    );
  if (!state)
    return (
      <main className="loading">
        <CalendarDays size={28} />
        <span>Opening Aurora…</span>
      </main>
    );
  const pending = state.suggestions.filter((s) => s.status === "pending").length,
    ringing = Object.values(state.alarmState).some((a) => a.status === "ringing");
  if (location.hash === "#ringing") return <Ringing state={state} run={run} />;
  const move = (n) => {
    const next = new Date(date);
    if (view === "month") next.setMonth(next.getMonth() + n, 1);
    else next.setDate(next.getDate() + n * (view === "day" ? 1 : view === "agenda" ? 30 : 7));
    chooseDate(next);
  };
  // Ctrl+click on a calendar filter shows only that calendar; Ctrl+click it again shows all.
  const allFilters = [
    ...Object.keys(CATEGORIES),
    ...(sportsSettings(state.settings).showInCalendar ? ["sports"] : []),
  ];
  const markSolo = (e) => {
    soloClick.current = e.ctrlKey || e.metaKey;
  };
  const clearSolo = () => {
    soloClick.current = false;
  };
  const toggleFilter = (key, checked) => {
    const solo = soloClick.current;
    soloClick.current = false;
    setFilters((f) => {
      if (solo) return f.length === 1 && f[0] === key ? allFilters : [key];
      return checked ? [...f, key] : f.filter((k) => k !== key);
    });
  };
  const viewTitle =
    view === "day"
      ? fullDate(date)
      : view === "week"
        ? `${shortDate(range[0])} – ${shortDate(addDays(range[1], -1))} ${date.getFullYear()}`
        : `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return (
    <div className="app-shell">
      {auroraSky}
      <aside className={cx("sidebar", navOpen && "open")}>
        <div className="brand">
          <div className="brand-mark">
            <CalendarDays size={23} strokeWidth={1.6} />
          </div>
          <span>
            Aurora<span className="brand-dot">.</span>
          </span>
          <IconButton
            className="mobile-close"
            label="Close navigation"
            onClick={() => setNavOpen(false)}
          >
            <X size={19} />
          </IconButton>
        </div>
        <button
          className="sidebar-create primary"
          onClick={() => {
            create();
            setNavOpen(false);
          }}
        >
          <Plus size={17} />
          New event<kbd>N</kbd>
        </button>
        <nav aria-label="Main navigation">
          {[
            ["calendar", "Calendar", CalendarDays],
            ["alarms", "Alarms", Bell],
            ["inbox", "Email events", Inbox],
            ["sports", "Sports", Trophy],
          ].map(([value, label, Icon]) => (
            <button
              className={page === value ? "active" : ""}
              key={value}
              onClick={() => goPage(value)}
            >
              <Icon size={18} strokeWidth={1.6} />
              <span>{label}</span>
              {value === "inbox" && pending > 0 && <span className="nav-count">{pending}</span>}
            </button>
          ))}
        </nav>
        <MiniCalendar
          selected={selected}
          setSelected={(d) => {
            chooseDate(d);
            goPage("calendar");
          }}
        />
        <div className="calendar-filters">
          <h3>My calendars</h3>
          {Object.entries(CATEGORIES).map(([key, label]) => (
            <label key={key} onPointerDown={markSolo}>
              <input
                type="checkbox"
                checked={filters.includes(key)}
                onKeyDown={clearSolo}
                onChange={(e) => toggleFilter(key, e.target.checked)}
              />
              <span className={cx("calendar-swatch", key)} />
              {label}
            </label>
          ))}
          {sportsSettings(state.settings).showInCalendar && (
            <label onPointerDown={markSolo}>
              <input
                type="checkbox"
                checked={filters.includes("sports")}
                onKeyDown={clearSolo}
                onChange={(e) => toggleFilter("sports", e.target.checked)}
              />
              <span className="calendar-swatch sports" />
              Sports
            </label>
          )}
          <button className="text-button" onClick={() => goPage("accounts")}>
            <Plus size={14} />
            Connect a calendar
          </button>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setImportOpen(true)}>
            <Upload size={17} strokeWidth={1.6} />
            Import events
          </button>
          <button
            className={page === "accounts" ? "active" : ""}
            onClick={() => goPage("accounts")}
          >
            <Link2 size={17} strokeWidth={1.6} />
            Accounts
          </button>
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => goPage("settings")}
          >
            <Settings size={17} strokeWidth={1.6} />
            Settings
          </button>
          <div className="local-account">
            <span className="user-avatar">M</span>
            <div>
              <strong>My calendar</strong>
              <span>
                {state.accounts.length
                  ? `${state.accounts.length} connected account${state.accounts.length === 1 ? "" : "s"}`
                  : "Saved on this PC"}
              </span>
            </div>
            <span className="status-dot" />
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="mobile-bar">
          <IconButton label="Open navigation" onClick={() => setNavOpen(true)}>
            <Menu size={20} />
          </IconButton>
          <strong>Aurora</strong>
          <IconButton label="New event" onClick={() => create()}>
            <Plus size={20} />
          </IconButton>
        </div>
        {state.storageWarning && (
          <div className="storage-warning" role="alert">
            {state.storageWarning}
          </div>
        )}
        {page === "calendar" ? (
          <>
            <header className="calendar-header">
              <div className="calendar-title">
                <h1>{viewTitle}</h1>
                <div className="date-nav">
                  <IconButton label="Previous period" onClick={() => move(-1)}>
                    <ChevronLeft size={17} />
                  </IconButton>
                  <IconButton label="Next period" onClick={() => move(1)}>
                    <ChevronRight size={17} />
                  </IconButton>
                  <button onClick={() => chooseDate(new Date())}>Today</button>
                </div>
              </div>
              <div className="calendar-tools">
                <div className="search-field">
                  <Search size={16} />
                  <input
                    ref={searchRef}
                    aria-label="Search events"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search events"
                  />
                  {search ? (
                    <IconButton label="Clear search" onClick={() => setSearch("")}>
                      <X size={13} />
                    </IconButton>
                  ) : (
                    <kbd>/</kbd>
                  )}
                </div>
                <div className="view-switch" aria-label="Calendar view">
                  {["month", "week", "day", "agenda"].map((v) => (
                    <button
                      aria-pressed={view === v}
                      className={view === v ? "active" : ""}
                      key={v}
                      onClick={() => setView(v)}
                    >
                      {v[0].toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </header>
            <div className="calendar-meta">
              <span />
              <span className="timezone">
                <Clock3 size={13} />
                {Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ")}
              </span>
            </div>
            <div className="calendar-workspace">
              <div className="calendar-canvas">
                {search ? (
                  <AgendaView events={events} edit={edit} create={create} date={selected} />
                ) : view === "month" ? (
                  <MonthView
                    date={date}
                    selected={selected}
                    setSelected={setSelected}
                    events={events}
                    edit={edit}
                    create={create}
                    setView={setView}
                  />
                ) : view === "agenda" ? (
                  <AgendaView events={events} edit={edit} create={create} date={selected} />
                ) : (
                  <TimeView date={date} events={events} edit={edit} create={create} view={view} />
                )}
              </div>
              <DayPanel
                date={selected}
                events={events}
                state={state}
                edit={edit}
                create={create}
                setPage={goPage}
              />
            </div>
            <footer className="calendar-footer">
              <span>
                <span className="status-dot" />
                {state.syncing
                  ? "Syncing your plans…"
                  : state.accounts.some((a) => a.error)
                    ? "An account needs attention"
                    : state.accounts.length
                      ? "Accounts connected · checks every 5 min"
                      : "Local calendar · changes saved automatically"}
              </span>
              <button
                onClick={() =>
                  state.accounts.length
                    ? run({ type: "sync" }, "Calendar synced")
                    : goPage("accounts")
                }
              >
                {state.accounts.length ? (
                  <RefreshCw size={13} className={state.syncing ? "spinning" : ""} />
                ) : (
                  <Link2 size={13} />
                )}{" "}
                {state.accounts.length ? "Sync now" : "Connect accounts"}
              </button>
            </footer>
          </>
        ) : page === "alarms" ? (
          <AlarmPage state={state} run={run} setEditor={setEditor} />
        ) : page === "inbox" ? (
          <InboxPage
            state={state}
            run={run}
            setEditor={setEditor}
            setImportOpen={setImportOpen}
            setPage={goPage}
          />
        ) : page === "sports" ? (
          <SportsPage state={state} run={run} />
        ) : page === "accounts" ? (
          <AccountsPage state={state} run={run} setImportOpen={setImportOpen} />
        ) : (
          <SettingsPage state={state} run={run} />
        )}
      </main>
      {editor && (
        <EventEditor
          key={`${editor.kind}:${editor.item?.id || "new"}`}
          editor={editor}
          settings={state.settings}
          accounts={state.accounts}
          onClose={() => setEditor(null)}
          run={run}
        />
      )}{" "}
      {importOpen && (
        <ImportDialog
          Modal={Modal}
          openAccounts={() => goPage("accounts")}
          onClose={() => setImportOpen(false)}
          run={run}
          state={state}
        />
      )}{" "}
      {!desktop && ringing && (
        <div className="modal-backdrop">
          <div
            className="modal ringing-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Active alarms"
          >
            <Ringing state={state} run={run} />
          </div>
        </div>
      )}
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={cx("toast", toast.error && "error")}
        >
          <span>{toast.error ? <CircleHelp size={17} /> : <Check size={17} />}</span>
          {toast.message}
          <IconButton label="Dismiss message" onClick={() => setToast(null)}>
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
