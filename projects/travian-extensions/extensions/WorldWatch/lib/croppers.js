// Traverse the same response containers as OasisCalc's tile scanner.
(function (root) {
	"use strict";
	// Travian's map dictionary (karte.json) maps f6 to 1-1-1-15.
	const cropperTitle = /^\s*\{k\.vt\}\s*\{k\.f6\}\s*$/;

	function mapResponseHost(rawUrl) {
		const url = URL.parse(rawUrl);
		if (!url || url.protocol !== "https:" || !/^(?:\/api\/v\d+)?\/map\/position$/.test(url.pathname)) return null;
		return url.hostname === "ts1.x1.europe.travian.com" ? null : root.WWCore.normalizeHost(url.hostname);
	}

	function findCroppers(payload) {
		const matches = new Map();
		function visit(value, depth) {
			if (!value || typeof value !== "object" || depth > 12) return;
			if (Array.isArray(value)) {
				for (const entry of value) visit(entry, depth + 1);
				return;
			}
			if (value.position) {
				const tile = value.tile || value;
				if (typeof tile.title !== "string" || !cropperTitle.test(tile.title)) return;
				const pair = [value.position.x, value.position.y];
				if (!pair.every((n) => Number.isSafeInteger(n) || (typeof n === "string" && /^-?\d+$/.test(n) && Number.isSafeInteger(Number(n))))) return;
				const [x, y] = pair.map(Number);
				matches.set(`${x}|${y}`, { x, y });
				return;
			}
			for (const key of ["tiles", "elements", "data", "response"]) visit(value[key], depth + 1);
		}
		visit(payload, 0);
		return Array.from(matches.values());
	}

	root.WWCroppers = { mapResponseHost, findCroppers };
})(globalThis);
