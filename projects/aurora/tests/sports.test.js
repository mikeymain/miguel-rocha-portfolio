import test from "node:test";
import assert from "node:assert/strict";
import {
  parseEspnSchedule,
  parseF1Schedule,
  parseSchedule,
  gameStatus,
  splitGames,
  sportsOccurrences,
  dueSportsAlerts,
  pruneSent,
  sportsSettings,
  validateSportsSettings,
} from "../src/core/sports.js";

const espnGame = (id, date, state = "pre", extra = {}) => ({
  id,
  date,
  name: "Philadelphia 76ers at Detroit Pistons",
  links: [{ href: "sportscenter://x" }, { href: `https://www.espn.com/nba/game/_/gameId/${id}` }],
  competitions: [
    {
      status: {
        type: {
          state,
          completed: state === "post",
          shortDetail: state === "in" ? "2nd" : "",
        },
      },
      venue: { fullName: "Little Caesars Arena" },
      competitors: [
        {
          homeAway: "home",
          team: { abbreviation: "DET" },
          score: { displayValue: "50" },
        },
        {
          homeAway: "away",
          team: { abbreviation: "PHI" },
          score: { displayValue: "55" },
        },
      ],
    },
  ],
  ...extra,
});

test("parses ESPN games with an https link, an end time and a live score", () => {
  const [game] = parseEspnSchedule(
    { events: [espnGame("1", "2026-11-05T00:00Z", "in")] },
    "sixers",
  );
  assert.equal(game.id, "espn-1");
  assert.equal(game.url, "https://www.espn.com/nba/game/_/gameId/1");
  assert.equal(game.end, "2026-11-05T02:30:00.000Z");
  assert.equal(game.score, "PHI 55 – 50 DET");
  assert.equal(game.state, "in");
});

test("skips ESPN entries without a valid date and hides scores before kickoff", () => {
  const games = parseEspnSchedule(
    {
      events: [espnGame("2", "not a date"), espnGame("3", "2026-11-06T00:00Z")],
    },
    "sixers",
  );
  assert.equal(games.length, 1);
  assert.equal(games[0].score, "");
});

test("merges duplicate ESPN games across season types", () => {
  const json = { events: [espnGame("4", "2026-11-07T00:00Z")] };
  assert.equal(parseSchedule("sixers", [json, json]).length, 1);
});

test("parses F1 qualifying, sprint and race sessions", () => {
  const games = parseF1Schedule({
    MRData: {
      RaceTable: {
        Races: [
          {
            season: "2026",
            round: "22",
            raceName: "Abu Dhabi Grand Prix",
            date: "2026-12-06",
            time: "13:00:00Z",
            Qualifying: { date: "2026-12-05", time: "14:00:00Z" },
            Circuit: { circuitName: "Yas Marina" },
          },
        ],
      },
    },
  });
  assert.deepEqual(
    games.map((g) => g.title),
    ["Abu Dhabi Grand Prix – Qualifying", "Abu Dhabi Grand Prix – Race"],
  );
  assert.equal(games[1].end, "2026-12-06T15:00:00.000Z");
  assert.equal(games[1].short, "Abu Dhabi GP – Race");
});

test("works out live, upcoming and final from state and time", () => {
  const game = {
    start: "2026-11-05T20:00:00Z",
    end: "2026-11-05T22:00:00Z",
    state: "pre",
  };
  assert.equal(gameStatus(game, new Date("2026-11-05T19:00:00Z")), "upcoming");
  assert.equal(gameStatus(game, new Date("2026-11-05T21:00:00Z")), "live");
  assert.equal(gameStatus(game, new Date("2026-11-05T23:00:00Z")), "final");
  assert.equal(gameStatus({ ...game, state: "post" }, new Date("2026-11-05T21:00:00Z")), "final");
  const { live, upcoming } = splitGames([game], new Date("2026-11-05T21:00:00Z"));
  assert.equal(live.length, 1);
  assert.equal(upcoming.length, 0);
});

const sports = {
  events: {
    sixers: [
      {
        id: "espn-9",
        team: "sixers",
        title: "Game",
        start: "2026-11-05T20:00:00Z",
        end: "2026-11-05T22:30:00Z",
        state: "pre",
      },
    ],
    f1: [
      {
        id: "f1-x",
        team: "f1",
        title: "Race",
        start: "2026-11-06T13:00:00Z",
        end: "2026-11-06T15:00:00Z",
        state: "pre",
      },
    ],
  },
};

test("turns followed games into read-only calendar occurrences", () => {
  const list = sportsOccurrences(sports, {}, "2026-11-05T00:00:00Z", "2026-11-07T00:00:00Z");
  assert.deepEqual(
    list.map((g) => g.category),
    ["sports", "sports"],
  );
  assert.ok(list.every((g) => g.readOnly && g.occurrenceId.startsWith("sports:")));
  const off = { sports: { teams: { f1: false } } };
  assert.equal(
    sportsOccurrences(sports, off, "2026-11-05T00:00:00Z", "2026-11-07T00:00:00Z").length,
    1,
  );
  assert.equal(
    sportsOccurrences(sports, { sports: { showInCalendar: false } }, "2026-11-05", "2026-11-07")
      .length,
    0,
  );
});

test("alerts once inside the lead window and not after the game is well underway", () => {
  const at = (iso) => new Date(iso);
  assert.equal(dueSportsAlerts(sports, {}, {}, at("2026-11-05T19:54:00Z")).length, 0);
  const [due] = dueSportsAlerts(sports, {}, {}, at("2026-11-05T19:56:00Z"));
  assert.equal(due.key, "espn-9@2026-11-05T20:00:00Z");
  assert.equal(due.minutes, 4);
  assert.equal(
    dueSportsAlerts(sports, {}, { "espn-9@2026-11-05T20:00:00Z": "x" }, at("2026-11-05T19:56:00Z"))
      .length,
    0,
  );
  assert.equal(dueSportsAlerts(sports, {}, {}, at("2026-11-05T20:20:00Z")).length, 0);
});

test("forgets sent alerts older than 30 days", () => {
  const kept = pruneSent(
    { old: "2026-09-01T00:00:00Z", fresh: "2026-11-01T00:00:00Z" },
    new Date("2026-11-05T00:00:00Z"),
  );
  assert.deepEqual(Object.keys(kept), ["fresh"]);
});

test("fills sports settings defaults and rejects bad values", () => {
  assert.deepEqual(sportsSettings({}).teams, {
    sixers: true,
    portugal: true,
    f1: true,
  });
  assert.throws(() => validateSportsSettings({ teams: { lakers: true } }));
  assert.throws(() => validateSportsSettings({ alertMinutes: -1 }));
  assert.throws(() => validateSportsSettings({ showInCalendar: "yes" }));
  assert.doesNotThrow(() => validateSportsSettings({ alertMinutes: 10, teams: { f1: false } }));
});

import { refreshSports, needsRefresh, emptySports } from "../src/core/sports.js";

test("refreshes stale followed teams and keeps the cache when a source fails", async () => {
  const now = new Date("2026-11-05T12:00:00Z");
  const fetchJson = async (url) => {
    if (url.includes("jolpi")) throw new Error("offline");
    return { events: [espnGame("7", "2026-11-08T00:00Z")] };
  };
  const cached = { ...emptySports(), events: { f1: [{ id: "f1-old" }] }, fetched: {} };
  const { next } = await refreshSports(cached, {}, fetchJson, { now });
  assert.equal(next.events.sixers[0].id, "espn-7");
  assert.equal(next.events.portugal[0].id, "espn-7");
  assert.deepEqual(next.events.f1, [{ id: "f1-old" }]);
  assert.match(next.errors.f1, /Formula 1: offline/);
  assert.equal(needsRefresh(next, "sixers", new Date("2026-11-05T13:00:00Z")), false);
  assert.equal(needsRefresh(next, "sixers", new Date("2026-11-05T15:00:00Z")), true);
});

test("skips unfollowed teams", async () => {
  const seen = [];
  await refreshSports(
    emptySports(),
    { sports: { teams: { sixers: false, portugal: false } } },
    async (url) => {
      seen.push(url);
      return {};
    },
  );
  assert.ok(seen.every((url) => url.includes("jolpi")));
});

test("alerts again when a game is rescheduled, and skips postponed games", () => {
  const moved = {
    events: {
      sixers: [
        { ...sports.events.sixers[0], start: "2026-11-05T22:00:00Z", end: "2026-11-06T00:30:00Z" },
      ],
    },
  };
  const sent = { "espn-9@2026-11-05T20:00:00Z": "x" };
  assert.equal(dueSportsAlerts(moved, {}, sent, new Date("2026-11-05T21:57:00Z")).length, 1);
  const postponed = espnGame("8", "2026-11-09T00:00Z");
  postponed.competitions[0].status.type.name = "STATUS_POSTPONED";
  assert.equal(parseEspnSchedule({ events: [postponed] }, "sixers").length, 0);
});

test("waits five minutes before retrying a team that failed", async () => {
  const now = new Date("2026-11-05T12:00:00Z");
  const { next } = await refreshSports(
    emptySports(),
    { sports: { teams: { sixers: false, portugal: false } } },
    async () => {
      throw new Error("offline");
    },
    { now },
  );
  assert.equal(needsRefresh(next, "f1", new Date("2026-11-05T12:03:00Z")), false);
  assert.equal(needsRefresh(next, "f1", new Date("2026-11-05T12:06:00Z")), true);
});

test("stops treating a stale live state as live long after the end", () => {
  const game = { start: "2026-11-05T20:00:00Z", end: "2026-11-05T22:00:00Z", state: "in" };
  assert.equal(gameStatus(game, new Date("2026-11-05T23:00:00Z")), "live");
  assert.equal(gameStatus(game, new Date("2026-11-06T02:00:00Z")), "final");
});

import { parseTeamSearch, customTeamId, teamCatalog, followedTeamIds } from "../src/core/sports.js";

const benfica = {
  id: "espn:soccer:1929",
  label: "Benfica",
  sport: "soccer",
  league: "por.1",
  espnId: "1929",
  sportLabel: "Soccer",
};
const lakers = {
  id: "espn:basketball:nba:13",
  label: "Los Angeles Lakers",
  sport: "basketball",
  league: "nba",
  espnId: "13",
  sportLabel: "Basketball",
};

test("reads ESPN team search results and drops duplicates and non-teams", () => {
  const results = parseTeamSearch({
    items: [
      {
        type: "team",
        id: "1929",
        displayName: "Benfica",
        sport: "soccer",
        defaultLeagueSlug: "por.1",
        label: "Soccer Team",
      },
      {
        type: "team",
        id: "1929",
        displayName: "Benfica",
        sport: "soccer",
        defaultLeagueSlug: "uefa.wchampions",
        label: "Soccer Team",
      },
      {
        type: "player",
        id: "5",
        displayName: "Someone",
        sport: "soccer",
        defaultLeagueSlug: "por.1",
      },
      { type: "team", id: "x", displayName: "Bad", sport: "soccer", defaultLeagueSlug: "por.1" },
    ],
  });
  assert.deepEqual(results, [benfica]);
  assert.equal(customTeamId(lakers), lakers.id);
});

test("builds schedule sources for searched teams", () => {
  const catalog = teamCatalog({ sports: { custom: [benfica, lakers] } });
  assert.deepEqual(catalog[benfica.id].urls, [
    "https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/1929/schedule",
    "https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/1929/schedule?fixture=true",
  ]);
  assert.equal(catalog[benfica.id].summaryPath, "soccer/fifa.friendly");
  assert.equal(catalog[lakers.id].summaryPath, "basketball/nba");
  assert.equal(catalog[lakers.id].urls.length, 2);
  assert.equal(catalog[lakers.id].minutes, 150);
  assert.deepEqual(followedTeamIds({ sports: { teams: { sixers: false }, custom: [benfica] } }), [
    "portugal",
    "f1",
    benfica.id,
  ]);
});

test("accepts only well-formed searched teams", () => {
  assert.doesNotThrow(() => validateSportsSettings({ custom: [benfica, lakers] }));
  assert.throws(() => validateSportsSettings({ custom: [{ ...benfica, id: "espn:soccer:1" }] }));
  assert.throws(() => validateSportsSettings({ custom: [benfica, benfica] }));
  assert.throws(() =>
    validateSportsSettings({
      custom: [{ ...lakers, league: "../x", id: "espn:basketball:../x:13" }],
    }),
  );
  assert.throws(() => validateSportsSettings({ superstarsOnly: "yes" }));
  assert.throws(() => validateSportsSettings({ stars: [""] }));
});

test("drops unsafe stored teams and rejects them in restored backups", () => {
  const bad = { ...benfica, espnId: "1/../../x", id: "espn:soccer:1/../../x" };
  assert.deepEqual(sportsSettings({ sports: { custom: [bad, null, benfica] } }).custom, [benfica]);
  const backup = {
    version: 1,
    events: [],
    alarms: [],
    suggestions: [],
    settings: { sports: { custom: [bad] } },
  };
  assert.throws(() => validateBackup(backup));
  assert.throws(() => validateSportsSettings({ custom: null }));
  assert.throws(() => validateSportsSettings({ extra: true }));
});

test("refreshes games cached before key-game fields existed", () => {
  const old = {
    fetched: { sixers: new Date().toISOString() },
    events: { sixers: [{ id: "a", start: "2030-01-01T00:00:00Z", end: "2030-01-01T02:00:00Z" }] },
  };
  assert.equal(needsRefresh(old, "sixers"), true);
});
