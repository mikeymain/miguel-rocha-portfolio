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

	async function init() {
		// Remove stale localStorage keys from previous versions
		for (const key of STALE_LS_KEYS) {
			try { localStorage.removeItem(key); } catch {}
		}

		// The marketplace "Resources Needed" panel was removed (3.2.25): drop its data.
		try {
			chrome.storage.local.remove(["_t4na", "_t4ip"]).catch(() => {});
		} catch {}

		// Load the tribe cache before starting observers
		await NPC.loadTribeCache();

		if (/^\/(dorf1\.php|resources)$/.test(location.pathname)) NPC.detectServerType();
		NPC.NPCObserver.start();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
