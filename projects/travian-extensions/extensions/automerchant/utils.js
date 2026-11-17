/**
 * Travian NPC Resource Helper - Utilities & Logger
 *
 * Called by: config.js (NPC namespace), ui.js, observers.js, hero-puller.js
 * No existing file serves the same purpose; this IS utils.js, rewritten to
 * remove setInputValue / setMultipleInputsAsync / getRandomDelay which are
 * dead code after the legacy auto-pull path was removed from hero-puller.js.
 * User instruction: "Fix Phase 1 — fix automerchant (remove automation)".
 */
/* global NPC */

// Console logging, silenced while NPC.CONFIG.STEALTH is on.
const _npcLog = (method, color) => (...args) => {
	if (!NPC.CONFIG.STEALTH) console[method]("%c[NPC Helper]", `color: ${color}`, ...args);
};
NPC.log = { success: _npcLog("log", "#4CAF50"), warn: _npcLog("warn", "#FF9800") };

/** Returns a random integer in [min, max] inclusive. */
NPC._rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

NPC.Utils = {
	parseNumber: (str) => {
		if (!str) return 0;
		return parseInt(String(str).replace(/[^\d-]/g, ""), 10) || 0;
	},

	formatNumber: (num) => num.toLocaleString(),

	/** Returns an inline HTML string for a Travian unit icon sprite. */
	unitIcon: (unitClass) => `<i class="unit ${unitClass}"></i>`,

	/**
	 * Sleep utility for async delays.
	 * @param {number} ms - Milliseconds to sleep
	 * @returns {Promise<void>}
	 */
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

	/**
	 * Returns the four NPC desired input values as an array [lumber, clay, iron, crop].
	 * Missing inputs default to 0.
	 * @returns {number[]}
	 */
	getDesiredValues() {
		return Array.from({ length: 4 }, (_, i) => {
			const input = document.querySelector(`input[name="desired${i}"]`);
			return Math.max(0, NPC.Utils.parseNumber(input?.value));
		});
	},
};
