import test from "node:test";
import assert from "node:assert/strict";
import {
  gameStars,
  isSuperstarGame,
  parseRoster,
  refreshRosters,
  rosterUrl,
  normalizeName,
  validateStars,
} from "../src/core/superstars.js";
import {
  parseEspnSchedule,
  sportsOccurrences,
  refreshSports,
  emptySports,
} from "../src/core/sports.js";

const game = (id, sides, extra = {}) => ({
  id,
  team: "sixers",
  title: id,
  start: "2026-11-10T20:00:00Z",
  end: "2026-11-10T22:30:00Z",
  state: "pre",
  sides,
  ...extra,
});
const PHI = "basketball/nba/teams/20",
  DEN = "basketball/nba/teams/7",
  CHI = "basketball/nba/teams/4";
const rosters = {
  [PHI]: { names: ["Joel Embiid", "Tyrese Maxey", "Bench Guy"] },
  [DEN]: { names: ["Nikola Jokic", "Someone Else"] },
  [CHI]: { names: ["Role Player"] },
};
const stars = ["Joel Embiid", "Tyrese Maxey", "Nikola Jokić"];

test("a superstar game needs a listed star on each side", () => {
  const vsDen = game("a", [{ rosterPath: PHI }, { rosterPath: DEN }]);
  const vsChi = game("b", [{ rosterPath: PHI }, { rosterPath: CHI }]);
  assert.deepEqual(gameStars(vsDen, rosters, stars), [
    ["Joel Embiid", "Tyrese Maxey"],
    ["Nikola Jokic"],
  ]);
  assert.equal(isSuperstarGame(vsDen, rosters, stars), true);
  assert.equal(isSuperstarGame(vsChi, rosters, stars), false);
  assert.equal(isSuperstarGame(game("c", [{ rosterPath: PHI }]), rosters, stars), false);
});

test("matches names regardless of accents and case", () => {
  assert.equal(normalizeName("Nikola Jokić"), normalizeName("nikola jokic"));
  assert.equal(normalizeName("Vinícius Júnior"), "vinicius junior");
});

test("reads flat and grouped ESPN rosters and builds only safe roster URLs", () => {
  assert.deepEqual(parseRoster({ athletes: [{ displayName: "A" }, { displayName: "B" }] }), [
    "A",
    "B",
  ]);
  assert.deepEqual(
    parseRoster({
      athletes: [{ position: "G", items: [{ displayName: "C" }] }],
    }),
    ["C"],
  );
  assert.equal(
    rosterUrl(PHI),
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/20/roster",
  );
  assert.equal(
    rosterUrl("soccer/uefa.nations/teams/482"),
    "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/teams/482/roster",
  );
  assert.equal(rosterUrl("basketball/../teams/1"), "");
  assert.equal(rosterUrl(""), "");
});

test("validates the star list", () => {
  assert.doesNotThrow(() => validateStars(["Joel Embiid"]));
  assert.throws(() => validateStars("Joel Embiid"));
  assert.throws(() => validateStars([""]));
  assert.throws(() => validateStars(Array(151).fill("x")));
});

test("fetches missing rosters once a day, retries failures after an hour, drops unused ones", async () => {
  const now = new Date("2026-11-05T12:00:00Z");
  const fetched = [];
  const fetchJson = async (url) => {
    fetched.push(url);
    if (url.includes("/teams/4/")) throw new Error("offline");
    return { athletes: [{ displayName: "Joel Embiid" }] };
  };
  const games = [game("a", [{ rosterPath: PHI }, { rosterPath: CHI }])];
  const { rosters: first } = await refreshRosters({ old: { names: [] } }, games, fetchJson, now);
  assert.deepEqual(first[PHI].names, ["Joel Embiid"]);
  assert.deepEqual(first[CHI].names, []);
  assert.equal(first.old, undefined);
  fetched.length = 0;
  await refreshRosters(first, games, fetchJson, new Date("2026-11-05T12:30:00Z"));
  assert.deepEqual(fetched, []);
  await refreshRosters(first, games, fetchJson, new Date("2026-11-05T13:01:00Z"));
  assert.equal(fetched.length, 1);
});

test("parses roster locations from ESPN schedules", () => {
  const event = (league) => ({
    id: "1",
    date: "2026-11-10T20:00Z",
    name: "x",
    league,
    competitions: [
      {
        status: { type: { state: "pre" } },
        competitors: [
          { homeAway: "home", team: { id: "482", displayName: "Portugal" } },
          { homeAway: "away", team: { id: "479", displayName: "Denmark" } },
        ],
      },
    ],
  });
  const [soccer] = parseEspnSchedule({ events: [event({ slug: "uefa.nations" })] }, "portugal");
  assert.deepEqual(
    soccer.sides.map((s) => s.rosterPath),
    ["soccer/uefa.nations/teams/482", "soccer/uefa.nations/teams/479"],
  );
  const [nba] = parseEspnSchedule({ events: [event()] }, "sixers");
  assert.deepEqual(
    nba.sides.map((s) => s.rosterPath),
    ["basketball/nba/teams/482", "basketball/nba/teams/479"],
  );
});

test("superstar games only keeps star matchups and F1 sessions in the calendar", () => {
  const data = {
    rosters,
    events: {
      sixers: [
        game("a", [{ rosterPath: PHI }, { rosterPath: DEN }]),
        game("b", [{ rosterPath: PHI }, { rosterPath: CHI }]),
      ],
      f1: [game("f", [], { team: "f1" })],
    },
  };
  const settings = { sports: { superstarsOnly: true, stars } };
  const shown = sportsOccurrences(data, settings, "2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z")
    .map((g) => g.gameId)
    .sort();
  assert.deepEqual(shown, ["a", "f"]);
  assert.equal(
    sportsOccurrences(data, { sports: { stars } }, "2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z")
      .length,
    3,
  );
});

test("refreshSports downloads rosters only while superstar games only is on", async () => {
  const now = new Date("2026-11-05T12:00:00Z");
  const urls = [];
  const fetchJson = async (url) => {
    urls.push(url);
    if (url.includes("/roster")) return { athletes: [] };
    return {
      events: [
        {
          id: "9",
          date: "2026-11-08T00:00Z",
          name: "x",
          competitions: [
            {
              status: { type: { state: "pre" } },
              competitors: [
                { homeAway: "home", team: { id: "20" } },
                { homeAway: "away", team: { id: "7" } },
              ],
            },
          ],
        },
      ],
    };
  };
  const only76 = { teams: { portugal: false, f1: false } };
  await refreshSports(emptySports(), { sports: only76 }, fetchJson, { now });
  assert.ok(urls.every((u) => !u.includes("/roster")));
  urls.length = 0;
  const { next } = await refreshSports(
    emptySports(),
    { sports: { ...only76, superstarsOnly: true } },
    fetchJson,
    { now },
  );
  assert.ok(urls.some((u) => u.endsWith("/basketball/nba/teams/7/roster")));
  assert.ok(next.rosters["basketball/nba/teams/20"]);
});

test("superstar games only filters NBA games and leaves other sports alone", () => {
  const data = {
    rosters,
    events: {
      sixers: [
        game("dull", [{ rosterPath: PHI }, { rosterPath: CHI }], { summaryPath: "basketball/nba" }),
      ],
      portugal: [
        game("pt", [{ rosterPath: "soccer/uefa.nations/teams/482" }], {
          team: "portugal",
          summaryPath: "soccer/fifa.friendly",
        }),
      ],
    },
  };
  const shown = sportsOccurrences(
    data,
    { sports: { superstarsOnly: true, stars } },
    "2026-11-10T00:00:00Z",
    "2026-11-11T00:00:00Z",
  ).map((g) => g.gameId);
  assert.deepEqual(shown, ["pt"]);
});
