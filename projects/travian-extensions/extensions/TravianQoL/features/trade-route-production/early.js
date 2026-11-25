// Runs at document_start on the resources page. Writes the net production
// values as soon as the production table and the village list are parsed,
// so the game's numbers never show first. The values stay hidden until then.
// The hide is dropped when the feature is off, no routes are stored for this
// server, or after REVEAL_FALLBACK_MS.
(function () {
	const core = window.TravianQoLTradeRoutes;
	if (!core || !core.isResourcesPage()) return;
	const REVEAL_FALLBACK_MS = 2000;
	const ENABLED_KEY = 'travianQoL.enabled';

	const style = document.createElement('style');
	style.id = core.HIDE_STYLE_ID;
	style.textContent = '#production td.num { visibility: hidden; }';
	document.documentElement.appendChild(style);

	let observer = null;
	const finish = () => {
		observer?.disconnect();
		observer = null;
		core.reveal();
	};
	const fallback = setTimeout(finish, REVEAL_FALLBACK_MS);
	const done = () => {
		clearTimeout(fallback);
		finish();
	};

	function start(routes) {
		if (core.apply(routes)) return done();
		observer = new MutationObserver(() => {
			if (core.apply(routes)) done();
		});
		observer.observe(document.documentElement, { childList: true, subtree: true });
	}

	try {
		chrome.storage.sync.get(ENABLED_KEY, (sync) => {
			if (chrome.runtime?.lastError || sync?.[ENABLED_KEY]?.['trade-route-production'] === false) {
				done();
				return;
			}
			const key = core.storageKey();
			chrome.storage.local.get(key, (local) => {
				const routes = local?.[key];
				if (chrome.runtime?.lastError || !routes || !Object.keys(routes).length) {
					done();
					return;
				}
				start(routes);
			});
		});
	} catch (_) {
		done();
	}
})();
