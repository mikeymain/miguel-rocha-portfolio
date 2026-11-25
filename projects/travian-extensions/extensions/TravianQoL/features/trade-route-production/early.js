// Runs at document_start on the resources page. Hides the production values
// until index.js has written the net figures, so the game's numbers do not
// show first and then change. index.js removes the style when done; it is
// also removed here when the feature is off, no routes are stored for this
// server, or as a fallback after REVEAL_FALLBACK_MS.
(function () {
	if (!/^\/(dorf1\.php|resources)$/.test(location.pathname)) return;
	const STYLE_ID = 'tqol-tr-hide';
	const REVEAL_FALLBACK_MS = 2000;
	const ROUTES_KEY = 'travianQoL.tradeRoutes.' + location.host;
	const ENABLED_KEY = 'travianQoL.enabled';

	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = '#production td.num { visibility: hidden; }';
	document.documentElement.appendChild(style);

	const reveal = () => style.remove();
	setTimeout(reveal, REVEAL_FALLBACK_MS);

	try {
		chrome.storage.sync.get(ENABLED_KEY, (sync) => {
			if (chrome.runtime?.lastError || sync?.[ENABLED_KEY]?.['trade-route-production'] === false) {
				reveal();
				return;
			}
			chrome.storage.local.get(ROUTES_KEY, (local) => {
				const routes = local?.[ROUTES_KEY];
				if (chrome.runtime?.lastError || !routes || !Object.keys(routes).length) reveal();
			});
		});
	} catch (_) {
		reveal();
	}
})();
