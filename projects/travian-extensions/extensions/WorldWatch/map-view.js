// Canvas world map in the style of the in-game Travian map.
// 60 px per field at 100 %, 543 x 401 px window, rulers left and bottom.
(function (root) {
	"use strict";

	const FIELD_PX = 60;
	const ZOOMS = [1, 0.5, 0.25, 0.1, 0.05, 0.03, 0.02];
	const VIEW_W = 543;
	const VIEW_H = 401;
	const RULER_Y_W = 26;
	const RULER_X_H = 17;
	const SPAN = 401;
	const GRASS = ["#b4d07e", "#b1ce7a", "#b7d282", "#afcc78"];
	const SPAWN = "#ffd84a";
	const EDGE = "#5a4220";
	const TOP10 = "#e01e37";
	const TOP100 = "#ffffff";
	const OWN = "#1e88e5";
	const CROPPER = "#124c44";

	// Zoom levels for a view; the last one fits the whole world.
	function zoomLevels(vw, vh) {
		const fit = Math.min(vw, vh) / (SPAN * FIELD_PX);
		return [...ZOOMS.filter((z) => z > fit * 1.05), fit];
	}

	function signedWrap(d) {
		let v = ((d % SPAN) + SPAN) % SPAN;
		if (v > SPAN / 2) v -= SPAN;
		return v;
	}

	function wrapCoord(v) {
		return ((((Math.round(v) + 200) % SPAN) + SPAN) % SPAN) - 200;
	}

	function noise(x, y) {
		const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
		return n - Math.floor(n);
	}

	// Smallest ruler step from 1, 2, 5, 10, 20, 25, 50, 100 that is at least min.
	function niceStep(min) {
		return [1, 2, 5, 10, 20, 25, 50, 100].find((n) => n >= min) || 100;
	}

	// Village size class like Travian's map sprites.
	function sizeClass(pop) {
		if (pop >= 500) return 3;
		if (pop >= 250) return 2;
		if (pop >= 100) return 1;
		return 0;
	}

	function drawVillage(g, sx, sy, s, pop, ring) {
		const base = (s < 12 ? 0.17 : 0.24) * s + sizeClass(pop) * 0.04 * s;
		if (s < 12) {
			g.fillStyle = ring || "#8a5a2b";
			g.beginPath();
			g.arc(sx, sy, Math.max(ring ? 2.6 : 1.6, base * 1.1), 0, Math.PI * 2);
			g.fill();
			return;
		}
		if (ring) {
			g.strokeStyle = ring;
			g.lineWidth = Math.max(2, s * 0.06);
			g.beginPath();
			g.ellipse(sx, sy, base * 1.45, base * 1.15, 0, 0, Math.PI * 2);
			g.stroke();
		}
		g.fillStyle = "#d8c08a";
		g.strokeStyle = "#8f7442";
		g.lineWidth = 1;
		g.beginPath();
		g.ellipse(sx, sy, base * 1.2, base * 0.9, 0, 0, Math.PI * 2);
		g.fill();
		g.stroke();
		const huts = 3 + sizeClass(pop);
		for (let i = 0; i < huts; i++) {
			const a = (i / huts) * Math.PI * 2 + 0.6;
			const hx = sx + Math.cos(a) * base * 0.55;
			const hy = sy + Math.sin(a) * base * 0.42;
			const w = base * 0.42;
			g.fillStyle = "#efe2c2";
			g.fillRect(hx - w / 2, hy - w * 0.2, w, w * 0.6);
			g.fillStyle = "#a4452c";
			g.beginPath();
			g.moveTo(hx - w * 0.62, hy - w * 0.15);
			g.lineTo(hx, hy - w * 0.75);
			g.lineTo(hx + w * 0.62, hy - w * 0.15);
			g.closePath();
			g.fill();
		}
	}

	function createMap(container, tooltip) {
		const canvas = document.createElement("canvas");
		const dpr = root.devicePixelRatio || 1;
		let vw = VIEW_W;
		let vh = VIEW_H;
		let W = 0;
		let H = 0;
		// Sizes the map to the container; never smaller than the in-game window.
		function resize() {
			const rect = container.getBoundingClientRect();
			const nextW = Math.max(VIEW_W, Math.floor(rect.width) - RULER_Y_W);
			const nextH = Math.max(VIEW_H, Math.floor(rect.height) - RULER_X_H);
			if (W && nextW === vw && nextH === vh) return false;
			vw = nextW;
			vh = nextH;
			W = RULER_Y_W + vw;
			H = vh + RULER_X_H;
			canvas.width = W * dpr;
			canvas.height = H * dpr;
			canvas.style.width = `${W}px`;
			canvas.style.height = `${H}px`;
			return true;
		}
		canvas.className = "map-canvas";
		container.replaceChildren(canvas);
		const g = canvas.getContext("2d");
		resize();
		if (root.ResizeObserver) {
			new root.ResizeObserver(() => {
				if (resize()) draw();
			}).observe(container);
		}
		const st = { snap: null, layers: null, croppers: new Map(), show: { spawns: true, alliances: true, top10: false, top100: false, croppers: true }, cx: 0, cy: 0, zoom: 0, byField: new Map(), onChange: null };

		const levels = () => zoomLevels(vw, vh);
		const zoomValue = () => levels()[st.zoom];
		const scale = () => FIELD_PX * zoomValue();
		const toScreen = (x, y, s) => [RULER_Y_W + vw / 2 + (x - st.cx) * s, vh / 2 - (y - st.cy) * s];
		const toField = (px, py) => {
			const s = scale();
			const fx = st.cx + (px - RULER_Y_W - vw / 2) / s;
			const fy = st.cy - (py - vh / 2) / s;
			return [wrapCoord(fx), wrapCoord(fy)];
		};

		function drawGround(s, fx0, fx1, fy0, fy1) {
			g.fillStyle = GRASS[0];
			g.fillRect(RULER_Y_W, 0, vw, vh);
			if (s < 30) return;
			for (let fx = fx0; fx <= fx1; fx++) {
				for (let fy = fy0; fy <= fy1; fy++) {
					const [sx, sy] = toScreen(fx, fy, s);
					const wx = wrapCoord(fx);
					const wy = wrapCoord(fy);
					g.fillStyle = GRASS[Math.floor(noise(wx, wy) * GRASS.length)];
					g.fillRect(sx - s / 2, sy - s / 2, s + 0.5, s + 0.5);
					if (s >= 30 && noise(wy, wx) > 0.82) {
						g.fillStyle = "#7fa64a";
						g.beginPath();
						g.arc(sx + (noise(wx + 1, wy) - 0.5) * s * 0.6, sy + (noise(wx, wy + 1) - 0.5) * s * 0.6, s * 0.05, 0, Math.PI * 2);
						g.fill();
					}
				}
			}
			if (s >= 15) {
				g.strokeStyle = "rgba(80, 100, 40, 0.12)";
				g.lineWidth = 1;
				g.beginPath();
				for (let fx = fx0; fx <= fx1 + 1; fx++) {
					const x = Math.round(toScreen(fx, 0, s)[0] - s / 2) + 0.5;
					g.moveTo(x, 0);
					g.lineTo(x, vh);
				}
				for (let fy = fy0; fy <= fy1 + 1; fy++) {
					const y = Math.round(toScreen(0, fy, s)[1] - s / 2) + 0.5;
					g.moveTo(RULER_Y_W, y);
					g.lineTo(RULER_Y_W + vw, y);
				}
				g.stroke();
			}
		}

		function drawRing(s, project) {
			const ring = st.layers && st.layers.ring;
			if (!st.show.spawns || !ring) return;
			const [ox, oy] = project(0, 0);
			g.fillStyle = "rgba(255, 216, 74, 0.22)";
			g.beginPath();
			g.arc(ox, oy, ring.max * s, 0, Math.PI * 2);
			g.arc(ox, oy, Math.max(0, ring.min * s), 0, Math.PI * 2, true);
			g.fill();
			g.setLineDash([6, 5]);
			g.strokeStyle = "rgba(150, 110, 0, 0.8)";
			g.lineWidth = 1.5;
			g.beginPath();
			g.arc(ox, oy, ring.median * s, 0, Math.PI * 2);
			g.stroke();
			g.setLineDash([]);
		}

		function allianceColor(aid) {
			if (!st.show.alliances || !aid) return null;
			const a = st.layers.alliances.find((al) => al.aid === aid);
			return a ? a.color : null;
		}

		// Rank (1-based) of the account when the Top 10 / Top 100 layer shows it.
		function shownRank(uid) {
			const rank = st.layers.topRank && st.layers.topRank.get(uid);
			if (!rank) return 0;
			if (rank <= 10 && (st.show.top10 || st.show.top100)) return rank;
			return st.show.top100 ? rank : 0;
		}

		function drawTopMarker(sx, sy, s, rank) {
			const r = Math.max(rank <= 10 ? 5 : 4, s * 0.4);
			g.lineWidth = rank <= 10 ? Math.max(2.5, s * 0.07) : Math.max(1.5, s * 0.04);
			g.strokeStyle = "rgba(0, 0, 0, 0.55)";
			g.beginPath();
			g.arc(sx, sy, r + 1, 0, Math.PI * 2);
			g.stroke();
			g.strokeStyle = rank <= 10 ? TOP10 : TOP100;
			g.beginPath();
			g.arc(sx, sy, r, 0, Math.PI * 2);
			g.stroke();
		}

		function drawVillages(s, project) {
			const snap = st.snap;
			const pad = Math.max(s, 8);
			const spawnIdx = [];
			const topIdx = [];
			for (let i = 0; i < snap.uid.length; i++) {
				const [sx, sy] = project(snap.x[i], snap.y[i]);
				if (sx < RULER_Y_W - pad || sx > RULER_Y_W + vw + pad || sy < -pad || sy > vh + pad) continue;
				if (shownRank(snap.uid[i])) topIdx.push(i);
				if (st.show.spawns && st.layers.spawnVids.has(snap.vid[i])) {
					spawnIdx.push(i);
					continue;
				}
				drawVillage(g, sx, sy, s, snap.pop[i], allianceColor(snap.aid[i]));
			}
			for (const i of spawnIdx) {
				const [sx, sy] = project(snap.x[i], snap.y[i]);
				g.fillStyle = "rgba(255, 216, 74, 0.55)";
				g.beginPath();
				g.arc(sx, sy, Math.max(4, s * 0.42), 0, Math.PI * 2);
				g.fill();
				drawVillage(g, sx, sy, s, snap.pop[i], allianceColor(snap.aid[i]) || SPAWN);
			}
			topIdx.sort((a, b) => shownRank(snap.uid[b]) - shownRank(snap.uid[a]));
			for (const i of topIdx) {
				const [sx, sy] = project(snap.x[i], snap.y[i]);
				drawTopMarker(sx, sy, s, shownRank(snap.uid[i]));
			}
			for (const v of st.layers.own || []) {
				const [sx, sy] = project(v.x, v.y);
				const r = Math.max(6, s * 0.46);
				g.lineWidth = Math.max(3, s * 0.08);
				g.strokeStyle = "rgba(0, 0, 0, 0.6)";
				g.beginPath();
				g.arc(sx, sy, r + 1.5, 0, Math.PI * 2);
				g.stroke();
				g.strokeStyle = OWN;
				g.beginPath();
				g.arc(sx, sy, r, 0, Math.PI * 2);
				g.stroke();
				g.lineWidth = Math.max(1.5, s * 0.03);
				g.strokeStyle = "#ffffff";
				g.beginPath();
				g.arc(sx, sy, Math.max(3, r - Math.max(3, s * 0.08)), 0, Math.PI * 2);
				g.stroke();
			}
		}

		function label(text, sx, sy, color, placed) {
			g.font = "bold 11px Verdana, Arial, sans-serif";
			const w = g.measureText(text).width + 10;
			const hits = (y) => placed.some((r) => Math.abs(r.x - sx) < (r.w + w) / 2 && Math.abs(r.y - y) < 19);
			for (let n = 0; n < 6 && hits(sy); n++) sy += n % 2 ? -20 * (n + 1) : 20 * (n + 1);
			placed.push({ x: sx, y: sy, w });
			g.fillStyle = "rgba(40, 30, 15, 0.82)";
			g.fillRect(sx - w / 2, sy - 9, w, 18);
			g.fillStyle = color;
			g.fillRect(sx - w / 2, sy - 9, 3, 18);
			g.fillStyle = "#ffffff";
			g.textAlign = "center";
			g.textBaseline = "middle";
			g.fillText(text, sx + 1, sy);
		}

		function drawLabels(project, placed) {
			for (const v of st.layers.own || []) {
				const [sx, sy] = project(v.x, v.y);
				if (sx < RULER_Y_W || sx > RULER_Y_W + vw || sy < 0 || sy > vh) continue;
				label(v.name || `${v.x}|${v.y}`, sx, sy + 24, OWN, placed);
			}
			if (st.show.top10 || st.show.top100) {
				for (const a of st.layers.top.slice(0, 10)) {
					const [sx, sy] = project(a.x, a.y);
					if (sx < RULER_Y_W || sx > RULER_Y_W + vw || sy < 0 || sy > vh) continue;
					label(`#${a.rank} ${a.player || a.uid}`, sx, sy - 22, TOP10, placed);
				}
			}
			if (!st.show.alliances) return;
			for (const a of st.layers.alliances) {
				const [x, y] = a.centre.split("|").map(Number);
				const [sx, sy] = project(x, y);
				if (sx < RULER_Y_W || sx > RULER_Y_W + vw || sy < 0 || sy > vh) continue;
				label(a.tag || `#${a.aid}`, sx, sy, a.color, placed);
			}
		}

		// Each seam sits halfway between field 200 and the next copy's -200.
		function drawEdges(s, fx0, fx1, fy0, fy1) {
			g.strokeStyle = EDGE;
			g.lineWidth = 2;
			g.beginPath();
			for (let fx = Math.ceil((fx0 + SPAN / 2) / SPAN) * SPAN - SPAN / 2; fx <= fx1; fx += SPAN) {
				const [x] = toScreen(fx, 0, s);
				g.moveTo(x, 0);
				g.lineTo(x, vh);
			}
			for (let fy = Math.ceil((fy0 + SPAN / 2) / SPAN) * SPAN - SPAN / 2; fy <= fy1; fy += SPAN) {
				const [, y] = toScreen(0, fy, s);
				g.moveTo(RULER_Y_W, y);
				g.lineTo(RULER_Y_W + vw, y);
			}
			g.stroke();
		}

		function drawRulers(s, fx0, fx1, fy0, fy1) {
			g.fillStyle = "#e9dfc4";
			g.fillRect(0, 0, RULER_Y_W, H);
			g.fillRect(0, vh, W, RULER_X_H);
			g.strokeStyle = "#b5a37a";
			g.lineWidth = 1;
			g.strokeRect(RULER_Y_W - 0.5, -0.5, vw + 1, vh + 1);
			g.fillStyle = "#3c3020";
			g.font = "10px Verdana, Arial, sans-serif";
			g.textAlign = "center";
			g.textBaseline = "middle";
			const step = niceStep(28 / s);
			for (let fx = fx0; fx <= fx1; fx++) {
				const v = wrapCoord(fx);
				if (v % step || v === 200) continue;
				const [sx] = toScreen(fx, 0, s);
				if (sx < RULER_Y_W + 8 || sx > W - 8) continue;
				g.fillText(String(v), sx, vh + RULER_X_H / 2 + 1);
			}
			const stepY = niceStep(16 / s);
			for (let fy = fy0; fy <= fy1; fy++) {
				const v = wrapCoord(fy);
				if (v % stepY || v === 200) continue;
				const [, sy] = toScreen(0, fy, s);
				if (sy < 6 || sy > vh - 6) continue;
				g.fillText(String(v), RULER_Y_W / 2, sy);
			}
		}

		function drawCroppers(s, project) {
			if (!st.show.croppers) return;
			const label = s >= 45;
			const r = label ? 18 : s >= 12 ? 7 : 4;
			for (const tile of st.croppers.values()) {
				const [x, y] = project(tile.x, tile.y);
				if (x < RULER_Y_W - r || x > RULER_Y_W + vw + r || y < -r || y > vh + r) continue;
				g.fillStyle = CROPPER;
				g.strokeStyle = "#fff9ea";
				g.lineWidth = label ? 2 : 1.5;
				g.beginPath();
				g.moveTo(x, y - r);
				g.lineTo(x + r, y);
				g.lineTo(x, y + r);
				g.lineTo(x - r, y);
				g.closePath();
				g.fill();
				g.stroke();
				if (label) {
					g.font = "600 12px system-ui";
					g.textAlign = "center";
					g.textBaseline = "middle";
					g.fillStyle = "#fff9ea";
					g.fillText("15c", x, y);
				}
			}
		}

		function draw() {
			g.setTransform(dpr, 0, 0, dpr, 0, 0);
			g.clearRect(0, 0, W, H);
			st.zoom = Math.min(st.zoom, levels().length - 1);
			const s = scale();
			const halfX = Math.ceil(vw / 2 / s) + 1;
			const halfY = Math.ceil(vh / 2 / s) + 1;
			const fx0 = Math.floor(st.cx) - halfX;
			const fx1 = Math.ceil(st.cx) + halfX;
			const fy0 = Math.floor(st.cy) - halfY;
			const fy1 = Math.ceil(st.cy) + halfY;
			g.save();
			g.beginPath();
			g.rect(RULER_Y_W, 0, vw, vh);
			g.clip();
			drawGround(s, fx0, fx1, fy0, fy1);
			const placed = [];
			const pad = 8 / s;
			const worldIndex = (v) => Math.floor((v + SPAN / 2) / SPAN);
			const copies = [];
			for (let x = worldIndex(fx0 - pad); x <= worldIndex(fx1 + pad); x++) {
				for (let y = worldIndex(fy0 - pad); y <= worldIndex(fy1 + pad); y++) {
					copies.push((fx, fy) => toScreen(fx + x * SPAN, fy + y * SPAN, s));
				}
			}
			if (st.snap) {
				for (const project of copies) drawRing(s, project);
				for (const project of copies) drawVillages(s, project);
				for (const project of copies) drawLabels(project, placed);
			}
			drawEdges(s, fx0, fx1, fy0, fy1);
			for (const project of copies) drawCroppers(s, project);
			g.restore();
			drawRulers(s, fx0, fx1, fy0, fy1);
			if (st.onChange) st.onChange({ cx: wrapCoord(st.cx), cy: wrapCoord(st.cy), zoom: zoomValue() });
		}

		function indexFields() {
			st.byField = new Map();
			const snap = st.snap;
			if (!snap) return;
			for (let i = 0; i < snap.uid.length; i++) st.byField.set(snap.x[i] * 1000 + snap.y[i], i);
		}

		function showTip(evt) {
			const rect = canvas.getBoundingClientRect();
			const px = evt.clientX - rect.left;
			const py = evt.clientY - rect.top;
			let [fx, fy] = toField(px, py);
			if (px < RULER_Y_W || px > W || py < 0 || py > vh) {
				tooltip.hidden = true;
				return;
			}
			let cropper = st.show.croppers ? st.croppers.get(`${fx}|${fy}`) : null;
			if (!cropper && st.show.croppers && scale() < 12) {
				const s = scale();
				let nearest = 5;
				for (const tile of st.croppers.values()) {
					const [sx, sy] = toScreen(tile.x, tile.y, s);
					const distance = Math.hypot(signedWrap((px - sx) / s), signedWrap((py - sy) / s)) * s;
					if (distance < nearest) { cropper = tile; nearest = distance; }
				}
				if (cropper) ({ x: fx, y: fy } = cropper);
			}
			if (!st.snap && !cropper) { tooltip.hidden = true; return; }
			const i = st.byField.get(fx * 1000 + fy);
			const lines = [`(${fx}|${fy})`];
			if (cropper) {
				lines[0] = `15c (${fx}|${fy})`;
				lines.push(cropper.seen ? `Crop potential +${cropper.potential}% · Free when seen +${cropper.free}%` : "Oasis bonuses unknown");
				lines.push(`${cropper.seen}/${cropper.total} adjacent tiles checked`);
				for (const oasis of cropper.best) lines.push(`${oasis.x}|${oasis.y}  +${oasis.crop}% crop${oasis.occupied ? " · occupied" : ""}`);
			}
			if (i != null) {
				const snap = st.snap;
				const player = snap.players[snap.uid[i]] || `uid ${snap.uid[i]}`;
				if (cropper) lines.push(player);
				else lines.unshift(player);
				if (snap.aid[i]) lines.push(`Alliance: ${snap.alliances[snap.aid[i]] || snap.aid[i]}`);
				lines.push(`Population: ${snap.pop[i]}`);
				const rank = st.layers.topRank && st.layers.topRank.get(snap.uid[i]);
				if (rank) lines.push(`Rank: ${rank}`);
				if (st.layers.spawnVids.has(snap.vid[i])) lines.push(`New account · uid ${snap.uid[i]}`);
			}
			tooltip.replaceChildren(
				...lines.map((t, n) => {
					const div = document.createElement("div");
					div.textContent = t;
					if (n === 0) div.className = "tip-title";
					return div;
				}),
			);
			tooltip.hidden = false;
			tooltip.style.left = `${px + 14}px`;
			tooltip.style.top = `${py + 14}px`;
		}

		let drag = null;
		canvas.addEventListener("pointerdown", (e) => {
			drag = { x: e.clientX, y: e.clientY, cx: st.cx, cy: st.cy };
			canvas.setPointerCapture(e.pointerId);
			canvas.classList.add("dragging");
		});
		canvas.addEventListener("pointermove", (e) => {
			if (drag) {
				const s = scale();
				st.cx = drag.cx - (e.clientX - drag.x) / s;
				st.cy = drag.cy + (e.clientY - drag.y) / s;
				draw();
				tooltip.hidden = true;
			} else showTip(e);
		});
		const endDrag = () => {
			if (!drag) return;
			drag = null;
			st.cx = signedWrap(st.cx);
			st.cy = signedWrap(st.cy);
			canvas.classList.remove("dragging");
			draw();
		};
		canvas.addEventListener("pointerup", endDrag);
		canvas.addEventListener("pointercancel", endDrag);
		canvas.addEventListener("pointerleave", () => {
			tooltip.hidden = true;
		});
		canvas.addEventListener(
			"wheel",
			(e) => {
				e.preventDefault();
				api.setZoom(st.zoom + (e.deltaY > 0 ? 1 : -1));
			},
			{ passive: false },
		);

		const api = {
			ZOOMS,
			setData(snap, layers, croppers = []) {
				st.snap = snap;
				st.layers = layers;
				st.croppers = new Map(croppers.map((tile) => [`${tile.x}|${tile.y}`, tile]));
				tooltip.hidden = true;
				indexFields();
				draw();
			},
			setShow(show) {
				st.show = { ...st.show, ...show };
				tooltip.hidden = true;
				draw();
			},
			centre(x, y) {
				st.cx = x;
				st.cy = y;
				draw();
			},
			setZoom(index) {
				st.zoom = Math.max(0, Math.min(levels().length - 1, index));
				draw();
			},
			get zoom() {
				return st.zoom;
			},
			onChange(fn) {
				st.onChange = fn;
			},
			draw,
		};
		draw();
		return api;
	}

	root.WWMap = { createMap, zoomLevels, niceStep, signedWrap, wrapCoord, sizeClass, FIELD_PX, ZOOMS, VIEW_W, VIEW_H, CROPPER };
})(globalThis);
