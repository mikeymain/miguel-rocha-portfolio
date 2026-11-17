/**
 * Travian NPC Resource Helper - Hero Resource Puller
 *
 * Opens Travian's native in-place hero→village resource transfer dialog
 * pre-filled with the requested amounts via the MAIN-world bridge
 * (hero-bridge.js). Falls back to navigating to /hero/inventory for
 * manual transfer if the native API isn't available on the current page.
 *
 * Called by: ui.js Pull buttons (NPC.HeroPuller.requestPull)
 * Reads/writes: NPC.TransferDialogObserver._lastTarget (in-memory only)
 * No localStorage, no synthetic clicks, no form fills.
 */
/* global NPC */

NPC.HeroPuller = {
	/**
	 * Open the hero → village resource transfer for the requested amounts.
	 *
	 * @param {number[]} amounts - [lumber, clay, iron, crop]
	 * @param {"exact"|"divided"} mode
	 * @param {string} [returnUrl] - ignored (kept for call-site compat)
	 * @param {object} [opts]
	 * @param {number[]} [opts.targetThreshold] - threshold for the native API
	 */
	async requestPull(amounts, mode = "exact", returnUrl = null, opts = {}) {
		const nativeTarget = Array.isArray(opts.targetThreshold)
			? opts.targetThreshold
			: amounts;

		NPC.TransferDialogObserver._lastTarget = {
			target: nativeTarget,
			ts: Date.now(),
		};

		const opened = await this._tryNativeInPlace(nativeTarget);
		if (!opened) {
			window.location.href = "/hero/inventory";
		}
	},

	/**
	 * Ask the MAIN-world bridge to invoke Travian's native in-place transfer
	 * dialog. Returns true if the bridge reports success.
	 */
	_tryNativeInPlace(amounts) {
		return new Promise((resolve) => {
			const requestId =
				"npc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
			let done = false;
			const finish = (ok) => {
				if (done) return;
				done = true;
				document.removeEventListener("npc:hero-transfer-result", onResult);
				resolve(ok);
			};
			const onResult = (e) => {
				if (!e.detail || e.detail.requestId !== requestId) return;
				finish(!!e.detail.ok);
			};
			document.addEventListener("npc:hero-transfer-result", onResult);
			document.dispatchEvent(
				new CustomEvent("npc:open-hero-transfer", {
					detail: { amounts, requestId },
				}),
			);
			setTimeout(() => finish(false), 500);
		});
	},
};
