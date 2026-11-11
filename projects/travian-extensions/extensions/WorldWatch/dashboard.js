// WorldWatch dashboard: analysis tables over stored snapshots.
(function () {
	"use strict";
	const api = globalThis.browser ?? chrome; // eslint-disable-line no-undef
	const A = WWAnalysis;
	const $ = (id) => document.getElementById(id);
	const state = { view: "growth", metas: [], cache: new Map(), rows: [], columns: [] };

	const COLUMNS = {
		growth: [
			{ key: "time", label: "Time" },
			{ key: "maxUid", label: "Sign-ups (max uid)" },
			{ key: "signupsDelta", label: "Δ sign-ups" },
			{ key: "accounts", label: "Accounts" },
			{ key: "villages", label: "Villages" },
			{ key: "pop", label: "Pop" },
		],
		spawn: [
			{ key: "quadrant", label: "Quadrant" },
			{ key: "accounts", label: "Accounts" },
			{ key: "minDist", label: "Min dist" },
			{ key: "medianDist", label: "Median dist" },
			{ key: "maxDist", label: "Max dist" },
			{ key: "newestUid", label: "Newest uid" },
			{ key: "examples", label: "Newest spawns" },
		],
		gold: [
			{ key: "player", label: "Player" },
			{ key: "uid", label: "uid" },
			{ key: "alliance", label: "Alliance" },
			{ key: "popBefore", label: "Pop before" },
			{ key: "pop", label: "Pop" },
			{ key: "gain", label: "Gain" },
			{ key: "perHour", label: "Gain/h" },
			{ key: "villages", label: "Villages" },
			{ key: "villagesDelta", label: "Δ villages" },
			{ key: "spawn", label: "Spawn" },
			{ key: "distance", label: "Distance" },
			{ key: "flagText", label: "p99" },
		],
		alliances: [
			{ key: "tag", label: "Alliance" },
			{ key: "aid", label: "aid" },
			{ key: "members", label: "Members" },
			{ key: "villages", label: "Villages" },
			{ key: "pop", label: "Pop" },
			{ key: "centre", label: "Centre" },
			{ key: "quadrant", label: "Quadrant" },
		],
	};

	function fmtTime(t) {
		const d = new Date(t);
		const pad = (n) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function setMsg(text, isError) {
		$("msg").textContent = text || "";
		$("msg").classList.toggle("error", Boolean(isError));
	}

	function option(value, text) {
		const o = document.createElement("option");
		o.value = value;
		o.textContent = text;
		return o;
	}

	async function loadSnap(id) {
		if (!state.cache.has(id)) state.cache.set(id, await WWDb.getData(id));
		return state.cache.get(id);
	}

	async function loadHosts() {
		const data = await api.storage.local.get("wwHosts");
		const hosts = Array.isArray(data.wwHosts) ? data.wwHosts : [];
		$("host").replaceChildren(...hosts.map((h) => option(h, h)));
		if (!hosts.length) setMsg("No worlds watched. Add one in the popup.", true);
		await loadMetas();
	}

	async function loadMetas() {
		const host = $("host").value;
		state.metas = host ? await WWDb.list(host) : [];
		const newestFirst = [...state.metas].reverse();
		const ids = new Set(newestFirst.map((m) => String(m.id)));
		const keepCur = ids.has($("cur").value) && $("cur").dataset.host === host ? $("cur").value : null;
		const keepPrev = ids.has($("prev").value) && $("prev").dataset.host === host ? $("prev").value : null;
		const opts = () => newestFirst.map((m) => option(m.id, `${fmtTime(m.t)} · ${m.maxUid}`));
		$("cur").replaceChildren(...opts());
		$("prev").replaceChildren(...opts());
		$("cur").dataset.host = host;
		$("prev").dataset.host = host;
		if (keepCur) $("cur").value = keepCur;
		if (keepPrev) $("prev").value = keepPrev;
		else if (newestFirst[1]) $("prev").value = newestFirst[1].id;
		if (host && !state.metas.length) setMsg("No snapshots yet.", true);
		else if (host) setMsg("");
		await render();
	}

	function metaById(id) {
		return state.metas.find((m) => m.id === Number(id));
	}

	async function compute() {
		const view = state.view;
		if (view === "growth") {
			return { rows: A.growth(state.metas).map((r) => ({ ...r, time: fmtTime(r.t) })).reverse(), summary: `Snapshots: ${state.metas.length}` };
		}
		const cur = metaById($("cur").value);
		if (!cur) return { rows: [], summary: "" };
		const snap = await loadSnap(cur.id);
		if (view === "spawn") {
			const count = Math.max(5, Math.min(500, Number($("spawn-count").value) || 40));
			return { rows: A.spawnRing(snap, count), summary: `Sign-ups ${cur.maxUid} · accounts ${cur.accounts}` };
		}
		if (view === "alliances") return { rows: A.topAlliances(snap, 50), summary: "" };
		if (view === "map") return renderMap(cur, snap);
		const prev = metaById($("prev").value);
		if (!prev || prev.id === cur.id) return { rows: [], summary: "Pick two different snapshots." };
		const [older, newer] = prev.t < cur.t ? [prev, cur] : [cur, prev];
		const point = A.parsePoint($("point").value);
		if ($("point").value.trim() && !point) return { rows: [], summary: "Point must be x|y within ±200." };
		const radius = Number($("radius").value);
		const result = A.goldSuspects(
			{ t: older.t, snap: await loadSnap(older.id) },
			{ t: newer.t, snap: await loadSnap(newer.id) },
			{ point, radius: point && radius > 0 ? radius : undefined },
		);
		let rows = result.rows.map((r) => ({ ...r, flagText: r.flag ? "▲" : "" }));
		if ($("flagged").checked) rows = rows.filter((r) => r.flag);
		return { rows, summary: `${result.hours} h · compared ${result.compared} · p99 gain ${result.p99 ?? "–"}` };
	}

	let map = null;
	let mapKey = "";

	function mapInstance() {
		if (map) return map;
		map = WWMap.createMap($("map-canvas"), $("map-tip"));
		map.onChange(({ cx, cy, zoom }) => {
			const pct = zoom * 100;
			$("map-zoom").textContent = `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
			$("map-pos").textContent = `(${cx}|${cy})`;
		});
		return map;
	}

	function legendItem(color, text, cls) {
		const li = document.createElement("li");
		const sw = document.createElement("span");
		sw.className = `swatch ${cls || ""}`;
		sw.style.background = color;
		li.append(sw, document.createTextNode(text));
		return li;
	}

	function renderMap(meta, snap) {
		const m = mapInstance();
		const count = Math.max(5, Math.min(500, Number($("map-count").value) || 40));
		const layers = A.mapLayers(snap, { spawnCount: count, allianceCount: 10 });
		const key = `${meta.id}:${count}`;
		m.setData(snap, layers);
		if (key.split(":")[0] !== mapKey.split(":")[0] && layers.newest) m.centre(layers.newest.sx, layers.newest.sy);
		mapKey = key;
		const items = [];
		if (layers.ring) items.push(legendItem("#ffd84a", `Spawns: ${layers.spawnUids.size} · ${layers.ring.min}–${layers.ring.max} (median ${layers.ring.median})`, "spawn"));
		if ($("map-top10").checked || $("map-top100").checked) {
			items.push(legendItem("#e01e37", "Top 10", "ring"));
			for (const t of layers.top.slice(0, 10)) items.push(legendItem("transparent", `#${t.rank} ${t.player || t.uid} · ${t.pop} · ${t.x}|${t.y}`, "blank"));
		}
		if ($("map-top100").checked) items.push(legendItem("#ffffff", "Top 100", "ring white"));
		for (const a of layers.alliances) items.push(legendItem(a.color, `${a.tag || "#" + a.aid} · ${a.members} · ${a.pop} · ${a.centre}`));
		$("map-legend").replaceChildren(...items);
		const newest = layers.newest ? ` · newest uid ${layers.newest.uid} at ${layers.newest.sx}|${layers.newest.sy}` : "";
		return { rows: [], summary: `Sign-ups ${meta.maxUid}${newest}` };
	}

	function renderTable(columns, rows) {
		const head = document.createElement("tr");
		for (const c of columns) {
			const th = document.createElement("th");
			th.textContent = c.label;
			head.append(th);
		}
		$("table").tHead.replaceChildren(head);
		const body = $("table").tBodies[0];
		const frag = document.createDocumentFragment();
		for (const r of rows.slice(0, 1000)) {
			const tr = document.createElement("tr");
			if (r.flag) tr.className = "flag";
			for (const c of columns) {
				const td = document.createElement("td");
				td.textContent = r[c.key] ?? "";
				tr.append(td);
			}
			frag.append(tr);
		}
		body.replaceChildren(frag);
	}

	async function render() {
		try {
			const { rows, summary } = await compute();
			state.rows = rows;
			state.columns = COLUMNS[state.view] || [];
			if (state.view !== "map") renderTable(state.columns, rows);
			$("summary").textContent = summary + (rows.length > 1000 ? ` · showing 1000 of ${rows.length}` : "");
		} catch (err) {
			setMsg(err.message, true);
		}
	}

	function exportCsv() {
		const csv = A.toCsv(state.columns, state.rows);
		const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `worldwatch-${$("host").value || "world"}-${state.view}.csv`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}

	function selectView(view) {
		state.view = view;
		for (const b of document.querySelectorAll("[data-view]")) b.setAttribute("aria-selected", String(b.dataset.view === view));
		$("controls-spawn").hidden = view !== "spawn";
		$("controls-gold").hidden = view !== "gold";
		$("controls-map").hidden = view !== "map";
		$("map-section").hidden = view !== "map";
		$("table-wrap").hidden = view === "map";
		$("csv").hidden = view === "map";
		render();
	}

	function mapGoto() {
		const p = A.parsePoint($("map-goto").value);
		if (!p) {
			setMsg("Point must be x|y within ±200.", true);
			return;
		}
		setMsg("");
		mapInstance().centre(p.x, p.y);
	}

	for (const b of document.querySelectorAll("[data-view]")) b.addEventListener("click", () => selectView(b.dataset.view));
	$("host").addEventListener("change", loadMetas);
	for (const id of ["cur", "prev", "spawn-count", "radius", "flagged"]) $(id).addEventListener("change", render);
	$("point").addEventListener("change", render);
	$("map-count").addEventListener("change", render);
	$("map-spawns").addEventListener("change", () => mapInstance().setShow({ spawns: $("map-spawns").checked }));
	$("map-alliances").addEventListener("change", () => mapInstance().setShow({ alliances: $("map-alliances").checked }));
	for (const id of ["map-top10", "map-top100"]) {
		$(id).addEventListener("change", () => {
			mapInstance().setShow({ top10: $("map-top10").checked, top100: $("map-top100").checked });
			render();
		});
	}
	$("map-zoom-in").addEventListener("click", () => mapInstance().setZoom(mapInstance().zoom - 1));
	$("map-zoom-out").addEventListener("click", () => mapInstance().setZoom(mapInstance().zoom + 1));
	$("map-go").addEventListener("click", mapGoto);
	$("map-goto").addEventListener("keydown", (e) => {
		if (e.key === "Enter") mapGoto();
	});
	$("map-newest").addEventListener("click", () => {
		const meta = metaById($("cur").value);
		if (!meta) return;
		loadSnap(meta.id).then((snap) => {
			const layers = A.mapLayers(snap, { spawnCount: 1 });
			if (layers.newest) mapInstance().centre(layers.newest.sx, layers.newest.sy);
		});
	});
	$("csv").addEventListener("click", exportCsv);
	api.storage.onChanged.addListener((changes, area) => {
		if (area === "local" && changes.wwStatus) loadMetas();
	});
	loadHosts();
})();
