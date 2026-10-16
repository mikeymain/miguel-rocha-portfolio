/** Read the page the player opened and relay its CP measurements. */
"use strict";
(() => {
	const { api, parsePage, serverOrigin } = TSP;
	const origin = serverOrigin(window.location.href);
	if (!origin) return;
	let observedAt = Math.min(Date.now(), performance.timeOrigin || Date.now());
	let measurementSignature = null;

	// CP data only lives in the #culture_points table and in inline scripts that
	// embed culturalPointsOverview / culturePointsRank. Hand parsePage just those
	// instead of serializing the whole document on every page load.
	function cpSource() {
		const parts = [];
		const table = document.getElementById("culture_points");
		if (table) parts.push(table.outerHTML);
		for (const script of document.scripts) {
			if (script.src) continue;
			const code = script.textContent;
			if (
				code.includes("culturalPointsOverview") ||
				code.includes("culturePointsRank")
			)
				parts.push(`<script>${code}</script>`);
		}
		return parts.join("");
	}

	async function scanPage() {
		const html = cpSource();
		const scan = html && parsePage(html, origin, Date.now());
		if (!scan?.hasData) return { success: false, origin, freshCp: false };
		const signature = JSON.stringify([
			scan.totalCp,
			scan.actualDailyCp,
			scan.passiveAccel,
		]);
		if (measurementSignature !== null && measurementSignature !== signature)
			observedAt = Date.now();
		measurementSignature = signature;
		// Embedded JSON remains frozen until navigation/AJAX replaces it. Reading
		// it again is not a fresh measurement; the live timer has its own clock.
		scan.observedAt = observedAt;
		const response = await api.runtime.sendMessage({
			action: "SAVE_SCAN",
			url: origin,
			scan,
		});
		return {
			success: !!response?.success,
			origin,
			freshCp:
				Number.isFinite(scan.totalCp) && Date.now() - observedAt < 300000,
		};
	}
	api.runtime.onMessage.addListener((request, _sender, respond) => {
		if (request?.action === "RESCAN") {
			scanPage().then(respond, () =>
				respond({ success: false, origin, freshCp: false }),
			);
			return true;
		}
	});
	async function initialize() {
		try {
			await scanPage();
		} catch (error) {
			warnUnexpected(error);
		}
	}
	// A reloaded extension leaves this tab orphaned; that is expected and quiet.
	// Anything else (e.g. Travian changed its markup) should leave a trace.
	function warnUnexpected(error) {
		if (!/context invalidated/i.test(error?.message || ""))
			console.warn("Next Settlement Calc:", error);
	}
	if (document.readyState === "loading")
		document.addEventListener("DOMContentLoaded", initialize, { once: true });
	else initialize();
	// Travian swaps the CP tab contents via AJAX; give it time to land.
	const RESCAN_DELAY_MS = 700;
	let rescanTimer;
	document.addEventListener("click", (event) => {
		if (
			event.target?.closest?.(
				".legendTabs .tab, .dataSwitchButtons .iconButton",
			)
		) {
			clearTimeout(rescanTimer);
			rescanTimer = setTimeout(() => scanPage().catch(warnUnexpected), RESCAN_DELAY_MS);
		}
	});
	window.addEventListener("pagehide", () => clearTimeout(rescanTimer));
})();
