(function (root) {
	"use strict";
	const $ = (id) => document.getElementById(id);
	const breakdown = (parts) => Object.entries(parts || {}).map(([k, n]) => k + " " + n).join(" · ");
	const bounds = (n) => n * 10 + "…" + (n === 19 ? 200 : n * 10 + 9);
	const columns = [
		["point", "Coordinates"], ["quad", "Quad"], ["type", "Terrain"], ["status", "Ownership"],
		["bonus", "Resource bonus"], ["spawn", "Area spawn /100"], ["settle", "Settlement /100"],
		["coverage", "Neighbours seen"], ["distance", "Target distance"], ["neighbours", "7×7 competition"],
		["oases", "Best free oases"], ["spawnEvidence", "Spawn evidence"], ["settleEvidence", "Settlement evidence"],
		["grey", "Inside exclusion"], ["observed", "Observation time"], ["snapshot", "Snapshot time"],
	].map(([key, label]) => ({ key, label }));

	function view(model, host, snapshotTime) {
		const layer = $("heat-layer").value, quad = $("heat-quad").value, type = $("heat-type").value;
		const threshold = Number($("heat-min").value);
		const map = $("heat-grid");
		const selected = map.dataset.cell || "";
		const score = (c) => layer === "spawn" ? c.spawn : c.best?.settle;
		const cells = [...model.cells.values()].filter((c) => c.seen && (!quad || c.quad === quad)
			&& (!threshold || score(c) >= threshold));
		const visible = new Set(cells.map((c) => c.id));
		const spawnEvidence = (c) => c.parts ? breakdown(c.parts) + " · " + c.croppers + " candidate 15c, " +
			c.valleys + " valleys incl. 15c, +" + c.freeYield + "% free oasis resources · " +
			(snapshotTime ? c.players.size + " players, " + c.alliances.size + " alliances" : "No snapshot") +
			" · radius " + c.radius + ", ring " + (c.ring ?? "unknown") : "";
		const rows = model.records.filter((r) => visible.has(r.cell) && (!selected || r.cell === selected) && (!type || r.type === type))
			.sort((a, b) => (b[layer] ?? -1) - (a[layer] ?? -1) || a.x - b.x || a.y - b.y)
			.map((r) => ({ ...r, href: "https://" + host + "/map?x=" + r.x + "&y=" + r.y,
				observed: r.time ? new Date(r.time).toISOString() : "", snapshot: snapshotTime || "",
				spawnEvidence: spawnEvidence(model.cells.get(r.cell)), settleEvidence: breakdown(r.parts) }));

		function draw() {
			const detail = $("heat-detail"), frag = document.createDocumentFragment();
			map.style.setProperty("--cells", quad ? 20 : 40);
			map.classList.toggle("zoomed", Boolean(quad));
			$("heat-west").textContent = quad.endsWith("E") ? "x 0" : "x −200";
			$("heat-east").textContent = quad.endsWith("W") ? "x −1" : "x 200";
			function inspect(cell) {
				const best = cell.best;
				$("heat-area").textContent = cell.quad + " · x " + bounds(cell.bx) + " / y " + bounds(cell.by);
				detail.textContent = [
					cell.seen + " coordinates observed in this area.",
					layer === "spawn" ? "Spawn " + (cell.spawn ?? "—") + "/100" : "Best settlement " + (best?.settle ?? "—") + "/100",
					layer === "spawn" ? spawnEvidence(cell) : best && [
						best.type + " at " + best.point, breakdown(best.parts), best.coverage + " neighbours seen · " + best.neighbours,
						"Target distance " + (best.distance ?? "unknown"), "Best free oases: " + (best.oases || "none observed"),
					].join("\n"),
				].filter(Boolean).join("\n");
			}
			for (const c of cells) {
				const n = score(c), btn = document.createElement("button");
				btn.type = "button";
				btn.className = "heat-cell";
				btn.dataset.level = n == null ? "unknown" : Math.min(4, Math.floor(n / 20));
				btn.style.gridColumn = c.bx + (quad && quad.endsWith("E") ? 1 : 21);
				btn.style.gridRow = (quad && quad.startsWith("S") ? 0 : 20) - c.by;
				btn.title = c.quad + " · x " + bounds(c.bx) + ", y " + bounds(c.by) + " · " + (n == null ? "unscored" : n + "/100") +
					" · " + (layer === "spawn" ? breakdown(c.parts) : c.best?.point || "");
				btn.setAttribute("aria-label", btn.title);
				btn.setAttribute("aria-pressed", String(selected === c.id));
				btn.onmouseenter = btn.onfocus = () => inspect(c);
				btn.onclick = () => {
					map.dataset.cell = c.id;
					map.dispatchEvent(new Event("change"));
				};
				frag.append(btn);
			}
			map.replaceChildren(frag);
			$("heat-quads").replaceChildren(...WWAnalysis.QUADRANTS.map((q) => {
				const areas = [...model.cells.values()].filter((c) => c.quad === q && c.seen);
				const high = areas.reduce((n, c) => Math.max(n, score(c) ?? -1), -1);
				const tr = document.createElement("tr");
				for (const value of [q, high < 0 ? "—" : high, areas.reduce((n, c) => n + c.seen, 0)]) {
					const td = document.createElement("td");
					td.textContent = value;
					tr.append(td);
				}
				return tr;
			}));
			const first = cells.find((c) => c.id === selected) || cells.reduce((a, b) =>
				!a || (score(b) ?? -1) > (score(a) ?? -1) ? b : a, null);
			if (first) inspect(first);
			else {
				$("heat-area").textContent = "No matching areas";
				detail.textContent = model.records.length ? "Adjust the quadrant or minimum score." :
					"Open the game map at 100% and pan through the area to collect terrain.";
			}
			$("heat-clear").hidden = !selected;
			return rows.length + " coordinate records" + (selected ? " in selected area" : "") +
				" · " + (snapshotTime ? "Snapshot " + snapshotTime : "No snapshot for competition or spawn rings");
		}
		return { rows, drawMap: draw };
	}
	root.WWHeatView = { columns, view };
})(globalThis);
