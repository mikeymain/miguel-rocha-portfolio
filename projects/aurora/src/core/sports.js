import { DEFAULT_STARS, validateStars, isSuperstarGame, refreshRosters } from "./superstars.js";
// Sports schedules: followed teams, parsing of ESPN and Jolpica (F1) data, live state,
// calendar occurrences and alert timing. Pure functions: fetching lives in electron/sports.js.

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const MINUTE = 60_000;
// ESPN serves a football game summary under any football league path.
const SOCCER_SUMMARY = "soccer/fifa.friendly";

export const SPORTS_TEAMS = {
  sixers: {
    label: "76ers",
    sport: "Basketball",
    espnSport: "basketball",
    summaryPath: "basketball/nba",
    minutes: 150,
    urls: [1, 2, 3].map((type) => `${ESPN}/basketball/nba/teams/phi/schedule?seasontype=${type}`),
  },
  portugal: {
    label: "Portugal",
    sport: "Football",
    espnSport: "soccer",
    summaryPath: SOCCER_SUMMARY,
    minutes: 120,
    // Results and upcoming fixtures come from separate requests.
    urls: [
      `${ESPN}/soccer/all/teams/482/schedule`,
      `${ESPN}/soccer/all/teams/482/schedule?fixture=true`,
    ],
  },
  f1: {
    label: "Formula 1",
    sport: "F1",
    urls: ["https://api.jolpi.ca/ergast/f1/current/races.json"],
  },
};

// Typical game length per ESPN sport, used to draw games in the calendar and detect live ones.
const SPORT_MINUTES = {
  basketball: 150,
  soccer: 120,
  football: 210,
  baseball: 180,
  hockey: 150,
  rugby: 100,
};
const SLUG = /^[a-z0-9][a-z0-9.-]{0,40}$/;
const ESPN_ID = /^\d{1,10}$/;
export const MAX_CUSTOM_TEAMS = 20;
export const searchUrl = (query) =>
  `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(query)}&type=team&limit=15`;

export const customTeamId = ({ sport, league, espnId }) =>
  sport === "soccer" ? `espn:soccer:${espnId}` : `espn:${sport}:${league}:${espnId}`;

// Schedule sources for a team found through search. Football clubs and national teams use
// ESPN's all-competitions schedule; other sports use the team's league (regular season and playoffs).
export function customTeamEntry(team) {
  const urls =
    team.sport === "soccer"
      ? [
          `${ESPN}/soccer/all/teams/${team.espnId}/schedule`,
          `${ESPN}/soccer/all/teams/${team.espnId}/schedule?fixture=true`,
        ]
      : [2, 3].map(
          (type) =>
            `${ESPN}/${team.sport}/${team.league}/teams/${team.espnId}/schedule?seasontype=${type}`,
        );
  return {
    label: team.label,
    sport: team.sportLabel || team.sport,
    minutes: SPORT_MINUTES[team.sport] || 150,
    espnSport: team.sport,
    summaryPath: team.sport === "soccer" ? SOCCER_SUMMARY : `${team.sport}/${team.league}`,
    urls,
    custom: true,
  };
}

export function teamCatalog(settings) {
  const catalog = { ...SPORTS_TEAMS };
  for (const team of sportsSettings(settings).custom) catalog[team.id] = customTeamEntry(team);
  return catalog;
}

export function followedTeamIds(settings) {
  const s = sportsSettings(settings);
  return [
    ...Object.keys(SPORTS_TEAMS).filter((id) => s.teams[id]),
    ...s.custom.map((team) => team.id),
  ];
}

// ESPN search results reduced to teams Aurora can follow.
export function parseTeamSearch(json) {
  const seen = new Set();
  return (json?.items || []).flatMap((item) => {
    const team = {
      label: String(item?.displayName || "").slice(0, 80),
      sport: String(item?.sport || ""),
      league: String(item?.defaultLeagueSlug || item?.league || ""),
      espnId: String(item?.id || ""),
      sportLabel: String(item?.label || "").replace(/ Team$/, ""),
    };
    if (
      item?.type !== "team" ||
      !team.label ||
      !SLUG.test(team.sport) ||
      !SLUG.test(team.league) ||
      !ESPN_ID.test(team.espnId)
    )
      return [];
    const id = customTeamId(team);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, ...team }];
  });
}

const isValidCustomTeam = (team) =>
  Boolean(team) &&
  typeof team.label === "string" &&
  team.label.trim() !== "" &&
  team.label.length <= 80 &&
  SLUG.test(team.sport) &&
  SLUG.test(team.league) &&
  ESPN_ID.test(team.espnId) &&
  team.id === customTeamId(team) &&
  (team.sportLabel == null ||
    (typeof team.sportLabel === "string" && team.sportLabel.length <= 40));

function validateCustomTeams(custom) {
  if (!Array.isArray(custom) || custom.length > MAX_CUSTOM_TEAMS)
    throw new Error(`Follow up to ${MAX_CUSTOM_TEAMS} extra teams.`);
  const ids = new Set();
  for (const team of custom) {
    if (!isValidCustomTeam(team) || ids.has(team.id))
      throw new Error("Choose a team from the search results.");
    ids.add(team.id);
  }
}

const F1_SESSIONS = [
  ["SprintQualifying", "Sprint qualifying", 45],
  ["Sprint", "Sprint", 60],
  ["Qualifying", "Qualifying", 60],
  ["Race", "Race", 120],
];

export const DEFAULT_SPORTS_SETTINGS = {
  teams: { sixers: true, portugal: true, f1: true },
  custom: [],
  superstarsOnly: false,
  stars: DEFAULT_STARS,
  alertMinutes: 5,
  showInCalendar: true,
};

export function sportsSettings(settings = {}) {
  const saved = settings.sports || {};
  return {
    ...DEFAULT_SPORTS_SETTINGS,
    ...saved,
    teams: { ...DEFAULT_SPORTS_SETTINGS.teams, ...saved.teams },
    // Never trust stored entries: they become request URLs.
    custom: Array.isArray(saved.custom)
      ? saved.custom.filter(isValidCustomTeam).slice(0, MAX_CUSTOM_TEAMS)
      : [],
    stars: Array.isArray(saved.stars)
      ? saved.stars.filter((n) => typeof n === "string")
      : DEFAULT_STARS,
  };
}

export function validateSportsSettings(patch) {
  if (!patch || typeof patch !== "object") throw new Error("Choose valid sports settings.");
  const teams = patch.teams || {};
  for (const [id, on] of Object.entries(teams)) {
    if (!SPORTS_TEAMS[id] || typeof on !== "boolean") throw new Error("Choose a supported team.");
  }
  // calendarGames is no longer used; older backups may still contain it.
  const known = [
    "teams",
    "custom",
    "calendarGames",
    "superstarsOnly",
    "stars",
    "alertMinutes",
    "showInCalendar",
  ];
  if (Object.keys(patch).some((key) => !known.includes(key)))
    throw new Error("Choose valid sports settings.");
  if (patch.teams != null && (typeof patch.teams !== "object" || Array.isArray(patch.teams)))
    throw new Error("Choose a supported team.");
  if ("custom" in patch) validateCustomTeams(patch.custom);
  if (patch.superstarsOnly != null && typeof patch.superstarsOnly !== "boolean")
    throw new Error("Choose whether to show only superstar games.");
  if ("stars" in patch) validateStars(patch.stars);
  const minutes = patch.alertMinutes;
  if (minutes != null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 120)) {
    throw new Error("Choose an alert between 0 and 120 minutes before.");
  }
  if (patch.showInCalendar != null && typeof patch.showInCalendar !== "boolean") {
    throw new Error("Choose whether games show in the calendar.");
  }
  return patch;
}

const httpsLink = (links) =>
  (links || [])
    .map((l) => l?.href)
    .find((h) => typeof h === "string" && h.startsWith("https://")) || "";

const scoreLine = (competitors) => {
  const sides = Object.fromEntries((competitors || []).map((c) => [c.homeAway, c]));
  if (!sides.home || !sides.away) return "";
  const side = (c) => {
    const s = c.score;
    return [
      c.team?.abbreviation || "",
      typeof s === "object" && s ? s.displayValue || "" : (s ?? ""),
    ];
  };
  const [[away, awayScore], [home, homeScore]] = [side(sides.away), side(sides.home)];
  return awayScore === "" && homeScore === "" ? "" : `${away} ${awayScore} – ${homeScore} ${home}`;
};

// ESPN roster location for a team in this game: football rosters live under the competition's league.
function rosterPath(teamId, espnSport, summaryPath, leagueSlug) {
  const id = String(teamId || "");
  if (!ESPN_ID.test(id)) return "";
  if (espnSport === "soccer")
    return SLUG.test(leagueSlug || "") ? `soccer/${leagueSlug}/teams/${id}` : "";
  return summaryPath ? `${summaryPath}/teams/${id}` : "";
}

export function parseEspnSchedule(
  json,
  team,
  minutes = SPORTS_TEAMS[team]?.minutes || 120,
  espnSport = SPORTS_TEAMS[team]?.espnSport || "",
  summaryPath = SPORTS_TEAMS[team]?.summaryPath || "",
) {
  return (json?.events || []).flatMap((e) => {
    const comp = e?.competitions?.[0];
    const status = comp?.status?.type || {};
    if (!e?.id || !e.date || !Number.isFinite(Date.parse(e.date))) return [];
    // Postponed and cancelled games keep a date but will not be played then.
    if (/POSTPONED|CANCELED|CANCELLED/.test(status.name || "")) return [];
    return [
      {
        id: `espn-${e.id}`,
        espnId: String(e.id),
        summaryPath,
        team,
        title: String(e.name || "Game"),
        short: String(e.shortName || e.name || "Game"),
        start: new Date(e.date).toISOString(),
        end: new Date(Date.parse(e.date) + minutes * MINUTE).toISOString(),
        state: status.completed ? "post" : status.state || "pre",
        detail: status.shortDetail || "",
        score: status.state === "in" || status.completed ? scoreLine(comp.competitors) : "",
        competition: e.league?.name || "",
        sides: (comp?.competitors || []).map((c) => ({
          name: c.team?.displayName || "",
          rosterPath: rosterPath(c.team?.id, espnSport, summaryPath, e.league?.slug),
        })),
        venue: comp?.venue?.fullName || "",
        url: httpsLink(e.links),
      },
    ];
  });
}

export function parseF1Schedule(json) {
  const races = json?.MRData?.RaceTable?.Races || [];
  return races.flatMap((race) =>
    F1_SESSIONS.flatMap(([field, label, minutes]) => {
      const session = field === "Race" ? race : race[field];
      if (!session?.date || !session?.time) return [];
      const start = Date.parse(`${session.date}T${session.time}`);
      if (!Number.isFinite(start)) return [];
      return [
        {
          id: `f1-${race.season}-${race.round}-${field}`,
          team: "f1",
          title: `${race.raceName} – ${label}`,
          short: `${String(race.raceName).replace("Grand Prix", "GP")} – ${label}`,
          start: new Date(start).toISOString(),
          end: new Date(start + minutes * MINUTE).toISOString(),
          state: "pre",
          detail: "",
          score: "",
          competition: "Formula 1",
          sides: [],
          summaryPath: "",
          venue: race.Circuit?.circuitName || "",
          url: `https://www.formula1.com/en/racing/${race.season}`,
        },
      ];
    }),
  );
}

export function parseSchedule(team, jsonList, entry = SPORTS_TEAMS[team] || {}) {
  if (team === "f1") return jsonList.flatMap(parseF1Schedule);
  const byId = new Map();
  for (const json of jsonList)
    for (const game of parseEspnSchedule(
      json,
      team,
      entry.minutes,
      entry.espnSport,
      entry.summaryPath,
    ))
      byId.set(game.id, game);
  return [...byId.values()];
}

export function gameStatus(game, now = new Date()) {
  const start = Date.parse(game.start),
    end = Date.parse(game.end),
    t = +now;
  if (game.state === "post") return "final";
  // A cached "in" state that refreshes never cleared stops counting as live 3 hours after the expected end.
  if (game.state === "in") return t < end + 3 * 60 * MINUTE ? "live" : "final";
  if (t >= start && t < end) return "live";
  return t < start ? "upcoming" : "final";
}

// Games of followed teams, oldest first. A match between two followed teams appears once.
export function followedGames(sports, settings) {
  const followed = new Set(followedTeamIds(settings));
  const byId = new Map();
  for (const [team, games] of Object.entries(sports?.events || {}))
    if (followed.has(team))
      for (const game of games) if (!byId.has(game.id)) byId.set(game.id, game);
  return [...byId.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function splitGames(games, now = new Date()) {
  const live = [],
    upcoming = [];
  for (const game of games) {
    const status = gameStatus(game, now);
    if (status === "live") live.push(game);
    else if (status === "upcoming") upcoming.push(game);
  }
  return { live, upcoming };
}

export const isNbaGame = (g) => g.summaryPath === "basketball/nba" || g.team === "sixers";

// Games shaped like calendar occurrences, so month, week and day views can draw them.
export function sportsOccurrences(sports, settings, from, to) {
  const s = sportsSettings(settings);
  if (!s.showInCalendar) return [];
  const lo = +new Date(from),
    hi = +new Date(to);
  return (
    followedGames(sports, settings)
      .filter((g) => Date.parse(g.start) < hi && Date.parse(g.end) > lo)
      // "Superstar games only" filters NBA games; every other sport always shows.
      .filter(
        (g) => !s.superstarsOnly || !isNbaGame(g) || isSuperstarGame(g, sports?.rosters, s.stars),
      )
      .map((g) => ({
        ...g,
        title: g.short || g.title,
        gameId: g.id,
        id: `sports:${g.id}`,
        occurrenceId: `sports:${g.id}@${g.start}`,
        category: "sports",
        readOnly: true,
      }))
  );
}

// Games whose alert is due now and has not been sent. Skips games that started over 15 minutes ago.
export function dueSportsAlerts(sports, settings, sent = {}, now = new Date()) {
  const lead = sportsSettings(settings).alertMinutes;
  const t = +now;
  return followedGames(sports, settings)
    .filter((g) => {
      const start = Date.parse(g.start);
      return (
        g.state !== "post" &&
        !sent[`${g.id}@${g.start}`] &&
        t >= start - lead * MINUTE &&
        t < start + 15 * MINUTE
      );
    })
    .map((g) => ({
      game: g,
      key: `${g.id}@${g.start}`,
      minutes: Math.round((Date.parse(g.start) - t) / MINUTE),
    }));
}

export function pruneSent(sent, now = new Date()) {
  const cutoff = +now - 30 * 24 * 60 * MINUTE;
  return Object.fromEntries(Object.entries(sent || {}).filter(([, at]) => Date.parse(at) > cutoff));
}

export const emptySports = () => ({
  fetched: {},
  events: {},
  errors: {},
  attempted: {},
  rosters: {},
  sent: {},
});
const STALE_MINUTES = 180;
const LIVE_STALE_MINUTES = 2;
const RETRY_MINUTES = 5;

// True when a team's schedule should be downloaded again: every 3 hours, or every 2 minutes during a live game.
export function needsRefresh(sports, team, now = new Date()) {
  const last = Date.parse(sports?.fetched?.[team] || "");
  const failed = Date.parse(sports?.attempted?.[team] || "");
  if (sports?.errors?.[team] && Number.isFinite(failed) && +now - failed < RETRY_MINUTES * MINUTE)
    return false;
  if (!Number.isFinite(last)) return true;
  // Games cached by an older version lack the fields that key-game detection needs.
  if ((sports.events?.[team] || []).some((g) => !("sides" in g))) return true;
  const live = (sports.events?.[team] || []).some((g) => gameStatus(g, now) === "live");
  return +now - last >= (live ? LIVE_STALE_MINUTES : STALE_MINUTES) * MINUTE;
}

// Downloads followed teams that are stale (or all followed teams when forced). Keeps the cached copy on failure.
export async function refreshSports(
  sports,
  settings,
  fetchJson,
  { force = false, now = new Date() } = {},
) {
  const catalog = teamCatalog(settings);
  const next = {
    ...emptySports(),
    ...sports,
    fetched: { ...sports?.fetched },
    events: { ...sports?.events },
    errors: { ...sports?.errors },
    attempted: { ...sports?.attempted },
  };
  const due = followedTeamIds(settings).filter((team) => force || needsRefresh(next, team, now));
  await Promise.all(
    due.map(async (team) => {
      try {
        const jsonList = await Promise.all(catalog[team].urls.map(fetchJson));
        next.events[team] = parseSchedule(team, jsonList, catalog[team]);
        next.fetched[team] = now.toISOString();
        delete next.errors[team];
      } catch (error) {
        next.attempted[team] = now.toISOString();
        next.errors[team] = `Couldn't update ${catalog[team].label}: ${error.message}`;
      }
    }),
  );
  // Forget teams that are no longer followed.
  const followed = new Set(followedTeamIds(settings));
  for (const key of ["events", "fetched", "errors", "attempted"])
    for (const team of Object.keys(next[key])) if (!followed.has(team)) delete next[key][team];
  // Rosters are only needed while "superstar games only" is on.
  let rostersChanged = false;
  if (sportsSettings(settings).superstarsOnly) {
    const lo = +now - 3 * 24 * 60 * MINUTE,
      hi = +now + 60 * 24 * 60 * MINUTE;
    const games = followedGames(next, settings).filter(
      (g) => isNbaGame(g) && Date.parse(g.start) > lo && Date.parse(g.start) < hi,
    );
    const result = await refreshRosters(next.rosters || {}, games, fetchJson, now);
    next.rosters = result.rosters;
    rostersChanged = result.changed;
  }
  return { next, changed: due.length > 0 || rostersChanged };
}
