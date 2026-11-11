// Canvas world map in the style of the in-game Travian map.
// 60 px per field at 100 %, 543 x 401 px window, rulers left and bottom.
(function (root) {
	"use strict";

	const FIELD_PX = 60;
	const ZOOMS = [1, 0.5, 0.25, 0.1, 0.05];
	const VIEW_W = 543;
	const VIEW_H = 401;
	const RULER_Y_W = 26;
	const RULER_X_H = 17;
	const SPAN = 401;
	const GRASS = ["#b4d07e", "#b1ce7a", "#b7d282", "#afcc78"];
	const SPAWN = "#ffd84a";

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
		const W = RULER_Y_W + VIEW_W;
		const H = VIEW_H + RULER_X_H;
		canvas.width = W * dpr;
		canvas.height = H * dpr;
		canvas.style.width = `${W}px`;
		canvas.style.height = `${H}px`;
		canvas.className = "map-canvas";
		container.replaceChildren(canvas);
		const g = canvas.getContext("2d");
		const st = { snap: null, layers: null, show: { spawns: true, alliances: true }, cx: 0, cy: 0, zoom: 0, byField: new Map(), onChange: null };

		const scale = () => FIELD_PX * ZOOMS[st.zoom];
		const toScreen = (x, y) => {
			const s = scale();
			return [RULER_Y_W + VIEW_W / 2 + signedWrap(x - st.cx) * s, VIEW_H / 2 - signedWrap(y - st.cy) * s];
		};
		const toField = (px, py) => {
			const s = scale();
			return [wrapCoord(st.cx + (px - RULER_Y_W - VIEW_W / 2) / s), wrapCoord(st.cy - (py - VIEW_H / 2) / s)];
		};

		function drawGround(s, fx0, fx1, fy0, fy1) {
			g.fillStyle = GRASS[0];
			g.fillRect(RULER_Y_W, 0, VIEW_W, VIEW_H);
			if (s < 30) return;
			for (let fx = fx0; fx <= fx1; fx++) {
				for (let fy = fy0; fy <= fy1; fy++) {
					const [sx, sy] = toScreen(fx, fy);
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
					const x = Math.round(toScreen(fx, 0)[0] - s / 2) + 0.5;
					g.moveTo(x, 0);
					g.lineTo(x, VIEW_H);
				}
				for (let fy = fy0; fy <= fy1 + 1; fy++) {
					const y = Math.round(toScreen(0, fy)[1] - s / 2) + 0.5;
					g.moveTo(RULER_Y_W, y);
					g.lineTo(RULER_Y_W + VIEW_W, y);
				}
				g.stroke();
			}
		}

		function drawRing(s) {
			const ring = st.layers && st.layers.ring;
			if (!st.show.spawns || !ring) return;
			const [ox, oy] = toScreen(0, 0);
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

		function drawVillages(s) {
			const snap = st.snap;
			const pad = s;
			const spawnIdx = [];
			for (let i = 0; i < snap.uid.length; i++) {
				const [sx, sy] = toScreen(snap.x[i], snap.y[i]);
				if (sx < RULER_Y_W - pad || sx > RULER_Y_W + VIEW_W + pad || sy < -pad || sy > VIEW_H + pad) continue;
				if (st.show.spawns && st.layers.spawnVids.has(snap.vid[i])) {
					spawnIdx.push(i);
					continue;
				}
				drawVillage(g, sx, sy, s, snap.pop[i], allianceColor(snap.aid[i]));
			}
			for (const i of spawnIdx) {
				const [sx, sy] = toScreen(snap.x[i], snap.y[i]);
				g.fillStyle = "rgba(255, 216, 74, 0.55)";
				g.beginPath();
				g.arc(sx, sy, Math.max(4, s * 0.42), 0, Math.PI * 2);
				g.fill();
				drawVillage(g, sx, sy, s, snap.pop[i], allianceColor(snap.aid[i]) || SPAWN);
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

		function drawAllianceLabels() {
			if (!st.show.alliances) return;
			const placed = [];
			for (const a of st.layers.alliances) {
				const [x, y] = a.centre.split("|").map(Number);
				const [sx, sy] = toScreen(x, y);
				if (sx < RULER_Y_W || sx > RULER_Y_W + VIEW_W || sy < 0 || sy > VIEW_H) continue;
				label(a.tag || `#${a.aid}`, sx, sy, a.color, placed);
			}
		}

		function drawRulers(s, fx0, fx1, fy0, fy1) {
			g.fillStyle = "#e9dfc4";
			g.fillRect(0, 0, RULER_Y_W, H);
			g.fillRect(0, VIEW_H, W, RULER_X_H);
			g.strokeStyle = "#b5a37a";
			g.lineWidth = 1;
			g.strokeRect(RULER_Y_W - 0.5, -0.5, VIEW_W + 1, VIEW_H + 1);
			g.fillStyle = "#3c3020";
			g.font = "10px Verdana, Arial, sans-serif";
			g.textAlign = "center";
			g.textBaseline = "middle";
			const step = Math.max(1, Math.ceil(24 / s));
			for (let fx = fx0; fx <= fx1; fx++) {
				const v = wrapCoord(fx);
				if (v % step) continue;
				const [sx] = toScreen(fx, 0);
				if (sx < RULER_Y_W + 8 || sx > W - 8) continue;
				g.fillText(String(v), sx, VIEW_H + RULER_X_H / 2 + 1);
			}
			const stepY = Math.max(1, Math.ceil(14 / s));
			for (let fy = fy0; fy <= fy1; fy++) {
				const v = wrapCoord(fy);
				if (v % stepY) continue;
				const [, sy] = toScreen(0, fy);
				if (sy < 6 || sy > VIEW_H - 6) continue;
				g.fillText(String(v), RULER_Y_W / 2, sy);
			}
		}

		function draw() {
			g.setTransform(dpr, 0, 0, dpr, 0, 0);
			g.clearRect(0, 0, W, H);
			const s = scale();
			const halfX = Math.ceil(VIEW_W / 2 / s) + 1;
			const halfY = Math.ceil(VIEW_H / 2 / s) + 1;
			const fx0 = Math.floor(st.cx) - halfX;
			const fx1 = Math.ceil(st.cx) + halfX;
			const fy0 = Math.floor(st.cy) - halfY;
			const fy1 = Math.ceil(st.cy) + halfY;
			g.save();
			g.beginPath();
			g.rect(RULER_Y_W, 0, VIEW_W, VIEW_H);
			g.clip();
			drawGround(s, fx0, fx1, fy0, fy1);
			if (st.snap) {
				drawRing(s);
				drawVillages(s);
				drawAllianceLabels();
			}
			g.restore();
			drawRulers(s, fx0, fx1, fy0, fy1);
			if (st.onChange) st.onChange({ cx: Math.round(st.cx), cy: Math.round(st.cy), zoom: ZOOMS[st.zoom] });
		}

		function indexFields() {
			st.byField = new Map();
			const snap = st.snap;
			for (let i = 0; i < snap.uid.length; i++) st.byField.set(snap.x[i] * 1000 + snap.y[i], i);
		}

		function showTip(evt) {
			const rect = canvas.getBoundingClientRect();
			const px = evt.clientX - rect.left;
			const py = evt.clientY - rect.top;
			if (!st.snap || px < RULER_Y_W || py > VIEW_H) {
				tooltip.hidden = true;
				return;
			}
			const [fx, fy] = toField(px, py);
			const i = st.byField.get(fx * 1000 + fy);
			const lines = [`(${fx}|${fy})`];
			if (i != null) {
				const snap = st.snap;
				lines.unshift(snap.players[snap.uid[i]] || `uid ${snap.uid[i]}`);
				if (snap.aid[i]) lines.push(`Alliance: ${snap.alliances[snap.aid[i]] || snap.aid[i]}`);
				lines.push(`Population: ${snap.pop[i]}`);
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
			st.cx = wrapCoord(st.cx);
			st.cy = wrapCoord(st.cy);
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
			setData(snap, layers) {
				st.snap = snap;
				st.layers = layers;
				indexFields();
				draw();
			},
			setShow(show) {
				st.show = { ...st.show, ...show };
				draw();
			},
			centre(x, y) {
				st.cx = x;
				st.cy = y;
				draw();
			},
			setZoom(index) {
				st.zoom = Math.max(0, Math.min(ZOOMS.length - 1, index));
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

	root.WWMap = { createMap, signedWrap, wrapCoord, sizeClass, FIELD_PX, ZOOMS, VIEW_W, VIEW_H };
})(globalThis);
