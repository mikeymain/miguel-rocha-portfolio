// Read coordinates and layout from a game tooltip or the opened tile details.
(() => {
	"use strict";
	const selector = '#tileDetails, [role="tooltip"][data-theme="travian"][data-state="visible"]';
	const cropperLayout = ["1", "1", "1", "15"];
	const seen = new Set();
	const coordinate = (el) => {
		const text = el?.textContent.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069()\s]/g, "").replace(/−/g, "-");
		return /^-?\d+$/.test(text) ? Number(text) : NaN;
	};

	function inspect(tile) {
		let pair;
		if (tile.id === "tileDetails") {
			const rows = [...tile.querySelectorAll("#distribution tr")];
			if (rows.length !== 4 || !cropperLayout.every((count, i) => rows.some((row) =>
				row.querySelector(`.ico .r${i + 1}`) && row.querySelector(".val")?.textContent.trim() === count))) return;
			pair = tile.querySelector("h1 .coordinatesWrapper");
		} else {
			if (!/(?<![\d-])1\s*-\s*1\s*-\s*1\s*-\s*15\s*$/.test(tile.querySelector(".title")?.textContent ?? "")) return;
			pair = tile.querySelector(".coordinatesWrapper");
		}
		const x = coordinate(pair?.querySelector(".coordinateX"));
		const y = coordinate(pair?.querySelector(".coordinateY"));
		if (![x, y].every(Number.isSafeInteger)) return;
		const id = `${x}|${y}`;
		if (seen.has(id)) return;
		seen.add(id);
		chrome.runtime.sendMessage({ type: "ww-cropper", x, y }).then((result) => {
			if (!result?.ok) seen.delete(id);
		}).catch(() => seen.delete(id));
	}

	const observer = new MutationObserver((records) => {
		for (const record of records) {
			const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
			const tile = target?.closest(selector);
			if (tile) inspect(tile);
			for (const node of record.addedNodes) {
				if (node.nodeType !== 1) continue;
				if (node.matches(selector)) inspect(node);
				for (const box of node.querySelectorAll(selector)) inspect(box);
			}
		}
	});
	observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-state"] });
	for (const tooltip of document.querySelectorAll(selector)) inspect(tooltip);
})();
