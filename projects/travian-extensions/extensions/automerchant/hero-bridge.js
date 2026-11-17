// Runs in the page's MAIN world (configured via manifest content_scripts.world).
// Bridges the isolated-world content script into Travian's own in-place
// "send hero resources" dialog.
//
// Wire protocol:
//   • Isolated-world content script dispatches on `document`:
//       new CustomEvent('npc:open-hero-transfer', {
//         detail: { amounts: [l, c, i, cr], requestId }
//       })
//   • We respond on `document` with:
//       new CustomEvent('npc:hero-transfer-result', {
//         detail: { requestId, ok, reason }
//       })

(function () {
	// Native building cost dialogs also supply the exact resource targets.
	function captureTransferTargets() {
		const hero = window.Travian?.React?.Hero;
		const open = hero?.openResourceTransfer;
		if (typeof open !== 'function') return false;
		hero.openResourceTransfer = function (...args) {
			const target = args[0]?.targetResourceAmount;
			document.dispatchEvent(new CustomEvent('npc:transfer-target', {
				detail: target ? [target.lumber, target.clay, target.iron, target.crop] : null,
			}));
			return open.apply(this, args);
		};
		return true;
	}

	if (!captureTransferTargets()) {
		let attempts = 0;
		const timer = setInterval(() => {
			if (captureTransferTargets() || ++attempts >= 40) clearInterval(timer);
		}, 250);
	}

	document.addEventListener('npc:open-hero-transfer', (e) => {
		const detail = e.detail || {};
		const amounts = Array.isArray(detail.amounts) ? detail.amounts : [0, 0, 0, 0];
		const [lumber, clay, iron, crop] = amounts.map(
			(v) => Math.max(0, parseInt(v, 10) || 0),
		);
		const requestId = detail.requestId;

		const reply = (ok, reason) => {
			document.dispatchEvent(
				new CustomEvent('npc:hero-transfer-result', {
					detail: { requestId, ok, reason: reason || null },
				}),
			);
		};

		const hero = window.Travian?.React?.Hero;
		const fn = hero?.openResourceTransfer;

		if (typeof fn !== 'function') {
			reply(false, 'openResourceTransfer-unavailable');
			return;
		}

		try {
			const onFinish = (window.Travian
				&& window.Travian.Autoreload
				&& window.Travian.Autoreload.autoreload)
				|| function () {};
			fn.call(hero, {
				targetResourceAmount: { lumber, clay, iron, crop },
				onTransferFinish: onFinish,
			});

			const wrapper = document.getElementById('reactDialogWrapper');
			if (wrapper) wrapper.style.zIndex = '99999';

			reply(true, null);
		} catch (err) {
			reply(false, String((err && err.message) || err));
		}
	});
})();
