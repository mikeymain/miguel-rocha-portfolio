import React, { useState } from "react";
import {
  Cloud,
  Mail,
  Plus,
  Link2,
  Upload,
  RefreshCw,
  ArrowUpRight,
  X,
  Monitor,
} from "lucide-react";
import { desktop } from "./bridge.js";

const when = (value) =>
  new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export default function AccountsPage({ state, run, setImportOpen }) {
  const [provider, setProvider] = useState("icloud"),
    [setup, setSetup] = useState(!state.accounts.length),
    [confirm, setConfirm] = useState(null);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [clientId, setClientId] = useState(state.settings.googleClientId || ""),
    [clientSecret, setClientSecret] = useState("");
  const open = (url) => run({ type: "openExternal", url });
  const busy = state.syncing || state.connecting;
  return (
    <div className="page-content settings-page">
      <div className="page-intro">
        <div>
          <h1>Accounts</h1>
          <p>Connected iCloud and Google accounts.</p>
        </div>
        <button onClick={() => setImportOpen(true)}>
          <Upload size={15} />
          Import a file
        </button>
      </div>
      {state.accounts.map((account) => {
        const apple = account.provider === "icloud";
        return (
          <section className="account-section" key={account.id}>
            <div className="account-heading">
              {apple ? (
                <Cloud size={26} className="account-provider-icon" />
              ) : (
                <Mail size={25} className="account-provider-icon" />
              )}
              <div>
                <h2>{account.email}</h2>
                <p>{apple ? "iCloud calendars + iPhone birthdays" : "Google Calendar + Gmail"}</p>
              </div>
              <span className={`connection-state${account.error ? " has-error" : ""}`}>
                <span className="status-dot" />
                {account.error ? "Needs attention" : "Connected"}
              </span>
            </div>
            {account.error && <p className="error">{account.error}</p>}
            {account.warning && <p className="notice">{account.warning}</p>}
            <div className="account-status">
              <span>
                {account.lastSync
                  ? `Last synced ${when(account.lastSync)}`
                  : "Waiting for first sync"}
                {apple && account.birthdayCount != null
                  ? ` · ${account.birthdayCount} birthdays`
                  : ""}
              </span>
              <button
                disabled={busy}
                onClick={() =>
                  run(
                    { type: "sync", id: account.id },
                    apple
                      ? "iCloud calendars and birthdays synced"
                      : "Google calendar and email synced",
                  )
                }
              >
                <RefreshCw size={14} className={state.syncing ? "spinning" : ""} />
                {state.syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
            {account.calendars?.length > 0 && (
              <div className="account-calendars">
                <h3>Calendars to sync</h3>
                {account.calendars.map((calendar) => (
                  <label className="check-label" key={calendar.id}>
                    <input
                      type="checkbox"
                      checked={account.selectedCalendars?.includes(calendar.id) || false}
                      disabled={busy}
                      onChange={(e) =>
                        run(
                          {
                            type: "selectCalendars",
                            id: account.id,
                            ids: e.target.checked
                              ? [...(account.selectedCalendars || []), calendar.id]
                              : account.selectedCalendars.filter((id) => id !== calendar.id),
                          },
                          "Calendar selection saved. Sync to refresh.",
                        )
                      }
                    />
                    {calendar.name}
                    {calendar.primary && <span className="subtle">Primary</span>}
                  </label>
                ))}
              </div>
            )}
            <div className="account-bottom">
              <button
                className="text-button"
                onClick={() => {
                  setProvider(apple ? "icloud" : "google");
                  setEmail(account.email);
                  setSetup(true);
                }}
              >
                Reconnect
              </button>
              <button
                className="danger ghost"
                disabled={busy}
                onClick={async () => {
                  if (confirm !== account.id) {
                    setConfirm(account.id);
                    return;
                  }
                  await run(
                    { type: "disconnectAccount", id: account.id },
                    "Disconnected. Imported events and birthdays are kept.",
                  );
                  setConfirm(null);
                }}
              >
                {confirm === account.id ? "Confirm disconnect" : "Disconnect"}
              </button>
            </div>
          </section>
        );
      })}
      {!state.accounts.length && (
        <div className="account-empty-note">
          <Cloud size={20} />
          <p>
            Bring over iPhone calendars and birthdays from iCloud, then connect Gmail for
            invitations. Credentials are encrypted on this PC.
          </p>
        </div>
      )}
      {!setup && (
        <button onClick={() => setSetup(true)}>
          <Plus size={15} />
          Connect another account
        </button>
      )}
      {setup && (
        <section className="google-setup account-setup">
          <div className="section-line">
            <h2>Connect an account</h2>
            {state.accounts.length > 0 && (
              <button
                className="icon-button"
                aria-label="Close account setup"
                onClick={() => setSetup(false)}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="tabs provider-tabs">
            <button
              className={provider === "icloud" ? "active" : ""}
              onClick={() => setProvider("icloud")}
            >
              <Cloud size={15} />
              iCloud & iPhone
            </button>
            <button
              className={provider === "google" ? "active" : ""}
              onClick={() => setProvider("google")}
            >
              <Mail size={15} />
              Google & Gmail
            </button>
          </div>
          {provider === "icloud" ? (
            <>
              <p className="account-setup-description">
                Connect the Apple Account used on your iPhone. Your calendars and the birthdays
                saved on your iCloud contacts will be imported automatically.
              </p>
              <details className="setup-instructions" open={!email}>
                <summary>Get an Apple app-specific password</summary>
                <ol>
                  <li>
                    Open your{" "}
                    <button
                      className="inline-link"
                      onClick={() => open("https://account.apple.com/")}
                    >
                      Apple Account
                      <ArrowUpRight size={12} />
                    </button>{" "}
                    and sign in.
                  </li>
                  <li>
                    Choose <strong>Sign-In and Security → App-Specific Passwords</strong>.
                  </li>
                  <li>
                    Generate a password named <strong>Aurora</strong>, then paste it below. Use this
                    password instead of your normal Apple Account password.
                  </li>
                </ol>
                <p>
                  Apple requires two-factor authentication for app-specific passwords.{" "}
                  <button
                    className="inline-link"
                    onClick={() => open("https://support.apple.com/en-us/102654")}
                  >
                    Apple’s instructions
                    <ArrowUpRight size={12} />
                  </button>
                </p>
              </details>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await run(
                      { type: "connectICloud", email, password },
                      "iCloud calendars and birthdays connected",
                    )
                  ) {
                    setPassword("");
                    setSetup(false);
                  }
                }}
              >
                <label>
                  Apple Account email
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@icloud.com"
                  />
                </label>
                <label>
                  App-specific password
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                  />
                </label>
                <p className="field-hint">
                  Only iCloud calendars and birthday fields are imported. Edits and deletions to
                  iCloud events sync to your iPhone. Contact birthdays stay read-only.
                </p>
                <button
                  type="submit"
                  className="primary"
                  disabled={!desktop || busy || !email || !password}
                >
                  {state.connecting ? (
                    <RefreshCw size={16} className="spinning" />
                  ) : (
                    <Cloud size={16} />
                  )}{" "}
                  {state.connecting ? "Connecting to iCloud…" : "Connect iCloud"}
                </button>
                {!desktop && <p className="field-hint">Open the Windows app to connect iCloud.</p>}
              </form>
            </>
          ) : (
            <>
              <p className="account-setup-description">
                Use your Google Desktop app credentials, then sign in with your Google account.
                Aurora requests read-only Gmail and Calendar access.
              </p>
              <details className="setup-instructions" open={!clientId}>
                <summary>One-time Google setup</summary>
                <ol>
                  <li>
                    Create or select a project in{" "}
                    <button
                      className="inline-link"
                      onClick={() => open("https://console.cloud.google.com/apis/library")}
                    >
                      Google Cloud
                      <ArrowUpRight size={12} />
                    </button>
                    . Enable the <strong>Gmail API</strong> and <strong>Google Calendar API</strong>
                    .
                  </li>
                  <li>
                    Configure the consent screen. For a personal app in Testing, add your email as a
                    test user.
                  </li>
                  <li>
                    Create an OAuth client of type <strong>Desktop app</strong>. Copy its client ID
                    and optional client secret below.
                  </li>
                </ol>
                <p>
                  Google testing grants may expire after seven days; reconnect if requested. Your
                  calendar stays saved locally.
                </p>
              </details>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await run({ type: "connectGoogle", clientId, clientSecret }, "Google connected")
                  ) {
                    setClientSecret("");
                    setSetup(false);
                  }
                }}
              >
                <label>
                  Google Desktop client ID
                  <input
                    required
                    autoComplete="off"
                    placeholder="…apps.googleusercontent.com"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </label>
                <label>
                  Client secret <span className="subtle">(if provided by Google)</span>
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="Optional"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                </label>
                <button type="submit" className="primary" disabled={!desktop || busy || !clientId}>
                  {state.connecting ? (
                    <RefreshCw size={16} className="spinning" />
                  ) : (
                    <Link2 size={16} />
                  )}{" "}
                  {state.connecting ? "Waiting for Google…" : "Connect Google"}
                </button>
                {!desktop && (
                  <p className="field-hint">Google sign-in is available in the Windows app.</p>
                )}
              </form>
            </>
          )}
        </section>
      )}
      <div className="settings-note">
        <Monitor size={18} />
        <p>
          Events and birthdays are stored on this PC. Connected accounts are checked every five
          minutes while Aurora runs. Disconnecting keeps imported plans. Calendar and contact files
          can also be imported without connecting an account.
        </p>
      </div>
    </div>
  );
}
