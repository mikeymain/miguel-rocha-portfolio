// Superstar games: a game qualifies when each side has at least one player from the star list.
// Players come from ESPN team rosters, cached for a day.

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const ROSTER_PATH = /^[a-z0-9-]+\/[a-z0-9-]+(\.[a-z0-9_-]+)*\/teams\/\d{1,10}$/;
const HOUR = 3_600_000;
const ROSTER_STALE_HOURS = 24;
const ROSTER_RETRY_HOURS = 1;
const BATCH = 6;
export const MAX_STARS = 150;

export const DEFAULT_STARS = [
  // Basketball
  "LeBron James",
  "Stephen Curry",
  "Kevin Durant",
  "Giannis Antetokounmpo",
  "Nikola Jokić",
  "Luka Dončić",
  "Joel Embiid",
  "Shai Gilgeous-Alexander",
  "Jayson Tatum",
  "Anthony Edwards",
  "Victor Wembanyama",
  "Anthony Davis",
  "Devin Booker",
  "Jalen Brunson",
  "Donovan Mitchell",
  "Kawhi Leonard",
  "Ja Morant",
  "Tyrese Maxey",
  "Jaylen Brown",
  "Cade Cunningham",
  // Football
  "Cristiano Ronaldo",
  "Lionel Messi",
  "Kylian Mbappé",
  "Erling Haaland",
  "Vinícius Júnior",
  "Jude Bellingham",
  "Mohamed Salah",
  "Harry Kane",
  "Lamine Yamal",
  "Kevin De Bruyne",
  "Bruno Fernandes",
  "Bernardo Silva",
  "Rúben Dias",
  "Rafael Leão",
  "Vitinha",
  "João Neves",
  "Pedri",
  "Bukayo Saka",
  "Florian Wirtz",
  "Jamal Musiala",
  "Cole Palmer",
  "Raphinha",
  "Robert Lewandowski",
  "Rodri",
  "Ousmane Dembélé",
  "Virgil van Dijk",
];

// "Nikola Jokić" and "nikola jokic" match.
export const normalizeName = (name) =>
  String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function validateStars(stars) {
  if (
    !Array.isArray(stars) ||
    stars.length > MAX_STARS ||
    stars.some((s) => typeof s !== "string" || !s.trim() || s.length > 60)
  )
    throw new Error(`List up to ${MAX_STARS} player names, one per line.`);
}

export const rosterUrl = (path) => (ROSTER_PATH.test(path || "") ? `${ESPN}/${path}/roster` : "");

export function parseRoster(json) {
  return (json?.athletes || [])
    .flatMap((entry) =>
      Array.isArray(entry?.items)
        ? entry.items.map((a) => a?.displayName || a?.fullName)
        : [entry?.displayName || entry?.fullName],
    )
    .filter(Boolean);
}

// Listed stars on each side of a game, in the order of game.sides.
export function gameStars(game, rosters, stars) {
  const wanted = new Set((stars || []).map(normalizeName));
  return (game?.sides || []).map((side) =>
    (rosters?.[side.rosterPath]?.names || []).filter((name) => wanted.has(normalizeName(name))),
  );
}

export function isSuperstarGame(game, rosters, stars) {
  const sides = gameStars(game, rosters, stars);
  return sides.length >= 2 && sides.every((names) => names.length > 0);
}

// Downloads rosters for the teams in these games that are missing or a day old.
export async function refreshRosters(rosters, games, fetchJson, now = new Date()) {
  const next = { ...rosters };
  const paths = [...new Set(games.flatMap((g) => (g.sides || []).map((s) => s.rosterPath)))].filter(
    (path) => rosterUrl(path),
  );
  const due = paths.filter((path) => {
    const fetched = Date.parse(next[path]?.fetched || "");
    return !Number.isFinite(fetched) || +now - fetched >= ROSTER_STALE_HOURS * HOUR;
  });
  for (let i = 0; i < due.length; i += BATCH) {
    await Promise.all(
      due.slice(i, i + BATCH).map(async (path) => {
        try {
          next[path] = {
            fetched: now.toISOString(),
            names: parseRoster(await fetchJson(rosterUrl(path))),
          };
        } catch {
          // Keep any older roster and try again in an hour.
          const retryAt = +now - (ROSTER_STALE_HOURS - ROSTER_RETRY_HOURS) * HOUR;
          next[path] = {
            fetched: new Date(retryAt).toISOString(),
            names: next[path]?.names || [],
          };
        }
      }),
    );
  }
  // Drop rosters no current game needs.
  const needed = new Set(paths);
  for (const path of Object.keys(next)) if (!needed.has(path)) delete next[path];
  return { rosters: next, changed: due.length > 0 };
}
