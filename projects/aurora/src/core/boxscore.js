// Box scores from ESPN game summaries: line score, player tables (basketball, American
// sports), team stats and key events (football). Pure functions; fetching happens elsewhere.

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const SUMMARY_PATH = /^[a-z0-9-]+\/[a-z0-9-]+(\.[a-z0-9_-]+)*$/;
const EVENT_ID = /^\d{1,12}$/;

// The summary request for a game, or "" when the game has no ESPN box score (F1, bad data).
export function boxScoreUrl(game) {
  if (!game || !SUMMARY_PATH.test(game.summaryPath || "") || !EVENT_ID.test(game.espnId || ""))
    return "";
  return `${ESPN}/${game.summaryPath}/summary?event=${game.espnId}`;
}

export const hasBoxScore = (game) => Boolean(boxScoreUrl(game));

function periodLabel(sport, league, index) {
  if (sport === "soccer") return ["1H", "2H", "ET1", "ET2", "PEN"][index] || `P${index + 1}`;
  if (sport === "baseball") return String(index + 1);
  if (sport === "hockey") return index < 3 ? String(index + 1) : `OT${index > 3 ? index - 2 : ""}`;
  if (league === "mens-college-basketball" || league === "womens-college-basketball")
    return index < 2 ? `H${index + 1}` : `OT${index > 2 ? index - 1 : ""}`;
  return index < 4 ? `Q${index + 1}` : `OT${index > 4 ? index - 3 : ""}`;
}

const text = (value) => (value == null ? "" : String(value));
const homeFirst = (list) =>
  [...(list || [])].sort(
    (a, b) => (a?.homeAway === "home" ? -1 : 1) - (b?.homeAway === "home" ? -1 : 1),
  );

function lineScore(competition, sport, league) {
  const teams = homeFirst(competition?.competitors).map((c) => ({
    name: text(c?.team?.displayName || c?.team?.abbreviation),
    scores: (c?.linescores || []).map((l) => text(l?.displayValue ?? l?.value)),
    total: text(typeof c?.score === "object" ? c?.score?.displayValue : c?.score),
  }));
  const periods = Math.max(0, ...teams.map((t) => t.scores.length));
  if (!teams.length || !periods) return null;
  return {
    labels: Array.from({ length: periods }, (_, i) => periodLabel(sport, league, i)),
    teams,
  };
}

function playerGroups(boxscore) {
  return (boxscore?.players || []).flatMap((team) =>
    (team?.statistics || []).flatMap((group) => {
      const labels = (group?.labels || group?.names || []).map(text);
      const athletes = group?.athletes || [];
      if (!labels.length || !athletes.length) return [];
      const teamName = text(team?.team?.displayName);
      const groupName = text(group?.text || group?.name)
        .replace(teamName, "")
        .trim();
      const hasStarters = athletes.some((a) => a?.starter);
      let benchMarked = false;
      const rows = athletes.map((a) => {
        const stats = (a?.stats || []).map(text);
        const bench = hasStarters && !a?.starter && !benchMarked;
        if (bench) benchMarked = true;
        return {
          name: text(a?.athlete?.displayName),
          position: text(a?.athlete?.position?.abbreviation),
          stats,
          dnp: Boolean(a?.didNotPlay) || !stats.length,
          reason: text(a?.reason) || "Did not play",
          bench,
        };
      });
      const totals = (group?.totals || []).map(text);
      return [
        {
          team: teamName,
          group: groupName,
          labels,
          rows,
          totals: totals.some(Boolean) ? totals : [],
        },
      ];
    }),
  );
}

const FOOTBALL_STATS = [
  ["Possession", "Possession", "%"],
  ["SHOTS", "Shots", ""],
  ["ON GOAL", "Shots on target", ""],
  ["Corner Kicks", "Corners", ""],
  ["Fouls", "Fouls", ""],
  ["Offsides", "Offsides", ""],
  ["Yellow Cards", "Yellow cards", ""],
  ["Red Cards", "Red cards", ""],
  ["Saves", "Saves", ""],
];

function teamStats(boxscore) {
  const [home, away] = homeFirst(boxscore?.teams);
  if (!home || !away) return null;
  const value = (team, label) => team?.statistics?.find((s) => s?.label === label)?.displayValue;
  const rows = FOOTBALL_STATS.filter(
    ([label]) => value(home, label) != null || value(away, label) != null,
  ).map(([label, name, unit]) => ({
    label: name,
    home: value(home, label) != null ? `${value(home, label)}${unit}` : "–",
    away: value(away, label) != null ? `${value(away, label)}${unit}` : "–",
  }));
  if (!rows.length) return null;
  return {
    home: text(home?.team?.displayName),
    away: text(away?.team?.displayName),
    rows,
  };
}

function keyEvents(summary) {
  const keep = /goal|card|penalty/i;
  return (summary?.keyEvents || [])
    .filter((k) => keep.test(k?.type?.text || "") && k?.text)
    .map((k) => ({ clock: text(k?.clock?.displayValue), text: text(k.text) }));
}

export function parseBoxScore(summary, summaryPath = "") {
  const [sport, league] = summaryPath.split("/");
  const competition = summary?.header?.competitions?.[0];
  const status = competition?.status?.type || {};
  const football = sport === "soccer";
  return {
    status: text(status.shortDetail || status.detail),
    live: status.state === "in",
    final: Boolean(status.completed),
    lineScore: lineScore(competition, sport, league),
    players: football ? [] : playerGroups(summary?.boxscore),
    teamStats: football ? teamStats(summary?.boxscore) : null,
    keyEvents: football ? keyEvents(summary) : [],
  };
}
