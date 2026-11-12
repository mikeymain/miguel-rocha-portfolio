// Sports settings: preset teams, teams found through ESPN search, calendar and alert options.
import React, { useState } from "react";
import { Search, Plus, X } from "lucide-react";
import { Toggle } from "./ui.jsx";
import { request } from "./bridge.js";
import { SPORTS_TEAMS, MAX_CUSTOM_TEAMS, sportsSettings } from "./core/sports.js";
import { DEFAULT_STARS, MAX_STARS } from "./core/superstars.js";

const ALERT_CHOICES = [0, 5, 10, 15, 30, 60];

// The star list, one player per line, as ESPN spells the name (accents optional).
function StarList({ stars, onSave }) {
  const [text, setText] = useState(stars.join("\n")),
    [error, setError] = useState("");
  const save = () => {
    const names = [
      ...new Set(
        text
          .split("\n")
          .map((n) => n.trim())
          .filter(Boolean),
      ),
    ];
    if (names.length > MAX_STARS) {
      setError(`List up to ${MAX_STARS} players.`);
      return;
    }
    if (names.some((n) => n.length > 60)) {
      setError("Keep each name under 60 characters.");
      return;
    }
    setError("");
    onSave(names);
  };
  return (
    <details className="star-list">
      <summary>Star list ({stars.length} players)</summary>
      <label htmlFor="star-list">One player per line</label>
      <textarea
        id="star-list"
        rows={10}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError("");
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="star-list-actions">
        <button type="button" onClick={() => setText(DEFAULT_STARS.join("\n"))}>
          Reset to defaults
        </button>
        <button type="button" className="primary" onClick={save}>
          Save list
        </button>
      </div>
    </details>
  );
}

function TeamSearch({ settings, onFollow }) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState(null),
    [searching, setSearching] = useState(false),
    [error, setError] = useState("");
  const followedIds = new Set(settings.custom.map((t) => t.id));
  const full = settings.custom.length >= MAX_CUSTOM_TEAMS;

  const search = async (event) => {
    event.preventDefault();
    const text = query.trim();
    if (text.length < 2) {
      setError("Type at least 2 characters.");
      return;
    }
    setSearching(true);
    setError("");
    try {
      setResults((await request({ type: "searchTeams", query: text })).results);
    } catch (err) {
      setResults(null);
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="team-search">
      <form onSubmit={search}>
        <label htmlFor="team-search">Add a team</label>
        <div className="team-search-field">
          <input
            id="team-search"
            placeholder="Benfica, Lakers, Eagles"
            value={query}
            maxLength={60}
            onChange={(e) => {
              setQuery(e.target.value);
              setError("");
            }}
          />
          <button type="submit" disabled={searching}>
            <Search size={15} />
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {results && !results.length && <p className="subtle">No teams found.</p>}
      {results?.length > 0 && (
        <ul className="team-results">
          {results.map((team) => (
            <li key={team.id}>
              <div>
                <strong>{team.label}</strong>
                <span>
                  {team.sportLabel || team.sport} · {team.league}
                </span>
              </div>
              <button disabled={followedIds.has(team.id) || full} onClick={() => onFollow(team)}>
                <Plus size={14} />
                {followedIds.has(team.id) ? "Following" : "Follow"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {full && (
        <p className="subtle">
          You follow {MAX_CUSTOM_TEAMS} extra teams. Remove one to add another.
        </p>
      )}
    </div>
  );
}

export default function SportsSettings({ state, run }) {
  const settings = sportsSettings(state.settings);
  const save = (patch, message = "Saved") =>
    run({ type: "settings", settings: { sports: patch } }, message);
  const refreshAfter = async (patch, message) => {
    if (await save(patch, message)) run({ type: "refreshSports" });
  };

  return (
    <section className="setting-section sports-settings" id="sports-settings">
      <div>
        <h2>Sports</h2>
        <p>Teams you follow, superstar games, and game alerts.</p>
      </div>
      <div>
        {Object.entries(SPORTS_TEAMS).map(([id, team]) => (
          <div className="setting-toggle-row" key={id}>
            <div>
              <strong>{team.label}</strong>
              <p>{team.sport}</p>
            </div>
            <Toggle
              checked={settings.teams[id]}
              label={`Follow ${team.label}`}
              onChange={(on) =>
                on ? refreshAfter({ teams: { [id]: true } }) : save({ teams: { [id]: false } })
              }
            />
          </div>
        ))}
        {settings.custom.map((team) => (
          <div className="setting-toggle-row" key={team.id}>
            <div>
              <strong>{team.label}</strong>
              <p>
                {team.sportLabel || team.sport} · {team.league}
              </p>
            </div>
            <button
              className="ghost"
              aria-label={`Stop following ${team.label}`}
              onClick={() =>
                save(
                  { custom: settings.custom.filter((t) => t.id !== team.id) },
                  `Removed ${team.label}`,
                )
              }
            >
              <X size={14} />
              Remove
            </button>
          </div>
        ))}
        <TeamSearch
          settings={settings}
          onFollow={(team) =>
            refreshAfter({ custom: [...settings.custom, team] }, `Following ${team.label}`)
          }
        />
        <div className="setting-toggle-row">
          <div>
            <strong>Show games in the calendar</strong>
          </div>
          <Toggle
            checked={settings.showInCalendar}
            label="Show games in the calendar"
            onChange={(on) => save({ showInCalendar: on })}
          />
        </div>
        <div className="setting-toggle-row">
          <div>
            <strong>Superstar games only</strong>
            <p>Only games with a star from your list on each side. F1 sessions always show.</p>
          </div>
          <Toggle
            checked={settings.superstarsOnly}
            label="NBA superstar games only"
            onChange={(on) =>
              on ? refreshAfter({ superstarsOnly: true }) : save({ superstarsOnly: false })
            }
          />
        </div>
        <StarList
          stars={settings.stars}
          onSave={(stars) => refreshAfter({ stars }, "Star list saved")}
        />
        <label>
          Notify me
          <select
            value={settings.alertMinutes}
            onChange={(e) => save({ alertMinutes: Number(e.target.value) })}
          >
            {ALERT_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "When it starts" : `${m} minutes before`}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
