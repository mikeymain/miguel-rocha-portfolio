/**
 * Travian NPC Resource Helper v3.2 - Entry Point
 * Loads caches from chrome.storage.local, cleans stale localStorage keys,
 * then starts all observers.
 */
/* global NPC */

(function () {
	"use strict";

	// Stale localStorage keys left by previous versions. Removing them
	// eliminates STO-01 detection (key enumeration) on an already-flagged account.
	const STALE_LS_KEYS = ["_t4vt", "_t4na", "_t4ip", "_t4ap"];

	/** Load tribe id cache from chrome.storage.local into memory. */
	NPC.loadTribeCache = async function () {
		try {
			const res = await chrome.storage.local.get({ _t4vt: null });
			if (res._t4vt) NPC._tribeIdsMemory = res._t4vt;
		} catch {}
	};

	/** Load needed amounts from chrome.storage.local into memory. */
	NPC.loadNeededData = async function () {
		try {
			const key = NPC.STORAGE_KEYS.NEEDED_AMOUNTS;
			const res = await chrome.storage.local.get({ [key]: null });
			if (res[key]) NPC._neededData = res[key];
		} catch {}
	};

	/** Load indicator position from chrome.storage.local into memory. */
	NPC.loadIndicatorPos = async function () {
		try {
			const key = NPC.STORAGE_KEYS.INDICATOR_POS;
			const res = await chrome.storage.local.get({ [key]: null });
			if (res[key]) NPC._indicatorPos = res[key];
		} catch {}
	};

	async function init() {
		// Remove stale localStorage keys from previous versions
		for (const key of STALE_LS_KEYS) {
			try { localStorage.removeItem(key); } catch {}
		}

		// Load all caches before starting observers
		await Promise.all([
			NPC.loadTribeCache(),
			NPC.loadNeededData(),
			NPC.loadIndicatorPos(),
		]);

		if (/^\/(dorf1\.php|resources)$/.test(location.pathname)) NPC.detectServerType();
		NPC.HeroPageObserver.init();
		NPC.NPCObserver.start();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
