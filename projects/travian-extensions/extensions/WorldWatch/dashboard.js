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
		croppers: [
			{ key: "point", label: "Coordinates" },
			{ key: "layout", label: "Lumber–Clay–Iron–Crop" },
			{ key: "potential", label: "Crop potential" },
			{ key: "free", label: "Free when seen" },
			{ key: "coverage", label: "Nearby tiles checked" },
			{ key: "oases", label: "Best observed oases" },
			{ key: "seen", label: "First seen" },
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
		const data = await api.storage.local.get(["wwHosts", "wwCroppers"]);
		const hosts = [...new Set([...(Array.isArray(data.wwHosts) ? data.wwHosts : []), ...Object.keys(data.wwCroppers || {})])];
		const selected = $("host").value;
		$("host").replaceChildren(...hosts.map((h) => option(h, h)));
		if (hosts.includes(selected)) $("host").value = selected;
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
		await loadOwn(host);
		if (host && !state.metas.length && !["map", "croppers"].includes(state.view)) setMsg("No snapshots yet.", true);
		else if (host) setMsg("");
		await render();
	}

	// Your villages for this world, read by own-village.js from the game sidebar.
	async function loadOwn(host) {
		const data = await api.storage.local.get("wwOwn");
		const own = (data.wwOwn || {})[host] || null;
		state.own = own;
		const villages = own ? own.villages : [];
		const prev = $("own").value;
		$("own").replaceChildren(...villages.map((v, i) => option(String(i), `${v.name} (${v.x}|${v.y})`)));
		$("own").hidden = $("own-label").hidden = !villages.length;
		if (!villages.length) return;
		const active = villages.findIndex((v) => v.active);
		$("own").value = villages[Number(prev)] && $("own").dataset.host === host ? prev : String(Math.max(0, active));
		$("own").dataset.host = host;
		fillOwnPoint(false);
	}

	// Fills the point inputs with the selected village. Without force, only
	// empty inputs or ones still holding the last automatic value change.
	function fillOwnPoint(force) {
		const v = state.own && state.own.villages[Number($("own").value)];
		if (!v) return;
		const text = `${v.x}|${v.y}`;
		for (const id of ["point", "map-goto"]) {
			const input = $(id);
			if (force || !input.value.trim() || input.value === input.dataset.auto) {
				input.value = text;
				input.dataset.auto = text;
			}
		}
	}

	function metaById(id) {
		return state.metas.find((m) => m.id === Number(id));
	}

	const bonus = (value, seen) => seen ? `+${value}%` : "—";
	async function scoredCroppers(host) {
		const oasisKey = `wwOasis:${host}`;
		const data = await api.storage.local.get(["wwCroppers", oasisKey]);
		const observations = data[oasisKey] || {};
		return Object.values(data.wwCroppers?.[host] || {})
			.map((tile) => ({ ...tile, ...WWCroppers.oasisScore(tile, observations) }))
			.sort((a, b) => b.potential - a.potential || b.free - a.free || b.seen - a.seen || b.seenAt - a.seenAt);
	}

	async function compute() {
		const view = state.view;
		if (view === "croppers") {
			const host = $("host").value;
			const rows = (await scoredCroppers(host)).map((tile) => ({
				point: `${tile.x}|${tile.y}`, layout: "1-1-1-15", seen: fmtTime(tile.seenAt),
				potential: bonus(tile.potential, tile.seen), free: bonus(tile.free, tile.seen), coverage: `${tile.seen}/${tile.total}`,
				oases: tile.best.map(({ x, y, crop, occupied }) => `${x}|${y} +${crop}% (${occupied ? "occupied" : "free"})`).join(", ") || "—",
				href: `https://${host}/map?x=${tile.x}&y=${tile.y}`,
			}));
			return { rows, summary: `${rows.length} confirmed 15c ${rows.length === 1 ? "tile" : "tiles"}`, mapHref: host ? `https://${host}/map` : "" };
		}
		if (view === "growth") {
			return { rows: A.growth(state.metas).map((r) => ({ ...r, time: fmtTime(r.t) })).reverse(), summary: `Snapshots: ${state.metas.length}` };
		}
		const cur = metaById($("cur").value);
		if (view === "map") {
			const host = $("host").value;
			const [snap, crops] = await Promise.all([cur ? loadSnap(cur.id) : null, scoredCroppers(host)]);
			return { rows: [], summary: "", drawMap: () => renderMap(host, cur, snap, crops) };
		}
		if (!cur) return { rows: [], summary: "" };
		const snap = await loadSnap(cur.id);
		if (view === "spawn") {
			const count = Math.max(5, Math.min(500, Number($("spawn-count").value) || 40));
			return { rows: A.spawnRing(snap, count), summary: `Sign-ups ${cur.maxUid} · accounts ${cur.accounts}` };
		}
		if (view === "alliances") return { rows: A.topAlliances(snap, 50), summary: "" };
		const prev = metaById($("prev").value);
		if (!prev || prev.id === cur.id) return { rows: [], summary: "Pick two different snapshots." };
		const [older, newer] = prev.t < cur.t ? [prev, cur] : [cur, prev];
		const point = A.parsePoint($("point").value);
		if ($("point").value.trim() && !point) return { rows: [], summary: "Point must be x|y within ±200." };
		const radius = Number($("radius").value);
		const olderSnap = await loadSnap(older.id);
		const newerSnap = await loadSnap(newer.id);
		const pinUid = state.own?.villages?.length ? A.ownerUid(newerSnap, state.own.villages) : null;
		const result = A.goldSuspects(
			{ t: older.t, snap: olderSnap },
			{ t: newer.t, snap: newerSnap },
			{ point, radius: point && radius > 0 ? radius : undefined, pinUid },
		);
		let rows = result.rows.map((r) => ({ ...r, flagText: r.flag ? "▲" : "" }));
		if ($("flagged").checked) rows = rows.filter((r) => r.flag || r.own);
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

	function renderMap(host, meta, snap, crops) {
		const m = mapInstance();
		const count = Math.max(5, Math.min(500, Number($("map-count").value) || 40));
		const layers = snap ? A.mapLayers(snap, { spawnCount: count, allianceCount: 10 }) : { top: [], alliances: [] };
		layers.own = state.own?.villages || [];
		const key = `${host}:${meta?.id ?? ""}:${Boolean(crops.length)}`;
		m.setData(snap, layers, crops);
		if (key !== mapKey) {
			const first = crops[0];
			if (first && $("map-croppers").checked) m.centre(first.x, first.y);
			else if (layers.newest) m.centre(layers.newest.sx, layers.newest.sy);
		}
		mapKey = key;
		$("map-newest").disabled = !snap;
		const items = [];
		if ($("map-croppers").checked) items.push(legendItem(WWMap.CROPPER, `${crops.length} saved 15c ${crops.length === 1 ? "tile" : "tiles"}`, "cropper"));
		if (layers.own.length) items.push(legendItem("#1e88e5", `Your villages: ${layers.own.map((v) => `${v.name} (${v.x}|${v.y})`).join(", ")}`, "ring blue"));
		if (layers.ring) items.push(legendItem("#ffd84a", `Spawns: ${layers.spawnUids.size} · ${layers.ring.min}–${layers.ring.max} (median ${layers.ring.median})`, "spawn"));
		if ($("map-top10").checked || $("map-top100").checked) {
			items.push(legendItem("#e01e37", "Top 10", "ring"));
			for (const t of layers.top.slice(0, 10)) items.push(legendItem("transparent", `#${t.rank} ${t.player || t.uid} · ${t.pop} · ${t.x}|${t.y}`, "blank"));
		}
		if ($("map-top100").checked) items.push(legendItem("#ffffff", "Top 100", "ring white"));
		for (const a of layers.alliances) items.push(legendItem(a.color, `${a.tag || "#" + a.aid} · ${a.members} · ${a.pop} · ${a.centre}`));
		$("map-legend").replaceChildren(...items);
		const newest = layers.newest ? ` · newest uid ${layers.newest.uid} at ${layers.newest.sx}|${layers.newest.sy}` : "";
		return meta ? `Sign-ups ${meta.maxUid}${newest}` : "";
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
			if (r.own) tr.className = "own";
			else if (r.flag) tr.className = "flag";
			for (const c of columns) {
				const td = document.createElement("td");
				if (c.key === "point" && r.href) {
					const link = document.createElement("a");
					link.href = r.href;
					link.target = "_blank";
					link.rel = "noopener";
					link.textContent = r.point;
					td.append(link);
				} else td.textContent = r[c.key] ?? "";
				tr.append(td);
			}
			frag.append(tr);
		}
		body.replaceChildren(frag);
	}

	let renderId = 0;
	async function render() {
		const id = ++renderId;
		try {
			const { rows, summary, mapHref, drawMap } = await compute();
			if (id !== renderId) return;
			if (mapHref) $("cropper-map").href = mapHref;
			$("cropper-map").hidden = !mapHref;
			state.rows = rows;
			state.columns = COLUMNS[state.view] || [];
			if (state.view !== "map") renderTable(state.columns, rows);
			$("summary").textContent = (drawMap ? drawMap() : summary) + (rows.length > 1000 ? ` · showing 1000 of ${rows.length}` : "");
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
		$("controls-croppers").hidden = view !== "croppers";
		setMsg(!$("host").value ? "No worlds watched. Add one in the popup." :
			!state.metas.length && !["map", "croppers"].includes(view) ? "No snapshots yet." : "");
		for (const id of ["cur", "prev"]) {
			$(id).hidden = view === "croppers";
			document.querySelector(`label[for="${id}"]`).hidden = view === "croppers";
		}
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
	$("own").addEventListener("change", () => {
		fillOwnPoint(true);
		const v = state.own && state.own.villages[Number($("own").value)];
		if (v && state.view === "map") mapInstance().centre(v.x, v.y);
		render();
	});
	for (const id of ["cur", "prev", "spawn-count", "radius", "flagged"]) $(id).addEventListener("change", render);
	$("point").addEventListener("change", render);
	$("map-count").addEventListener("change", render);
	$("map-spawns").addEventListener("change", () => mapInstance().setShow({ spawns: $("map-spawns").checked }));
	$("map-alliances").addEventListener("change", () => mapInstance().setShow({ alliances: $("map-alliances").checked }));
	$("map-croppers").addEventListener("change", () => {
		mapInstance().setShow({ croppers: $("map-croppers").checked });
		render();
	});
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
		if (area !== "local") return;
		if (changes.wwCroppers || changes.wwHosts) loadHosts();
		else if (changes.wwStatus || changes.wwOwn) loadMetas();
		else if (changes[`wwOasis:${$("host").value}`] && ["map", "croppers"].includes(state.view)) render();
	});
	loadHosts();
})();
