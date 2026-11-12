// Adds the ESPN box score under the stream links on StreamEast game pages.
(() => {
  const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
  // site league -> [ESPN scoreboard path, extra scoreboard params, ESPN summary path]
  const LEAGUES = {
    nba: ["basketball/nba", "", "basketball/nba"],
    wnba: ["basketball/wnba", "", "basketball/wnba"],
    ncaab: [
      "basketball/mens-college-basketball",
      "&groups=50",
      "basketball/mens-college-basketball",
    ],
    nfl: ["football/nfl", "", "football/nfl"],
    cfb: ["football/college-football", "&groups=80", "football/college-football"],
    nhl: ["hockey/nhl", "", "hockey/nhl"],
    mlb: ["baseball/mlb", "", "baseball/mlb"],
    // ESPN's soccer summary works under any soccer league slug
    soccer: ["soccer/all", "", "soccer/fifa.friendly"],
  };
  const LIVE_REFRESH = 30e3;
  const PRE_REFRESH = 120e3;

  const m = location.pathname.match(/^\/live\/([a-z0-9]+)\/(\d{4}-\d{2}-\d{2})\/([a-z0-9-]+)/);
  if (!m || !LEAGUES[m[1]]) return;
  const [, league, siteDate, slug] = m;
  const [boardPath, boardParams, summaryPath] = LEAGUES[league];

  // ---- tiny DOM helper (text only, never HTML from the API) ----
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      n.append(k instanceof Node ? k : String(k));
    }
    return n;
  }

  // ---- mount right below the stream links ----
  const box = el("section", { id: "sa-boxscore" });
  const status = el("span", { class: "sa-status" });
  const updated = el("span", { class: "sa-updated" });
  const body = el(
    "div",
    { class: "sa-body" },
    el("div", { class: "sa-msg" }, "Loading box score…"),
  );
  box.append(
    el(
      "div",
      { class: "sa-head" },
      el("span", { class: "sa-title" }, "Box Score"),
      status,
      updated,
    ),
    body,
  );

  function mount() {
    // game page: under the stream links; player page: under the player and its feed buttons
    const links =
      document.querySelector(".player-section .links-table-wrap") ||
      document.querySelector(".links-table-wrap") ||
      document.querySelector(".player-section .stream-selector") ||
      document.querySelector(".player-section #player-wrapper");
    if (links) links.after(box);
    else
      (
        document.querySelector(".player-section") ||
        document.querySelector(".main-content .container") ||
        document.body
      ).prepend(box);
  }

  // ---- find the ESPN game ----
  const norm = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  function sameTeam(a, b) {
    a = norm(a);
    b = norm(b);
    if (!a || !b) return false;
    if (a === b || a.includes(b) || b.includes(a)) return true;
    // names differ between sites (Czech Republic / Czechia), so a shared distinctive word is enough
    const wa = a.split(" ").filter((w) => w.length >= 4);
    const wb = b.split(" ").filter((w) => w.length >= 4);
    return wa.some((x) => wb.some((y) => x.startsWith(y) || y.startsWith(x)));
  }

  function teamNames() {
    const names = [...document.querySelectorAll(".match-hero-name")]
      .map((n) => n.textContent.trim())
      .filter(Boolean);
    if (names.length >= 2) return names.slice(0, 2);
    return slug.split("-vs-").map((s) => s.replace(/-/g, " "));
  }

  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }

  async function findEventId() {
    const [t1, t2] = teamNames();
    // site dates are UTC, ESPN's scoreboard dates are US Eastern, so check that day and the day before
    const d = new Date(siteDate + "T12:00:00Z");
    const days = [0, -1, 1].map((off) => {
      const x = new Date(d.getTime() + off * 864e5);
      return x.toISOString().slice(0, 10).replace(/-/g, "");
    });
    for (const day of days) {
      const data = await getJSON(
        `${ESPN}/${boardPath}/scoreboard?dates=${day}&limit=1000${boardParams}`,
      );
      for (const e of data.events || []) {
        const names = (e.competitions?.[0]?.competitors || []).flatMap((c) => [
          c.team?.displayName,
          c.team?.shortDisplayName,
          c.team?.name,
        ]);
        const has = (t) => names.some((n) => n && sameTeam(n, t));
        if (has(t1) && has(t2)) return e.id;
      }
    }
    return null;
  }

  // ---- renderers ----
  function lineScore(comp) {
    const teams = [...(comp.competitors || [])].sort(
      (a, b) => (a.homeAway === "away" ? -1 : 1) - (b.homeAway === "away" ? -1 : 1),
    );
    const periods = Math.max(0, ...teams.map((t) => (t.linescores || []).length));
    if (!teams.length) return null;
    const head = el(
      "tr",
      {},
      el("th", {}, ""),
      Array.from({ length: periods }, (_, i) => el("th", {}, periodLabel(i))),
      el("th", { class: "sa-final" }, "T"),
    );
    const rows = teams.map((t) =>
      el(
        "tr",
        {},
        el("td", {}, t.team?.displayName || t.team?.abbreviation || ""),
        Array.from({ length: periods }, (_, i) =>
          el("td", {}, t.linescores?.[i]?.displayValue ?? ""),
        ),
        el("td", { class: "sa-final" }, t.score ?? ""),
      ),
    );
    return el(
      "div",
      { class: "sa-scroll" },
      el("table", { class: "sa-linescore" }, el("thead", {}, head), el("tbody", {}, rows)),
    );
  }

  function periodLabel(i) {
    if (league === "mlb") return i + 1;
    if (league === "nhl") return i < 3 ? i + 1 : i === 3 ? "OT" : "SO";
    if (league === "ncaab") return i < 2 ? i + 1 : `OT${i - 1 > 1 ? i - 1 : ""}`;
    if (league === "soccer") return i === 0 ? "1H" : i === 1 ? "2H" : i < 4 ? `ET${i - 1}` : "PEN";
    return i < 4 ? `Q${i + 1}` : `OT${i - 3 > 1 ? i - 3 : ""}`;
  }

  function playerTables(box) {
    const out = [];
    for (const team of box.players || []) {
      for (const g of team.statistics || []) {
        const labels = g.labels || g.names || [];
        if (!labels.length || !(g.athletes || []).length) continue;
        const teamName = team.team?.displayName || "";
        const groupName = (g.text || (g.name ? g.name[0].toUpperCase() + g.name.slice(1) : ""))
          .replace(teamName, "")
          .trim();
        out.push(el("h3", {}, teamName, groupName ? ` · ${groupName}` : ""));
        const rows = [];
        let seenBench = false;
        const hasStarters = g.athletes.some((a) => a.starter);
        for (const a of g.athletes) {
          const cls = [];
          if (hasStarters && !a.starter && !seenBench) {
            cls.push("sa-bench");
            seenBench = true;
          }
          const stats = a.stats || [];
          const dnp = a.didNotPlay || !stats.length;
          if (dnp) cls.push("sa-dnp");
          rows.push(
            el(
              "tr",
              { class: cls.join(" ") },
              el(
                "td",
                {},
                a.athlete?.displayName || "",
                a.athlete?.position?.abbreviation
                  ? el("span", { class: "sa-tag" }, a.athlete.position.abbreviation)
                  : null,
              ),
              dnp
                ? el("td", { colspan: labels.length, style: "text-align:left" }, a.reason || "DNP")
                : labels.map((_, i) => el("td", {}, stats[i] ?? "")),
            ),
          );
        }
        if ((g.totals || []).some((x) => x !== "")) {
          rows.push(
            el(
              "tr",
              { class: "sa-total" },
              el("td", {}, "Team"),
              labels.map((_, i) => el("td", {}, g.totals[i] ?? "")),
            ),
          );
        }
        out.push(
          el(
            "div",
            { class: "sa-scroll" },
            el(
              "table",
              {},
              el(
                "thead",
                {},
                el(
                  "tr",
                  {},
                  el("th", {}, hasStarters ? "Starters" : "Player"),
                  labels.map((l) => el("th", {}, l)),
                ),
              ),
              el("tbody", {}, rows),
            ),
          ),
        );
      }
    }
    return out;
  }

  function teamStatsCompare(box) {
    const [home, away] = [...(box.teams || [])].sort(
      (a, b) => (a.homeAway === "home" ? -1 : 1) - (b.homeAway === "home" ? -1 : 1),
    );
    if (!home || !away) return [];
    const wanted = [
      "Possession",
      "SHOTS",
      "ON GOAL",
      "Corner Kicks",
      "Fouls",
      "Offsides",
      "Yellow Cards",
      "Red Cards",
      "Saves",
      "Passes",
      "Accurate Passes",
      "Tackles",
      "Interceptions",
    ];
    const pretty = { SHOTS: "Shots", "ON GOAL": "Shots on Target" };
    const val = (t, label) => t.statistics?.find((s) => s.label === label)?.displayValue;
    const rows = wanted
      .filter((l) => val(home, l) != null || val(away, l) != null)
      .map((l) => {
        const pct = l === "Possession" ? "%" : "";
        return el(
          "tr",
          {},
          el("td", {}, (val(home, l) ?? "-") + pct),
          el("td", {}, pretty[l] || l),
          el("td", {}, (val(away, l) ?? "-") + pct),
        );
      });
    if (!rows.length) return [];
    return [
      el("h3", {}, "Team Stats"),
      el(
        "table",
        { class: "sa-compare" },
        el(
          "thead",
          {},
          el(
            "tr",
            {},
            el("th", {}, home.team?.displayName || ""),
            el("th", { style: "text-align:center" }, ""),
            el("th", { style: "text-align:right" }, away.team?.displayName || ""),
          ),
        ),
        el("tbody", {}, rows),
      ),
    ];
  }

  function keyEvents(sum) {
    const keep = /goal|card|penalty|substitution/i;
    const evs = (sum.keyEvents || []).filter((k) => keep.test(k.type?.text || "") && k.text);
    if (!evs.length) return [];
    return [
      el("h3", {}, "Key Events"),
      el(
        "table",
        { class: "sa-events" },
        el(
          "tbody",
          {},
          evs.map((k) =>
            el("tr", {}, el("td", {}, k.clock?.displayValue || ""), el("td", {}, k.text)),
          ),
        ),
      ),
    ];
  }

  function lineups(sum) {
    const rosters = [...(sum.rosters || [])].sort(
      (a, b) => (a.homeAway === "home" ? -1 : 1) - (b.homeAway === "home" ? -1 : 1),
    );
    if (!rosters.some((r) => (r.roster || []).length)) return [];
    const stat = (p, abbr) =>
      Number(p.stats?.find((s) => s.abbreviation === abbr)?.displayValue || 0);
    const cols = rosters.map((r) => {
      const players = r.roster || [];
      const line = (p) => {
        const marks = [
          "⚽".repeat(stat(p, "G")),
          stat(p, "A") ? `🅰️${stat(p, "A") > 1 ? "×" + stat(p, "A") : ""}` : "",
          stat(p, "YC") ? "🟨" : "",
          stat(p, "RC") ? "🟥" : "",
          p.subbedIn ? "↑" : "",
          p.subbedOut ? "↓" : "",
        ]
          .join(" ")
          .trim();
        return el(
          "tr",
          { class: !p.starter && !p.subbedIn ? "sa-dnp" : "" },
          el("td", {}, p.jersey || ""),
          el(
            "td",
            {},
            p.athlete?.displayName || "",
            el("span", { class: "sa-tag" }, p.position?.abbreviation || ""),
            marks ? el("span", { class: "sa-tag" }, marks) : null,
          ),
        );
      };
      const starters = players.filter((p) => p.starter);
      const subs = players.filter((p) => !p.starter);
      return el(
        "div",
        {},
        el("h3", {}, r.team?.displayName || "", r.formation ? ` · ${r.formation}` : ""),
        el(
          "table",
          {},
          el(
            "tbody",
            {},
            starters.map(line),
            subs.length
              ? el(
                  "tr",
                  { class: "sa-bench" },
                  el("td", {}, ""),
                  el("td", { style: "color:#a5a7aa" }, "Substitutes"),
                )
              : null,
            subs.map(line),
          ),
        ),
      );
    });
    return [el("div", { class: "sa-lineups" }, cols)];
  }

  // ---- main loop ----
  let eventId = null;
  let timer = null;

  async function refresh() {
    clearTimeout(timer);
    let next = PRE_REFRESH;
    try {
      if (!eventId) eventId = await findEventId();
      if (!eventId) {
        status.textContent = "";
        body.replaceChildren(el("div", { class: "sa-msg" }, "Couldn't find this game on ESPN."));
        return;
      }
      const sum = await getJSON(`${ESPN}/${summaryPath}/summary?event=${eventId}`);
      const comp = sum.header?.competitions?.[0] || {};
      const st = comp.status?.type || {};
      status.textContent = st.detail || st.description || "";
      status.className = "sa-status" + (st.state === "in" ? " live" : "");
      updated.textContent = `updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;

      const parts = [];
      const ls = lineScore(comp);
      if (ls && st.state !== "pre") parts.push(el("h3", {}, "Score"), ls);
      if (league === "soccer")
        parts.push(...teamStatsCompare(sum.boxscore || {}), ...keyEvents(sum), ...lineups(sum));
      else parts.push(...playerTables(sum.boxscore || {}));
      if (!parts.length)
        parts.push(
          el(
            "div",
            { class: "sa-msg" },
            st.state === "pre"
              ? "The box score shows up once the game starts."
              : "No box score yet.",
          ),
        );
      body.replaceChildren(...parts);

      if (st.state === "in") next = LIVE_REFRESH;
      else if (st.state === "post") next = null; // final: nothing left to update
    } catch (err) {
      console.warn("[box score]", err);
      if (!body.querySelector("table"))
        body.replaceChildren(
          el("div", { class: "sa-msg" }, "Couldn't load the box score, retrying…"),
        );
      next = LIVE_REFRESH;
    } finally {
      if (next) timer = setTimeout(refresh, document.hidden ? next * 2 : next);
    }
  }

  mount();
  refresh();
})();
