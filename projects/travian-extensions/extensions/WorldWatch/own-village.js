// Content script: reads your player name and villages from the game sidebar
// and stores them per world for the dashboard. Read-only; no game actions.
(function (root) {
	"use strict";

	const KEY = "wwOwn";

	function cleanNumber(text) {
		const s = String(text || "")
			.replace(/[‎‏‪-‮⁦-⁩]/g, "")
			.replace(/−/g, "-")
			.replace(/[^\d-]/g, "");
		return /^-?\d+$/.test(s) ? Number(s) : NaN;
	}

	// Returns { player, villages: [{ did, name, x, y, active }] } or null.
	function parseOwnVillages(doc) {
		const entries = doc.querySelectorAll("#sidebarBoxVillageList .listEntry");
		const villages = [];
		for (const e of entries) {
			const x = cleanNumber(e.querySelector(".coordinateX")?.textContent);
			const y = cleanNumber(e.querySelector(".coordinateY")?.textContent);
			if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
			villages.push({
				did: Number(e.getAttribute("data-did")) || 0,
				name: (e.querySelector(".name")?.textContent || "").trim(),
				x,
				y,
				active: e.classList.contains("active"),
			});
		}
		if (!villages.length) return null;
		const player = (doc.querySelector(".playerName")?.textContent || "").trim();
		return { player, villages };
	}

	async function save() {
		const own = parseOwnVillages(document);
		if (!own) return;
		const api = root.browser ?? root.chrome;
		const host = location.hostname;
		const data = await api.storage.local.get(KEY);
		const all = data[KEY] || {};
		await api.storage.local.set({ [KEY]: { ...all, [host]: { ...own, seenAt: Date.now() } } });
	}

	root.WWOwn = { parseOwnVillages, cleanNumber };
	if (root.document && root.location && /\.travian\./.test(root.location.hostname)) {
		save().catch(() => {});
	}
})(globalThis);
