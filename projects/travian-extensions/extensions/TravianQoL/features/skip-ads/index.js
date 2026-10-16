// Skip Ads (ex-TravianSkipAds, by DUDSS).
//
// 2026-08 update: Travian moved the video-feature player. It used to be a
// third-party ad iframe (media.oadts.com/.../afv.php) that we had to reach
// into; today gpack main.js loads https://video.traviangames.com/v1/video.js
// into the MAIN page and calls
//   Traviangames.video.playInPageAd({ htmlVideoDivId: 'videoArea' })
// which renders the <video> straight into `#videoArea` inside the
// `#videoFeature` dialog. The SDK's fallback player listens for the video's
// own `ended` event, then POSTs /fallback/v1/reward and fires onRewarded,
// which Travian turns into `videofeature/ends`.
//
// 2026-10 update: the fallback player now tracks real watched time (capped
// at 1x) and pauses while its tab is hidden. On `ended` it rejects
// playbackRate > 1 or watched time short of the duration: it flashes the
// video grey, resets and replays it. Seeking to the end therefore loops
// forever and never rewards, so on the main page we no longer seek.
// Instead, for every video-feature ad (adventure, builder, daily quest...):
//   - mute it and park its dialog in the bottom-right corner, dropping the
//     full-screen overlay so the page stays clickable;
//   - keep the ad's page alive: Travian pages are full page loads and a new
//     tab would hide (and so pause) the ad, so links and forms open in a
//     same-origin "game frame" laid over the page instead;
//   - announce when the ad has finished, with a button back to the game.
// The ad always plays at normal speed: nothing seeks or skips it. 1.2.0
// removed the legacy media.oadts.com path, which seeked to the end, and the
// ad queue, which started queued ads later without a click.
//
// Settings are stored in chrome.storage.local under namespaced `skipAds.*`
// keys (not the legacy unprefixed `enabled`/`debug`/etc. names, which
// were too generic to share with other features).
//
// Compliance note: we only mute and move the ad video element that the game
// itself opened after the user clicked "Watch video". No game endpoint is
// called by this feature — the reward request is still made by Travian's
// own player code.
(function () {
	const STORAGE_KEYS = [
		'skipAds.debug',
		'skipAds.videoSkipPollRate',
	];
	const DEFAULTS = {
		'skipAds.debug': false,
		'skipAds.videoSkipPollRate': 300,
	};

	// Where the in-page player renders. `#videoArea` is the div id main.js
	// hands to playInPageAd(); the dialog around it is `#videoFeature`.
	const AD_CONTAINER_SELECTOR = '#videoArea, #videoFeature';
	const AD_DIALOG_SELECTOR = '.videoFeatureVideoDialog, #videoFeature, #videoArea';

	// How long after `ended` the video must stay ended before we call the ad
	// done. A rejected watch flashes grey and replays within about a second.
	const DONE_SETTLE_MS = 2500;
	// A reload this soon after the ad finished still shows the done banner
	// (Travian may reload the page itself once the bonus is granted).
	const DONE_CARRY_MS = 60 * 1000;
	const DONE_SESSION_KEY = 'travianQoL.skipAds.done';

	let observer = null;
	// The capture-phase click listener stays on decorated documents; this flag
	// makes it inert while the feature is toggled off.
	let featureOn = false;
	let skipTimer = null;
	let settings = { ...DEFAULTS };

	function debug() {
		return !!settings['skipAds.debug'];
	}

	function trace(...args) {
		if (debug()) console.log('TravianQoL/skip-ads:', ...args);
	}

	// Is there an ad to handle right now? Two O(1) id lookups on game pages.
	function adOpen() {
		return !!adElement();
	}

	// The current ad's container; a new ad means a new element.
	function adElement() {
		return document.getElementById('videoFeature') || document.getElementById('videoArea');
	}

	function muteEl(v) {
		v.muted = true;
		v.volume = 0;
	}

	// Videos inside the ad container.
	function adVideos() {
		const containers = document.querySelectorAll(AD_CONTAINER_SELECTOR);
		const out = [];
		containers.forEach((c) => c.querySelectorAll('video').forEach((v) => out.push(v)));
		return out;
	}

	function isNumber(n) {
		return typeof n === 'number' && !isNaN(n) && isFinite(n);
	}

	function atEnd(v) {
		return isNumber(v.duration) && v.duration > 0 && v.duration - v.currentTime <= 0.5;
	}

	// --- Corner panel ------------------------------------------------------
	// Park the ad dialog in the bottom-right corner, drop the full-screen
	// overlay's backdrop and let clicks fall through. Scoped with :has() so
	// other dialogs are untouched. z-order: game frame < ad panel < banner.
	const STYLE_ID = 'travianqol-skip-ads-minimize';
	const FRAME_ID = 'travianqol-skip-ads-frame';
	const BANNER_ID = 'travianqol-skip-ads-banner';
	const STYLE_CSS = `
#reactDialogWrapper:has(${AD_DIALOG_SELECTOR}),
#dialogOverlay:has(${AD_DIALOG_SELECTOR}) {
	pointer-events: none !important;
	background: transparent !important;
	width: 0 !important;
	height: 0 !important;
}
#dialogOverlay:has(${AD_DIALOG_SELECTOR}) .dialogWrapper {
	position: fixed !important;
	top: auto !important;
	left: auto !important;
	right: 12px !important;
	bottom: 12px !important;
	transform: scale(0.35) !important;
	transform-origin: bottom right !important;
	pointer-events: auto !important;
	opacity: 0.85;
}
#${FRAME_ID} {
	position: fixed;
	inset: 0;
	width: 100vw;
	height: 100vh;
	border: 0;
	z-index: 1400;
	background: #000;
}
#${BANNER_ID} {
	position: fixed;
	top: 12px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 2147483000;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 14px;
	border-radius: 6px;
	font: 600 14px/1.3 Verdana, Arial, sans-serif;
	color: #fff;
	background: #2e7d32;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
}
#${BANNER_ID}[data-kind="closed"] { background: #6d4c41; }
#${BANNER_ID} button {
	font: inherit;
	cursor: pointer;
	border: 0;
	border-radius: 4px;
	padding: 4px 10px;
	color: #1b1b1b;
	background: #fff;
}`;

	function ensureStyle() {
		if (document.getElementById(STYLE_ID)) return;
		const style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = STYLE_CSS;
		(document.head || document.documentElement).appendChild(style);
	}

	// --- Game frame ----------------------------------------------------------
	// Travian serves its pages with `frame-ancestors 'self'`, so the game can
	// run in a same-origin iframe over the ad's page. The ad tab stays visible
	// (so the player keeps counting) while the player keeps playing.
	function gameFrame() {
		return document.getElementById(FRAME_ID);
	}

	function ensureGameFrame() {
		let frame = gameFrame();
		if (!frame) {
			ensureStyle();
			frame = document.createElement('iframe');
			frame.id = FRAME_ID;
			frame.name = FRAME_ID;
			document.body.appendChild(frame);
		}
		return frame;
	}

	// Where the player is right now: the frame's page if they used it.
	function gameUrl() {
		const frame = gameFrame();
		try {
			const href = frame && frame.contentWindow.location.href;
			if (href && href !== 'about:blank') return href;
		} catch (e) {
			// Cross-origin page in the frame; fall back to the frame's src.
			if (frame && frame.src) return frame.src;
		}
		return null;
	}

	// --- Navigation guard ---------------------------------------------------
	// While the ad plays, any top-level navigation would unload the player and
	// lose the ad. Runs on window in the bubble phase so the game's own
	// handlers (AJAX dialogs etc.) go first; we only act on clicks/submits
	// they left to the browser. Script-driven navigation can't be caught that
	// way, so beforeunload asks before leaving as a last resort.
	let navGuarded = false;
	let unloadGuarded = false;

	function inAdDialog(el) {
		return !!(el && el.closest && el.closest(AD_DIALOG_SELECTOR));
	}

	function onGuardedClick(e) {
		if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
		const a = e.target.closest && e.target.closest('a[href]');
		if (!a || inAdDialog(a) || (a.target && a.target !== '_self')) return;
		const href = a.getAttribute('href');
		if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
		e.preventDefault();
		trace('ad playing, opening link in game frame', a.href);
		ensureGameFrame().src = a.href;
	}

	function onGuardedSubmit(e) {
		const form = e.target;
		if (e.defaultPrevented || inAdDialog(form) || (form.target && form.target !== '_self')) return;
		trace('ad playing, submitting form into game frame');
		ensureGameFrame();
		const prev = form.getAttribute('target');
		form.target = FRAME_ID;
		setTimeout(() => (prev === null ? form.removeAttribute('target') : form.setAttribute('target', prev)), 0);
	}

	function onGuardedUnload(e) {
		e.preventDefault();
		e.returnValue = '';
	}

	function guardUnload(on) {
		if (on === unloadGuarded) return;
		unloadGuarded = on;
		window[on ? 'addEventListener' : 'removeEventListener']('beforeunload', onGuardedUnload);
	}

	function guardNavigation(on) {
		if (on === navGuarded) return;
		navGuarded = on;
		const method = on ? 'addEventListener' : 'removeEventListener';
		window[method]('click', onGuardedClick);
		window[method]('submit', onGuardedSubmit);
		guardUnload(on);
	}

	// --- Done notice --------------------------------------------------------
	const ORIGINAL_TITLE = document.title;
	let titleTimer = null;

	function flashTitle(text) {
		stopTitleFlash();
		let on = false;
		titleTimer = setInterval(() => {
			on = !on;
			document.title = on ? text : ORIGINAL_TITLE;
		}, 1000);
		document.title = text;
	}

	function stopTitleFlash() {
		if (titleTimer) clearInterval(titleTimer);
		titleTimer = null;
		document.title = ORIGINAL_TITLE;
	}

	function removeBanner() {
		const banner = document.getElementById(BANNER_ID);
		if (banner) banner.remove();
		stopTitleFlash();
	}

	// Back to normal: if the player moved on inside the game frame, take the
	// whole tab there; otherwise just drop the frame.
	function backToGame(target) {
		removeBanner();
		const next = target || gameUrl();
		const frame = gameFrame();
		if (frame) frame.remove();
		if (next && next !== location.href) location.href = next;
	}

	function showBanner(kind, target, message) {
		ensureStyle();
		removeBanner();
		const banner = document.createElement('div');
		banner.id = BANNER_ID;
		banner.dataset.kind = kind;
		banner.setAttribute('role', 'status');
		const text = document.createElement('span');
		text.textContent =
			message || (kind === 'done' ? '✓ Ad finished — bonus should be applied.' : 'Ad closed before it finished.');
		// Nothing to go back to (no game frame, no target): just dismiss, and
		// fade out on its own.
		const canGoBack = !!(gameFrame() || target);
		const back = document.createElement('button');
		back.type = 'button';
		back.textContent = canGoBack ? 'Back to game' : 'Dismiss';
		back.addEventListener('click', () => (canGoBack ? backToGame(target) : removeBanner()));
		banner.append(text, back);
		document.body.appendChild(banner);
		flashTitle(kind === 'done' ? '✓ Ad done' : 'Ad closed');
		if (!canGoBack) setTimeout(removeBanner, 8000);
	}

	// --- Ad lifecycle (main page) --------------------------------------------
	let adActive = false;
	let adDone = false;
	// The finished ad's dialog can linger after the reward; don't take it for
	// a new ad.
	let finishedAdEl = null;
	let settleTimer = null;
	const watchedVideos = new WeakSet();

	function finishAd(kind) {
		if (!adActive) return;
		adActive = false;
		finishedAdEl = adElement();
		if (settleTimer) clearTimeout(settleTimer);
		settleTimer = null;
		guardNavigation(false);
		trace('ad', kind);
		if (kind === 'done') {
			try {
				sessionStorage.setItem(DONE_SESSION_KEY, JSON.stringify({ at: Date.now(), url: gameUrl() }));
			} catch (e) {}
		}
		showBanner(kind);
	}

	function watchVideo(v) {
		if (watchedVideos.has(v)) return;
		watchedVideos.add(v);
		v.addEventListener('ended', () => {
			// Travian may reload/close once the reward lands; don't block it.
			guardUnload(false);
			if (settleTimer) clearTimeout(settleTimer);
			settleTimer = setTimeout(() => {
				settleTimer = null;
				// Gone, or still at the end: accepted (a rejected watch replays).
				if (!v.isConnected || v.ended || atEnd(v)) {
					adDone = true;
					finishAd('done');
				}
			}, DONE_SETTLE_MS);
		});
		v.addEventListener('play', () => {
			// Replayed after a rejected watch: guard again.
			if (adActive) guardUnload(true);
		});
	}

	function onAdOpened() {
		adActive = true;
		adDone = false;
		removeBanner();
		try {
			sessionStorage.removeItem(DONE_SESSION_KEY);
		} catch (e) {}
		ensureStyle();
		guardNavigation(true);
	}

	function onAdClosed() {
		if (!adActive) return;
		finishAd(adDone ? 'done' : 'closed');
	}

	// A reload right after the ad finished (Travian's own, or "Back to game")
	// still gets the notice.
	function showCarriedDone() {
		let saved = null;
		try {
			saved = JSON.parse(sessionStorage.getItem(DONE_SESSION_KEY) || 'null');
			sessionStorage.removeItem(DONE_SESSION_KEY);
		} catch (e) {}
		if (!saved || Date.now() - saved.at > DONE_CARRY_MS) return;
		const target = saved.url && saved.url !== location.href ? saved.url : null;
		showBanner('done', target);
	}

	// The in-page player punishes seeking (see header), so the ad is kept
	// muted and plays out at normal speed. Polls only while the ad is up.
	function skipCycle() {
		const open = adOpen();
		adVideos().forEach((v) => {
			muteEl(v);
			watchVideo(v);
		});
		if (!open) onAdClosed();
		// Clamped: a 0 or negative setting would otherwise spin a tight loop.
		const pollMs = Math.max(100, Number(settings['skipAds.videoSkipPollRate']) || DEFAULTS['skipAds.videoSkipPollRate']);
		skipTimer = open ? setTimeout(skipCycle, pollMs) : null;
	}

	// On every DOM change: if the ad is open, mute its videos at once (before
	// they can play a frame of audio — the poll is too slow for that alone)
	// and make sure the poll is running. Otherwise nothing runs.
	function check() {
		if (!adOpen()) return;
		if (!adActive && adElement() !== finishedAdEl) onAdOpened();
		adVideos().forEach((v) => {
			muteEl(v);
			watchVideo(v);
		});
		if (!skipTimer) skipCycle();
	}

	function startWatching() {
		observer = new MutationObserver(check);
		observer.observe(document.documentElement, { childList: true, subtree: true });
		if (!adOpen()) showCarriedDone();
		check();
	}

	window.TravianQoL.register({
		id: 'skip-ads',
		label: 'Skip builder-bonus ads',
		description:
			'Mutes Travian video-feature ads (adventure bonus, builder bonus, daily quest), moves them to a corner so you can keep playing, and tells you when they finish. Originally by DUDSS. Settings live in the "Skip Ads" tab.',
		init() {
			featureOn = true;
			// The ad queue was removed in 1.2.0; drop anything it left behind.
			chrome.storage.local.remove?.(['skipAds.queue.' + location.host, 'skipAds.queueLease.' + location.host]);
			chrome.storage.local.get(STORAGE_KEYS, (data) => {
				if (!featureOn) return; // toggled off before settings arrived
				settings = { ...DEFAULTS, ...data };
				startWatching();
			});
		},
		destroy() {
			featureOn = false;
			if (observer) {
				observer.disconnect();
				observer = null;
			}
			if (skipTimer) {
				clearTimeout(skipTimer);
				skipTimer = null;
			}
			if (settleTimer) {
				clearTimeout(settleTimer);
				settleTimer = null;
			}
			adActive = false;
			guardNavigation(false);
			removeBanner();
			const style = document.getElementById(STYLE_ID);
			if (style) style.remove();
		},
	});
})();
