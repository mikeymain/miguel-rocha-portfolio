// Read the coordinates and layout from the same visible game tooltip.
(() => {
	"use strict";
	const selector = '[role="tooltip"][data-theme="travian"][data-state="visible"]';
	const seen = new Set();
	const coordinate = (el) => {
		const text = el?.textContent.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069()\s]/g, "").replace(/−/g, "-");
		return /^-?\d+$/.test(text) ? Number(text) : NaN;
	};

	function inspect(tooltip) {
		if (!/(?<![\d-])1\s*-\s*1\s*-\s*1\s*-\s*15\s*$/.test(tooltip.querySelector(".title")?.textContent ?? "")) return;
		const pair = tooltip.querySelector(".coordinatesWrapper");
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
			const tooltip = target?.closest(selector);
			if (tooltip) inspect(tooltip);
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
