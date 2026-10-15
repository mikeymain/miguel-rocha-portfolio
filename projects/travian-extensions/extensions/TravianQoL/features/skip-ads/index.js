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
// The legacy media.oadts.com iframe path still seeks, as before.
//
// Settings are stored in chrome.storage.local under namespaced `skipAds.*`
// keys (not the legacy unprefixed `enabled`/`debug`/etc. names, which
// were too generic to share with other features).
//
// Compliance note: we only mute, move and fast-forward (legacy iframe only)
// the ad video element that the game itself opened after the user clicked
// "Watch video". No game endpoint is called by this feature — the reward
// request is still made by Travian's own player code.
(function () {
	const STORAGE_KEYS = [
		'skipAds.debug',
		'skipAds.minPlaytime',
		'skipAds.videoLookupPollRate',
		'skipAds.videoSkipPollRate',
	];
	const DEFAULTS = {
		'skipAds.debug': false,
		'skipAds.minPlaytime': 0.4,
		'skipAds.videoLookupPollRate': 50,
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
	let skipTimer = null;
	let settings = { ...DEFAULTS };

	function debug() {
		return !!settings['skipAds.debug'];
	}

	function trace(...args) {
		if (debug()) console.log('TravianQoL/skip-ads:', ...args);
	}

	const url = window.location.href;
	const IN_AD_IFRAME =
		window.top !== window.self &&
		url.includes('media.oadts.com') &&
		url.includes('delivery') &&
		url.includes('afv.php');

	// Is there an ad to handle right now? Two O(1) id lookups on game pages.
	function adOpen() {
		if (IN_AD_IFRAME) return !!document.querySelector('video');
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

	// Videos we care about: inside the ad container (main page), or any video
	// at all when we're running inside the legacy ad iframe.
	function adVideos() {
		if (IN_AD_IFRAME) return Array.from(document.querySelectorAll('video'));
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
			// Offer "+ Queue" on the pages the player opens in the frame too.
			frame.addEventListener('load', scheduleDecorate);
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
		if (IN_AD_IFRAME || on === navGuarded) return;
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
		guardNavigation(!!runner);
		renderPill();
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
		renderPill();
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

	// --- Ad queue -------------------------------------------------------------
	// Queue video ads to run one after another, e.g. "construct 25% faster"
	// on the same field twice. A "+ Queue" button sits next to bonus-box ad
	// buttons; while an ad is already playing, clicking a video-ad button queues
	// it instead of starting a second ad. Ad buttons clicked inside the game
	// frame are always queued (their ad would otherwise play full-screen there).
	//
	// Queued ads run in a small "runner" iframe in the bottom-right corner, so
	// the page the player is on is never touched. Before starting an item we
	// fetch its page and check the button is ready (a build's button stays
	// disabled while the build slots are busy, a bonus box until its bonus is
	// used); not-ready items are re-checked every QUEUE_POLL_MS. One Travian
	// tab runs the queue at a time, via a heartbeat lease in storage, and only
	// while it is visible (the player pauses in hidden tabs).
	const QUEUE_KEY = 'skipAds.queue.' + location.host;
	const LEASE_KEY = 'skipAds.queueLease.' + location.host;
	const LEASE_MS = 15000;
	const QUEUE_POLL_MS = 30000;
	const RUNNER_TICK_MS = 500;
	const RUNNER_START_TIMEOUT_MS = 30000;
	// How long the runner waits for a JS-rendered ad button to appear.
	const RUNNER_FIND_MS = 10000;
	const RUNNER_MAX_MS = 10 * 60 * 1000;
	const MAX_FAILS = 3;
	const RUNNER_ID = 'travianqol-skip-ads-runner';
	const PILL_ID = 'travianqol-skip-ads-queue';
	const QUEUE_BTN_CLASS = 'travianqol-skip-ads-queue-btn';
	const TAB_ID = Math.random().toString(36).slice(2);

	function firstLine(el) {
		return ((el.innerText || el.textContent || '').trim().split('\n')[0] || '').replace(/\s+/g, ' ').slice(0, 60);
	}

	// The kinds of video-ad buttons we know how to queue. `key` tells apart
	// several ads on one page (the adventure page has two bonus boxes).
	const AD_SOURCES = [
		{
			kind: 'build',
			sel: '.videoFeatureButton',
			// No "+ Queue" here: it crowds the upgrade buttons. Clicking the
			// button while an ad plays still queues it.
			queueButton: false,
			key: () => '',
			ready: (el) => !el.disabled && !el.classList.contains('disabled'),
			trigger: (el) => el,
			label: (el, doc) => {
				const title = doc.querySelector('h1.titleInHeader');
				return (title ? firstLine(title) + ': ' : '') + firstLine(el);
			},
		},
		{
			kind: 'bonus',
			sel: '.videoFeatureBonusBox',
			key: (el) => [...el.classList].find((c) => !/^(videoFeatureBonusBox|watchReady|bonusReady)$/.test(c)) || '',
			ready: (el) => el.classList.contains('watchReady'),
			trigger: (el) => el.querySelector('button'),
			label: (el) => firstLine(el),
		},
	];
	const AD_SOURCE_SELECTOR = AD_SOURCES.map((s) => s.sel).join(', ');

	function sourceOf(el) {
		return AD_SOURCES.find((s) => el.matches(s.sel));
	}

	function findSource(doc, item) {
		const src = AD_SOURCES.find((s) => s.kind === item.kind);
		if (!src) return null;
		const el = [...doc.querySelectorAll(src.sel)].find((e) => src.key(e) === item.key);
		return el ? { src, el } : null;
	}

	let queue = [];
	let runner = null;
	let pumpTimer = null;
	const decoratedDocs = new WeakSet();

	function saveQueue() {
		chrome.storage.local.set({ [QUEUE_KEY]: queue });
		renderPill();
	}

	function enqueue(doc, el) {
		const src = sourceOf(el);
		if (!src) return;
		const loc = doc.defaultView.location;
		const item = {
			id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
			path: loc.pathname + loc.search,
			kind: src.kind,
			key: src.key(el),
			label: src.label(el, doc) || 'Video ad',
			fails: 0,
		};
		queue.push(item);
		saveQueue();
		trace('queued', item);
		showBanner('done', null, `Queued: ${item.label} (${queue.length} in queue)`);
		kickQueue(1000);
	}

	function dropItem(item, why) {
		queue = queue.filter((q) => q.id !== item.id);
		saveQueue();
		showBanner('closed', null, `Removed from ad queue: ${item.label} (${why})`);
	}

	// Floating "Ad queue (n)" pill with a Clear button.
	function renderPill() {
		let pill = document.getElementById(PILL_ID);
		if (!queue.length) {
			if (pill) pill.remove();
			return;
		}
		if (!pill) {
			pill = document.createElement('div');
			pill.id = PILL_ID;
			pill.style.cssText =
				'position:fixed;right:12px;bottom:12px;z-index:2147482000;display:flex;gap:8px;align-items:center;' +
				'padding:6px 10px;border-radius:6px;background:#4a148c;color:#fff;font:600 12px/1.3 Verdana,Arial,sans-serif;' +
				'box-shadow:0 2px 10px rgba(0,0,0,.4)';
			const text = document.createElement('span');
			const clear = document.createElement('button');
			clear.type = 'button';
			clear.textContent = 'Clear';
			clear.style.cssText = 'font:inherit;border:0;border-radius:4px;padding:2px 8px;cursor:pointer';
			clear.addEventListener('click', () => {
				queue = [];
				saveQueue();
			});
			pill.append(text, clear);
			document.body.appendChild(pill);
		}
		const text = pill.firstChild;
		text.textContent = `Ad queue (${queue.length})${runner ? ' — playing' : ''}`;
		text.title = queue.map((q, i) => `${i + 1}. ${q.label}`).join('\n');
		// Sit above the ad panel (runner frame or parked dialog) while one plays.
		pill.style.bottom = runner || adActive ? '240px' : '12px';
	}

	// "+ Queue" next to video-ad buttons in `doc` (the page itself, or
	// the game frame's page). Inline styles: the frame has no stylesheet of ours.
	function decorate(doc) {
		doc.querySelectorAll(AD_SOURCE_SELECTOR).forEach((el) => {
			const src = sourceOf(el);
			const trigger = src && src.trigger(el);
			if (!trigger || src.queueButton === false || el.dataset.tqolQueue) return;
			el.dataset.tqolQueue = '1';
			const btn = doc.createElement('button');
			btn.type = 'button';
			btn.className = QUEUE_BTN_CLASS;
			btn.textContent = '+ Queue';
			btn.title = 'Run this video ad after the current one (or as soon as it is available)';
			btn.style.cssText =
				'margin:4px;padding:3px 8px;border:0;border-radius:4px;background:#6a1b9a;color:#fff;' +
				'font:600 12px Verdana,Arial,sans-serif;cursor:pointer;vertical-align:middle';
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				enqueue(doc, el);
			});
			trigger.insertAdjacentElement('afterend', btn);
		});
		if (!decoratedDocs.has(doc)) {
			decoratedDocs.add(doc);
			doc.addEventListener('click', (e) => onAdButtonClick(e, doc), true);
		}
	}

	// Capture phase, so this runs before the game's own handlers on the button.
	// A build button that is not ready yet (its class is `disabled` while the
	// builder is busy) is queued too: the game would ignore that click, and
	// the queue waits until the button is ready.
	function onAdButtonClick(e, doc) {
		if (e.target.closest('.' + QUEUE_BTN_CLASS)) return;
		const el = e.target.closest(AD_SOURCE_SELECTOR);
		const src = el && sourceOf(el);
		const trigger = src && src.trigger(el);
		if (!trigger || !trigger.contains(e.target)) return;
		const ready = src.ready(el);
		if (!ready && src.kind !== 'build') return;
		const inGameFrame = doc !== document;
		if (ready && !inGameFrame && !adActive && !runner) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		enqueue(doc, el);
	}

	let decorateTimer = null;
	function scheduleDecorate() {
		if (IN_AD_IFRAME || decorateTimer) return;
		decorateTimer = setTimeout(() => {
			decorateTimer = null;
			decorate(document);
			const frame = gameFrame();
			try {
				if (frame && frame.contentDocument) decorate(frame.contentDocument);
			} catch (e) {}
		}, 200);
	}

	function kickQueue(ms) {
		if (IN_AD_IFRAME) return;
		if (pumpTimer) clearTimeout(pumpTimer);
		pumpTimer = setTimeout(pumpQueue, ms);
	}

	function takeLease(cb) {
		chrome.storage.local.get(LEASE_KEY, (data) => {
			const lease = data[LEASE_KEY];
			const now = Date.now();
			if (lease && lease.owner !== TAB_ID && now - lease.at < LEASE_MS) return cb(false);
			chrome.storage.local.set({ [LEASE_KEY]: { owner: TAB_ID, at: now } });
			cb(true);
		});
	}

	function pumpQueue() {
		pumpTimer = null;
		if (!queue.length) return;
		if (runner || adActive || document.visibilityState !== 'visible') return kickQueue(5000);
		takeLease(async (mine) => {
			if (!mine) return kickQueue(LEASE_MS);
			const item = queue[0];
			let found;
			try {
				const html = await (await fetch(item.path, { credentials: 'include' })).text();
				found = findSource(new DOMParser().parseFromString(html, 'text/html'), item);
			} catch (e) {
				trace('queue check failed', e);
				return kickQueue(QUEUE_POLL_MS);
			}
			// Some pages (the adventure list) render their bonus boxes with
			// JavaScript, so they are missing from the fetched HTML. The runner
			// loads the page for real and checks again once it has rendered.
			if (found && !found.src.ready(found.el)) {
				trace('queued ad not ready yet', item.label);
				return kickQueue(QUEUE_POLL_MS);
			}
			if (runner || adActive) return kickQueue(5000);
			startRunner(item);
		});
	}

	// The runner frame lays the item's page out at 720x480 and shows it at
	// 40%, keeping the ad on screen (the player needs a visible page).
	function startRunner(item) {
		const frame = document.createElement('iframe');
		frame.id = RUNNER_ID;
		frame.title = 'Queued video ad';
		frame.setAttribute('scrolling', 'no');
		frame.style.cssText =
			'position:fixed;right:12px;bottom:12px;width:720px;height:480px;transform:scale(.4);' +
			'transform-origin:bottom right;border:3px solid #6a1b9a;border-radius:6px;z-index:2147481000;background:#000';
		runner = { item, frame, phase: 'loading', startedAt: Date.now(), endedAt: null, leaseAt: Date.now(), timer: null };
		frame.addEventListener('load', onRunnerLoad);
		frame.src = item.path;
		document.body.appendChild(frame);
		guardNavigation(true);
		renderPill();
		runner.timer = setInterval(runnerTick, RUNNER_TICK_MS);
		trace('running queued ad', item.label);
	}

	// The preview is small; hide the page's scrollbars (layout is unchanged).
	const RUNNER_CSS =
		'html, body, * { scrollbar-width: none !important; } ::-webkit-scrollbar { display: none !important; }';

	function onRunnerLoad() {
		try {
			const doc = runner && runner.frame.contentDocument;
			if (doc) {
				const style = doc.createElement('style');
				style.textContent = RUNNER_CSS;
				(doc.head || doc.documentElement).appendChild(style);
			}
		} catch (e) {}
		if (runner && runner.phase === 'loading') {
			runner.phase = 'finding';
			runner.startedAt = Date.now();
		}
		runnerFind();
	}

	// Wait for the item's button to render in the runner, then start the ad.
	function runnerFind() {
		if (!runner || runner.phase !== 'finding') return;
		let found = null;
		try {
			found = findSource(runner.frame.contentDocument, runner.item);
		} catch (e) {}
		if (!found) {
			if (Date.now() - runner.startedAt > RUNNER_FIND_MS) endRunner('missing');
			return;
		}
		if (!found.src.ready(found.el)) return endRunner('notready');
		runner.phase = 'starting';
		runner.startedAt = Date.now();
		found.src.trigger(found.el).click();
	}

	function runnerTick() {
		if (!runner) return;
		const now = Date.now();
		if (now - runner.leaseAt > LEASE_MS / 3) {
			runner.leaseAt = now;
			chrome.storage.local.set({ [LEASE_KEY]: { owner: TAB_ID, at: now } });
		}
		if (runner.phase === 'loading') {
			if (now - runner.startedAt > RUNNER_START_TIMEOUT_MS) endRunner('failed');
			return;
		}
		if (runner.phase === 'finding') return runnerFind();
		let doc = null;
		try {
			doc = runner.frame.contentDocument;
		} catch (e) {}
		const video = doc && doc.querySelector('#videoFeature video, #videoArea video');
		if (video) muteEl(video);
		if (runner.phase === 'starting') {
			if (video) runner.phase = 'playing';
			else if (now - runner.startedAt > RUNNER_START_TIMEOUT_MS) endRunner('failed');
			return;
		}
		// Playing. Done once the video sits at its end for DONE_SETTLE_MS (a
		// rejected watch replays), or disappears after reaching the end.
		if (video && (video.ended || atEnd(video))) {
			if (!runner.endedAt) runner.endedAt = now;
			else if (now - runner.endedAt >= DONE_SETTLE_MS) endRunner('done');
		} else if (video) {
			runner.endedAt = null;
		} else {
			endRunner(runner.endedAt ? 'done' : 'closed');
			return;
		}
		if (runner && now - runner.startedAt > RUNNER_MAX_MS) endRunner('failed');
	}

	function endRunner(result) {
		if (!runner) return;
		const { item, frame, timer } = runner;
		clearInterval(timer);
		frame.remove();
		runner = null;
		guardNavigation(adActive);
		trace('queued ad', result, item.label);
		if (result === 'done') {
			queue = queue.filter((q) => q.id !== item.id);
			saveQueue();
			showBanner('done', null, `✓ Queued ad finished: ${item.label}` + (queue.length ? ` — ${queue.length} left` : ''));
		} else if (result === 'missing') {
			dropItem(item, 'no longer offered');
		} else if (result === 'notready') {
			return kickQueue(QUEUE_POLL_MS);
		} else {
			const current = queue.find((q) => q.id === item.id);
			if (current) {
				current.fails = (current.fails || 0) + 1;
				if (current.fails >= MAX_FAILS) dropItem(current, 'failed ' + MAX_FAILS + ' times');
				else saveQueue();
			}
			if (result === 'closed') showBanner('closed', null, `Queued ad closed early: ${item.label}`);
		}
		kickQueue(3000);
	}

	function startQueue() {
		if (IN_AD_IFRAME) return;
		chrome.storage.local.get(QUEUE_KEY, (data) => {
			queue = Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY] : [];
			renderPill();
			kickQueue(1000);
		});
		chrome.storage.onChanged.addListener(onStorageChanged);
		document.addEventListener('visibilitychange', onVisibilityChange);
		scheduleDecorate();
	}

	// Another tab added to or cleared the queue.
	function onStorageChanged(changes, area) {
		if (area !== 'local' || !changes[QUEUE_KEY]) return;
		queue = changes[QUEUE_KEY].newValue || [];
		renderPill();
		kickQueue(1000);
	}

	function onVisibilityChange() {
		if (document.visibilityState === 'visible') kickQueue(1000);
	}

	function stopQueue() {
		if (pumpTimer) clearTimeout(pumpTimer);
		pumpTimer = null;
		if (decorateTimer) clearTimeout(decorateTimer);
		decorateTimer = null;
		if (runner) {
			clearInterval(runner.timer);
			runner.frame.remove();
			runner = null;
		}
		chrome.storage.onChanged.removeListener && chrome.storage.onChanged.removeListener(onStorageChanged);
		document.removeEventListener('visibilitychange', onVisibilityChange);
		const pill = document.getElementById(PILL_ID);
		if (pill) pill.remove();
	}

	function skipCycle() {
		const videos = adVideos();
		const open = adOpen();
		if (!IN_AD_IFRAME) {
			// The in-page fallback player punishes seeking (see header), so
			// just keep it muted and let it play out.
			videos.forEach((v) => {
				muteEl(v);
				watchVideo(v);
			});
			if (!open) onAdClosed();
			skipTimer = open ? setTimeout(skipCycle, settings['skipAds.videoSkipPollRate']) : null;
			return;
		}
		for (const video of videos) {
			muteEl(video);
			const src = video.currentSrc || video.src || '';
			if (src.includes('blank.mp4')) {
				trace('blank video, not skipping');
				continue;
			}
			if (!isNumber(video.duration) || !isNumber(video.currentTime)) {
				trace('duration/currentTime not ready', video.duration, video.currentTime);
				continue;
			}
			if (video.currentTime >= video.duration) {
				trace('already at end');
				continue;
			}
			if (video.currentTime <= settings['skipAds.minPlaytime']) {
				trace('too soon to skip', video.currentTime);
				continue;
			}
			trace('skipping to end', video.duration);
			// Seeking past the end makes the player emit `ended`, which is what
			// its reward handler is waiting for.
			video.currentTime = video.duration + 1;
		}
		// Keep polling only while the ad is up; the observer restarts it.
		skipTimer = open ? setTimeout(skipCycle, settings['skipAds.videoSkipPollRate']) : null;
	}

	// On every DOM change: if the ad is open, mute its videos at once (before
	// they can play a frame of audio — the poll is too slow for that alone)
	// and make sure the skip poll is running. Otherwise nothing runs.
	function check() {
		scheduleDecorate();
		if (!adOpen()) return;
		if (!IN_AD_IFRAME && !adActive && adElement() !== finishedAdEl) onAdOpened();
		adVideos().forEach((v) => {
			muteEl(v);
			if (!IN_AD_IFRAME) watchVideo(v);
		});
		if (!skipTimer) skipCycle();
	}

	function startWatching() {
		observer = new MutationObserver(check);
		observer.observe(document.documentElement, { childList: true, subtree: true });
		if (!IN_AD_IFRAME && !adOpen()) showCarriedDone();
		startQueue();
		check();
	}

	window.TravianQoL.register({
		id: 'skip-ads',
		label: 'Skip builder-bonus ads',
		description:
			'Mutes Travian video-feature ads (adventure bonus, builder bonus, daily quest), moves them to a corner so you can keep playing, and tells you when they finish. Originally by DUDSS. Settings live in the "Skip Ads" tab.',
		init() {
			chrome.storage.local.get(STORAGE_KEYS, (data) => {
				settings = { ...DEFAULTS, ...data };
				startWatching();
			});
		},
		destroy() {
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
			stopQueue();
			guardNavigation(false);
			removeBanner();
			const style = document.getElementById(STYLE_ID);
			if (style) style.remove();
		},
	});
})();
