import React, { useState } from "react";
import { Upload, Search, Cloud, ArrowRight } from "lucide-react";
import { desktop, request } from "./bridge.js";

export default function ImportDialog({ Modal, onClose, run, state, openAccounts }) {
  const [tab, setTab] = useState("file"),
    [subject, setSubject] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const fileImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("Choose a file smaller than 25 MB.");
      return;
    }
    const contacts = /\.vcf$/i.test(file.name);
    if (
      await run(
        {
          type: contacts ? "importBirthdays" : "importCalendar",
          text: await file.text(),
          source: { name: file.name, ...(!contacts ? { type: "calendar-file" } : {}) },
        },
        contacts ? "Birthdays imported" : "Calendar imported",
      )
    )
      onClose();
  };
  const findEvents = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${subject}\n${text}`),
      );
      const sourceId = `paste:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
      const next = await request({
        type: "importText",
        mail: { subject: subject || "Pasted email", text, sourceId },
      });
      if (next.suggestions.length === state.suggestions.length)
        setError(
          "No new event dates found. Include a month, day, and time, such as “November 5 at 7pm”.",
        );
      else onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Import" onClose={onClose}>
      <div className="import-body">
        <div className="tabs">
          <button
            className={tab === "file" ? "active" : ""}
            onClick={() => {
              setTab("file");
              setError("");
            }}
          >
            Calendar & contacts
          </button>
          <button
            className={tab === "phone" ? "active" : ""}
            onClick={() => {
              setTab("phone");
              setError("");
            }}
          >
            From iPhone
          </button>
          <button
            className={tab === "email" ? "active" : ""}
            onClick={() => {
              setTab("email");
              setError("");
            }}
          >
            Paste an email
          </button>
        </div>
        {tab === "file" ? (
          <>
            <div className="import-target">
              <Upload size={28} strokeWidth={1.3} />
              <h3>Calendars, birthdays, and invitations</h3>
              <p>
                {desktop
                  ? "Choose .ics calendars, .vcf contact exports, or .eml email messages."
                  : "Choose an .ics calendar or .vcf contact export. Import .eml emails in the Windows app."}
              </p>
              {desktop ? (
                <button
                  className="primary"
                  onClick={async () => {
                    if (await run({ type: "importFile" }, "Import finished")) onClose();
                  }}
                >
                  Choose files
                </button>
              ) : (
                <label className="button primary file-button">
                  Choose a file
                  <input type="file" accept=".ics,.vcf" onChange={fileImport} />
                </label>
              )}
            </div>
            <p className="subtle import-hint">
              Contact birthdays repeat every year. Importing the same contact or invitation again
              updates it.
            </p>
          </>
        ) : tab === "phone" ? (
          <div className="phone-import">
            <Cloud size={29} strokeWidth={1.3} />
            <h3>Import from iPhone</h3>
            <p>
              Connect the iCloud account used on your iPhone to import its calendars and the
              birthdays saved on your contacts.
            </p>
            <button
              className="primary"
              onClick={() => {
                onClose();
                openAccounts();
              }}
            >
              Connect iCloud
              <ArrowRight size={15} />
            </button>
            <div className="phone-import-files">
              <h3>Import exported files</h3>
              <p>
                Import calendars as <strong>.ics</strong> files, or contact birthdays as a{" "}
                <strong>.vcf</strong> vCard. Aurora keeps yearly repeats and birthdays without a
                birth year.
              </p>
              <button onClick={() => setTab("file")}>
                <Upload size={14} />
                Import a file instead
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={findEvents}>
            <p className="subtle">
              Paste a booking or appointment email. You’ll review detected dates before adding them.
            </p>
            <label>
              Email subject
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Dinner reservation"
              />
            </label>
            <label>
              Email text
              <textarea
                required
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Your table is reserved on November 5 at 7pm…"
              />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              <Search size={15} />
              {busy ? "Finding dates…" : "Find events"}
            </button>
          </form>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
