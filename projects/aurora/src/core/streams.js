// Stream links: finds a game's page on the stream site (/live/<league>/<UTC date>/<home>-vs-<away>).
// Pure apart from the injected getText(url), which resolves to the page HTML and throws on a 404.

export const STREAM_SITE = "https://streamseaste.cx";
export const STREAM_HOST = new URL(STREAM_SITE).hostname;

const TEAM_SLUG = { sixers: "philadelphia-76ers", portugal: "portugal" };
const TEAM_LEAGUE = { sixers: "nba", portugal: "soccer", f1: "f1" };
const F1_SESSION = {
  SprintQualifying: "sprint-qualifying",
  Sprint: "sprint",
  Qualifying: "qualifying",
  Race: "race",
};
const DAY_MS = 86_400_000;

export const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// League path on the stream site for a followed team (catalog entry from teamCatalog).
export function streamLeague(game, entry = {}) {
  if (TEAM_LEAGUE[game.team]) return TEAM_LEAGUE[game.team];
  if (entry.espnSport === "soccer") return "soccer";
  const league = String(entry.summaryPath || "").split("/")[1] || "";
  return /^[a-z0-9-]{1,40}$/.test(league) ? league : "";
}

// -> { wanted: slug built from the game, isIt: does a listed slug belong to this game }
export function streamTarget(game, entry = {}) {
  if (game.team === "f1") {
    const gp = slugify(String(game.title).split("–")[0]);
    const session = F1_SESSION[String(game.id).split("-").pop()] || "race";
    const isIt = (slug) => {
      if (!slug.startsWith(gp)) return false;
      const rest = slug.slice(gp.length);
      if (session === "race")
        return ["-race", "-grand-prix-vs", "-vs"].some((p) => rest.startsWith(p));
      return rest.startsWith(`-${session}-vs`);
    };
    return { wanted: `${gp}-${session}-vs-tbd`, isIt };
  }
  const m = String(game.title || "").match(/^(.+?) (?:at|vs\.?|@) (.+)$/);
  if (!m) return { wanted: null, isIt: () => false };
  const [away, home] = [m[1], m[2]].map(slugify);
  const team = TEAM_SLUG[game.team] || (entry.custom ? slugify(entry.label) : "");
  const other = team && away.includes(team) ? home : away;
  // Opponent names differ between sites (Czechia / czech-republic), so any distinctive word counts.
  const words = other.split("-").filter((w) => w.length >= 4);
  const otherWords = words.length ? words : [other];
  const isIt = (slug) => slug.includes(team) && otherWords.some((w) => slug.includes(w));
  return { wanted: `${home}-vs-${away}`, isIt };
}

// Best link for the game: its listed page, else the page it should have, else the league page.
export async function streamUrl(game, entry, getText) {
  const league = streamLeague(game, entry);
  if (!league) return STREAM_SITE;
  const start = Date.parse(game.start);
  const iso = (offset) => new Date(start + offset * DAY_MS).toISOString().slice(0, 10);
  const days = new Map([0, -1, 1].map((d) => [iso(d), Math.abs(d)]));
  const { wanted, isIt } = streamTarget(game, entry);
  try {
    const page = await getText(`${STREAM_SITE}/${league}`);
    const pattern = new RegExp(
      `href="(?:${escapeRegExp(STREAM_SITE)})?(/live/${league}/(\\d{4}-\\d{2}-\\d{2})/([a-z0-9-]+))"`,
      "g",
    );
    const found = [...page.matchAll(pattern)]
      .filter(([, , date, slug]) => days.has(date) && isIt(slug))
      .map(([, path, date]) => [days.get(date), path])
      .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    if (found.length) return STREAM_SITE + found[0][1];
  } catch {
    // League page unreachable: fall through to the expected game page.
  }
  if (wanted) {
    const url = `${STREAM_SITE}/live/${league}/${iso(0)}/${wanted}`;
    try {
      await getText(url);
      return url;
    } catch {
      // The site has not posted this game yet.
    }
  }
  return `${STREAM_SITE}/${league}`;
}
