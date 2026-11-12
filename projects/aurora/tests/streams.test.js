import test from "node:test";
import assert from "node:assert/strict";
import { streamUrl, streamTarget, streamLeague, STREAM_SITE } from "../src/core/streams.js";
import { sportsOccurrences } from "../src/core/sports.js";

const notFound = async () => {
  throw new Error("the server answered 404");
};
const pageWith =
  (...paths) =>
  async (url) => {
    if (
      url === `${STREAM_SITE}/nba` ||
      url === `${STREAM_SITE}/f1` ||
      url === `${STREAM_SITE}/soccer`
    )
      return paths.map((p) => `<a href="${p}">x</a>`).join("");
    throw new Error("the server answered 404");
  };

const sixersAtBulls = {
  id: "espn-1",
  team: "sixers",
  title: "Philadelphia 76ers at Chicago Bulls",
  start: "2026-11-08T00:00:00.000Z",
};

test("finds the listed 76ers game page", async () => {
  const url = await streamUrl(
    sixersAtBulls,
    {},
    pageWith(
      "/live/nba/2026-11-08/boston-celtics-vs-new-york-knicks",
      "/live/nba/2026-11-08/chicago-bulls-vs-philadelphia-76ers",
    ),
  );
  assert.equal(
    url,
    "https://streamseaste.cx/live/nba/2026-11-08/chicago-bulls-vs-philadelphia-76ers",
  );
});

test("falls back to the expected page, then the league page", async () => {
  const expected =
    "https://streamseaste.cx/live/nba/2026-11-08/chicago-bulls-vs-philadelphia-76ers";
  const onlyExpected = async (url) => {
    if (url === expected) return "";
    throw new Error("the server answered 404");
  };
  assert.equal(await streamUrl(sixersAtBulls, {}, onlyExpected), expected);
  assert.equal(await streamUrl(sixersAtBulls, {}, notFound), "https://streamseaste.cx/nba");
});

test("F1 qualifying matches its own session, not the race", async () => {
  const quali = {
    id: "f1-2026-24-Qualifying",
    team: "f1",
    title: "Abu Dhabi Grand Prix – Qualifying",
    start: "2026-12-05T14:00:00.000Z",
  };
  const { wanted, isIt } = streamTarget(quali);
  assert.equal(wanted, "abu-dhabi-grand-prix-qualifying-vs-tbd");
  assert.equal(isIt("abu-dhabi-grand-prix-qualifying-vs-tbd"), true);
  assert.equal(isIt("abu-dhabi-grand-prix-race-vs-tbd"), false);
  const url = await streamUrl(
    quali,
    {},
    pageWith(
      "/live/f1/2026-12-06/abu-dhabi-grand-prix-race-vs-tbd",
      "/live/f1/2026-12-05/abu-dhabi-grand-prix-qualifying-vs-tbd",
    ),
  );
  assert.equal(
    url,
    "https://streamseaste.cx/live/f1/2026-12-05/abu-dhabi-grand-prix-qualifying-vs-tbd",
  );
});

test("custom teams use their ESPN league and name", () => {
  const entry = {
    custom: true,
    label: "Los Angeles Lakers",
    espnSport: "basketball",
    summaryPath: "basketball/nba",
  };
  const game = {
    id: "espn-2",
    team: "espn:basketball:nba:13",
    title: "Los Angeles Lakers at Denver Nuggets",
  };
  assert.equal(streamLeague(game, entry), "nba");
  assert.equal(streamTarget(game, entry).isIt("denver-nuggets-vs-los-angeles-lakers"), true);
  assert.equal(
    streamLeague({ team: "x" }, { espnSport: "soccer", summaryPath: "soccer/fifa.friendly" }),
    "soccer",
  );
});

test("F1 qualifying stays in the calendar with superstar games only on", () => {
  const quali = {
    id: "f1-2026-24-Qualifying",
    team: "f1",
    title: "Abu Dhabi Grand Prix – Qualifying",
    start: "2026-12-05T14:00:00.000Z",
    end: "2026-12-05T15:00:00.000Z",
    sides: [],
  };
  const shown = sportsOccurrences(
    { events: { f1: [quali] }, rosters: {} },
    { sports: { superstarsOnly: true, stars: ["Nikola Jokic"] } },
    "2026-12-05T00:00:00Z",
    "2026-12-06T00:00:00Z",
  );
  assert.deepEqual(
    shown.map((g) => g.gameId),
    ["f1-2026-24-Qualifying"],
  );
});
