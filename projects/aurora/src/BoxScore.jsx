// Box score panel shown under a game: line score, then player tables or team stats and key events.
import React, { useEffect, useState } from "react";
import { request } from "./bridge.js";
import { cx } from "./ui.jsx";

const LIVE_REFRESH_MS = 30_000;

function LineScore({ lineScore }) {
  return (
    <div className="box-scroll">
      <table className="box-table line-score">
        <caption className="sr-only">Score by period</caption>
        <thead>
          <tr>
            <th scope="col">Team</th>
            {lineScore.labels.map((label, i) => (
              <th scope="col" key={i}>
                {label}
              </th>
            ))}
            <th scope="col">T</th>
          </tr>
        </thead>
        <tbody>
          {lineScore.teams.map((team) => (
            <tr key={team.name}>
              <th scope="row">{team.name}</th>
              {lineScore.labels.map((label, i) => (
                <td key={i}>{team.scores[i] ?? ""}</td>
              ))}
              <td className="box-total">{team.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerTable({ group }) {
  const heading = [group.team, group.group].filter(Boolean).join(" · ");
  return (
    <>
      <h4>{heading}</h4>
      <div className="box-scroll">
        <table className="box-table players">
          <caption className="sr-only">{heading} player stats</caption>
          <thead>
            <tr>
              <th scope="col">Player</th>
              {group.labels.map((label, i) => (
                <th scope="col" key={i}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row, index) => (
              <tr
                key={`${row.name}-${index}`}
                className={cx(row.bench && "bench-start", row.dnp && "dnp")}
              >
                <th scope="row">
                  {row.name}
                  {row.position && <span className="box-pos">{row.position}</span>}
                </th>
                {row.dnp ? (
                  <td colSpan={group.labels.length} className="box-reason">
                    {row.reason}
                  </td>
                ) : (
                  group.labels.map((label, i) => <td key={i}>{row.stats[i] ?? ""}</td>)
                )}
              </tr>
            ))}
            {group.totals.length > 0 && (
              <tr className="box-totals">
                <th scope="row">Team</th>
                {group.labels.map((label, i) => (
                  <td key={i}>{group.totals[i] ?? ""}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TeamStats({ stats }) {
  return (
    <>
      <h4>Team stats</h4>
      <table className="box-table team-stats">
        <caption className="sr-only">Team stats</caption>
        <thead>
          <tr>
            <th scope="col">{stats.home}</th>
            <th scope="col">
              <span className="sr-only">Stat</span>
            </th>
            <th scope="col">{stats.away}</th>
          </tr>
        </thead>
        <tbody>
          {stats.rows.map((row) => (
            <tr key={row.label}>
              <td>{row.home}</td>
              <th scope="row">{row.label}</th>
              <td>{row.away}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default function BoxScore({ gameId, live, id }) {
  const [box, setBox] = useState(null),
    [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false,
      pending = false;
    const load = async () => {
      // Skip a tick while hidden or while the previous request is still running.
      if (pending || document.hidden) return;
      pending = true;
      try {
        const result = await request({ type: "boxScore", gameId });
        if (!cancelled) {
          setBox(result.box);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        pending = false;
      }
    };
    load();
    const timer = live ? setInterval(load, LIVE_REFRESH_MS) : null;
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [gameId, live]);

  return (
    <div className="box-score" id={id}>
      {error && !box && <p className="error">{error}</p>}
      {error && box && <p className="box-note">Couldn't update: {error}</p>}
      {!box && !error && <p className="box-note">Loading box score…</p>}
      {box && (
        <>
          {box.status && (
            <p className="box-note" aria-live="polite">
              {box.status}
            </p>
          )}
          {box.lineScore && <LineScore lineScore={box.lineScore} />}
          {box.teamStats && <TeamStats stats={box.teamStats} />}
          {box.keyEvents.length > 0 && (
            <>
              <h4>Key events</h4>
              <ul className="box-events">
                {box.keyEvents.map((event, i) => (
                  <li key={i}>
                    <span>{event.clock}</span>
                    {event.text}
                  </li>
                ))}
              </ul>
            </>
          )}
          {box.players.map((group, i) => (
            <PlayerTable key={`${group.team}-${group.group}-${i}`} group={group} />
          ))}
          {!box.lineScore && !box.players.length && !box.teamStats && (
            <p className="box-note">No stats yet.</p>
          )}
        </>
      )}
    </div>
  );
}
