import test from "node:test";
import assert from "node:assert/strict";
import { boxScoreUrl, hasBoxScore, parseBoxScore } from "../src/core/boxscore.js";

const header = (state, competitors) => ({
  header: {
    competitions: [
      {
        status: {
          type: {
            state,
            completed: state === "post",
            shortDetail: state === "post" ? "Final" : "3rd 4:12",
          },
        },
        competitors,
      },
    ],
  },
});

test("builds summary URLs only from valid ESPN ids and paths", () => {
  assert.equal(
    boxScoreUrl({ espnId: "401909912", summaryPath: "basketball/nba" }),
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401909912",
  );
  assert.equal(boxScoreUrl({ espnId: "1", summaryPath: "" }), "");
  assert.equal(boxScoreUrl({ espnId: "1?x=2", summaryPath: "basketball/nba" }), "");
  assert.equal(boxScoreUrl({ espnId: "1", summaryPath: "../../x" }), "");
  assert.equal(hasBoxScore({ team: "f1", summaryPath: "" }), false);
});

test("parses a basketball line score and player table, home team first", () => {
  const box = parseBoxScore(
    {
      ...header("in", [
        {
          homeAway: "away",
          team: { displayName: "Bulls" },
          score: "60",
          linescores: [{ displayValue: "30" }, { displayValue: "30" }],
        },
        {
          homeAway: "home",
          team: { displayName: "76ers" },
          score: "64",
          linescores: [{ displayValue: "34" }, { displayValue: "30" }],
        },
      ]),
      boxscore: {
        players: [
          {
            team: { displayName: "76ers" },
            statistics: [
              {
                labels: ["MIN", "PTS"],
                athletes: [
                  {
                    starter: true,
                    athlete: {
                      displayName: "A",
                      position: { abbreviation: "G" },
                    },
                    stats: ["30", "20"],
                  },
                  {
                    starter: false,
                    athlete: { displayName: "B" },
                    stats: ["10", "4"],
                  },
                  {
                    starter: false,
                    athlete: { displayName: "C" },
                    didNotPlay: true,
                    reason: "Injured",
                    stats: [],
                  },
                ],
                totals: ["", "64"],
              },
            ],
          },
        ],
      },
    },
    "basketball/nba",
  );
  assert.equal(box.live, true);
  assert.deepEqual(box.lineScore.labels, ["Q1", "Q2"]);
  assert.deepEqual(
    box.lineScore.teams.map((t) => t.name),
    ["76ers", "Bulls"],
  );
  const [group] = box.players;
  assert.deepEqual(
    group.rows.map((r) => [r.name, r.bench, r.dnp]),
    [
      ["A", false, false],
      ["B", true, false],
      ["C", false, true],
    ],
  );
  assert.equal(group.rows[2].reason, "Injured");
  assert.deepEqual(group.totals, ["", "64"]);
  assert.equal(box.teamStats, null);
});

test("parses football team stats and goal and card events", () => {
  const box = parseBoxScore(
    {
      ...header("post", [
        {
          homeAway: "home",
          team: { displayName: "Benfica" },
          score: "2",
          linescores: [{ displayValue: "1" }, { displayValue: "1" }],
        },
        {
          homeAway: "away",
          team: { displayName: "Porto" },
          score: "1",
          linescores: [{ displayValue: "0" }, { displayValue: "1" }],
        },
      ]),
      boxscore: {
        teams: [
          {
            homeAway: "away",
            team: { displayName: "Porto" },
            statistics: [{ label: "Possession", displayValue: "45" }],
          },
          {
            homeAway: "home",
            team: { displayName: "Benfica" },
            statistics: [
              { label: "Possession", displayValue: "55" },
              { label: "SHOTS", displayValue: "12" },
            ],
          },
        ],
      },
      keyEvents: [
        { type: { text: "Kickoff" }, text: "" },
        {
          type: { text: "Goal" },
          clock: { displayValue: "12'" },
          text: "Goal! Benfica 1, Porto 0.",
        },
        { type: { text: "Substitution" }, text: "Sub" },
      ],
    },
    "soccer/fifa.friendly",
  );
  assert.equal(box.final, true);
  assert.deepEqual(box.lineScore.labels, ["1H", "2H"]);
  assert.deepEqual(box.teamStats.rows, [
    { label: "Possession", home: "55%", away: "45%" },
    { label: "Shots", home: "12", away: "–" },
  ]);
  assert.deepEqual(box.keyEvents, [{ clock: "12'", text: "Goal! Benfica 1, Porto 0." }]);
  assert.deepEqual(box.players, []);
});

test("copes with an empty summary", () => {
  const box = parseBoxScore({}, "basketball/nba");
  assert.equal(box.lineScore, null);
  assert.deepEqual(box.players, []);
});

test("labels hockey overtimes and rejects dot-only league paths", () => {
  const periods = (n) => Array.from({ length: n }, () => ({ displayValue: "0" }));
  const box = parseBoxScore(
    header("post", [
      { homeAway: "home", team: { displayName: "A" }, score: "1", linescores: periods(6) },
      { homeAway: "away", team: { displayName: "B" }, score: "0", linescores: periods(6) },
    ]),
    "hockey/nhl",
  );
  assert.deepEqual(box.lineScore.labels, ["1", "2", "3", "OT", "OT2", "OT3"]);
  assert.equal(boxScoreUrl({ espnId: "1", summaryPath: "soccer/.." }), "");
  assert.notEqual(boxScoreUrl({ espnId: "1", summaryPath: "soccer/fifa.friendly" }), "");
});
