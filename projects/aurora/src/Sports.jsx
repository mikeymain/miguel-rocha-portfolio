// Sports section: live games and upcoming fixtures by day, with the team settings below.
import React, { useEffect, useMemo, useState } from "react";
import { Trophy, RefreshCw, ArrowUpRight, ChevronDown, Settings } from "lucide-react";
import BoxScore from "./BoxScore.jsx";
import { hasBoxScore } from "./core/boxscore.js";
import { gameStars } from "./core/superstars.js";
import { cx, Empty } from "./ui.jsx";
import {
  teamCatalog,
  followedTeamIds,
  followedGames,
  sportsSettings,
  splitGames,
  gameStatus,
} from "./core/sports.js";

const LOOKAHEAD_DAYS = 60;
const RESULTS_DAYS = 3;
const STATUS_TICK_MS = 30_000;

const clock = (value) =>
  new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

function dayLabel(value, now) {
  const day = new Date(value),
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    diff = Math.round(
      (new Date(day.getFullYear(), day.getMonth(), day.getDate()) - today) / 86_400_000,
    );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return day.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function GameRow({ game, live, final, stars, teamLabel, open, onToggle, run }) {
  const starNames = stars.flat();
  const superstar = stars.length >= 2 && stars.every((side) => side.length > 0);
  const where = [game.competition, game.venue].filter(Boolean).join(" · ");
  const status =
    live || final
      ? [game.score, final ? "Final" : game.detail].filter(Boolean).join(" · ") || where
      : where;
  const boxId = `box-${game.id}`;
  const canExpand = (live || final) && hasBoxScore(game);
  return (
    <div className={cx("game", open && "open")}>
      <div className={cx("game-row", live && "live")}>
        <div className="game-time">
          {live ? (
            <span className="live-badge">Live</span>
          ) : final ? (
            new Date(game.start).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })
          ) : (
            clock(game.start)
          )}
        </div>
        <div className="game-main">
          <span className={cx("game-team", game.team)}>{teamLabel}</span>
          {superstar && <span className="game-key">Superstar game</span>}
          <strong>{game.title}</strong>
          {status && <p>{status}</p>}
          {starNames.length > 0 && <p className="game-stars">Stars: {starNames.join(", ")}</p>}
        </div>
        <div className="game-actions">
          {canExpand && (
            <button
              className="ghost box-toggle"
              aria-expanded={open}
              aria-controls={open ? boxId : undefined}
              aria-label={`Box score, ${game.title}`}
              onClick={onToggle}
            >
              Box score
              <ChevronDown size={14} />
            </button>
          )}
          {!final && (
            <button className="ghost" onClick={() => run({ type: "openStream", gameId: game.id })}>
              Watch
              <ArrowUpRight size={14} />
            </button>
          )}
          {game.url && (
            <button className="ghost" onClick={() => run({ type: "openExternal", url: game.url })}>
              {game.team === "f1" ? "Schedule" : "Game page"}
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      </div>
      {open && <BoxScore id={boxId} gameId={game.id} live={live} />}
    </div>
  );
}

// Opens Settings and scrolls to the Sports section.
function openSportsSettings() {
  location.hash = "settings";
  setTimeout(
    () => document.getElementById("sports-settings")?.scrollIntoView({ block: "start" }),
    50,
  );
}

export default function SportsPage({ state, run }) {
  const [now, setNow] = useState(() => new Date());
  // Kept here so a panel stays open when its game moves from Live to Recent results.
  const [openBoxes, setOpenBoxes] = useState(() => new Set());
  const sports = state.sports || {};
  const catalog = teamCatalog(state.settings);
  const settings = sportsSettings(state.settings);
  const followed = followedTeamIds(state.settings);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), STATUS_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const missing = followed.some((team) => !sports.fetched?.[team]);
    if (missing && !sports.refreshing) run({ type: "refreshSports" });
    // Only on opening the page: later refreshes run on their own schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { live, days, results } = useMemo(() => {
    const horizon = +now + LOOKAHEAD_DAYS * 86_400_000;
    const all = followedGames(sports, state.settings);
    const split = splitGames(all, now);
    const since = +now - RESULTS_DAYS * 86_400_000;
    const results = all
      // Only games with a result: a stale cached "pre" game has no score yet.
      .filter(
        (g) =>
          gameStatus(g, now) === "final" &&
          Date.parse(g.start) > since &&
          (g.state === "post" || g.score),
      )
      .reverse();
    const grouped = new Map();
    for (const game of split.upcoming.filter((g) => Date.parse(g.start) < horizon)) {
      const label = dayLabel(game.start, now);
      grouped.set(label, [...(grouped.get(label) || []), game]);
    }
    return {
      live: split.live,
      days: [...grouped],
      results,
    };
  }, [sports, state.settings, now]);

  const errors = Object.entries(sports.errors || {})
    .filter(([team]) => followed.includes(team))
    .map(([, message]) => message);
  const row = (game, isLive, isFinal = false) => (
    <GameRow
      key={game.id}
      game={game}
      live={isLive}
      final={isFinal}
      open={openBoxes.has(game.id)}
      onToggle={() =>
        setOpenBoxes((current) => {
          const next = new Set(current);
          if (next.has(game.id)) next.delete(game.id);
          else next.add(game.id);
          return next;
        })
      }
      stars={gameStars(game, sports.rosters, settings.stars)}
      teamLabel={catalog[game.team]?.label}
      run={run}
    />
  );

  return (
    <div className="page-content sports-page">
      <div className="page-intro">
        <div>
          <h1>Sports</h1>
          <p>{followed.map((id) => catalog[id]?.label).join(", ") || "No teams followed"}</p>
        </div>
        <div className="button-group">
          <button onClick={openSportsSettings}>
            <Settings size={15} />
            Sports settings
          </button>
          <button onClick={() => run({ type: "refreshSports" })} disabled={sports.refreshing}>
            <RefreshCw size={15} className={sports.refreshing ? "spinning" : ""} />
            {sports.refreshing ? "Updating…" : "Update"}
          </button>
        </div>
      </div>
      {errors.map((message) => (
        <p className="error" role="alert" key={message}>
          {message}
        </p>
      ))}
      {live.length > 0 && (
        <section className="game-group">
          <h2>Live now</h2>
          {live.map((game) => row(game, true))}
        </section>
      )}
      {results.length > 0 && (
        <section className="game-group">
          <h2>Recent results</h2>
          {results.map((game) => row(game, false, true))}
        </section>
      )}
      {days.map(([label, games]) => (
        <section className="game-group" key={label}>
          <h2>{label}</h2>
          {games.map((game) => row(game, false))}
        </section>
      ))}
      {!live.length && !days.length && (
        <Empty icon={Trophy} title={followed.length ? "No games scheduled" : "No teams followed"}>
          {followed.length
            ? sports.refreshing
              ? "Loading schedules."
              : `Nothing in the next ${LOOKAHEAD_DAYS} days.`
            : "Follow a team in Settings."}
        </Empty>
      )}
    </div>
  );
}
