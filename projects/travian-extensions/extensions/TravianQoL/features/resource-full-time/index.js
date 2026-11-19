// Resource full-at clock time.
// The stock-bar tooltips ("Full in: 3:54:46" / "Empty in: ...") show a
// countdown that Travian renders once, at page load. This feature appends the
// matching clock time, e.g. "Full in: 3:54:46 (at 18:42)".
//
// Tooltips are tippy.js popups. When one opens, tippy sets aria-describedby
// on the hovered stock-bar button, pointing at the popup's id. We watch that
// attribute and annotate the popup text.
//
// Compliance note: read-only DOM work on our own tooltip text. No clicks,
// no network calls.
(function () {
	const MARK_CLASS = 'tqol-full-at';
	const DURATION_RE = /(\d+):(\d{2}):(\d{2})/;

	let observer = null;
	// Travian re-renders open tooltips, which drops our span; this watches the
	// open popup and re-annotates it.
	let popupObserver = null;
	// Set once the countdown is seen counting down live; the clock is then
	// relative to now rather than to page load.
	let ticking = false;
	let lastSample = null;

	function formatClock(date) {
		const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
		const now = new Date();
		if (date.toDateString() === now.toDateString()) return time;
		const tomorrow = new Date(now);
		tomorrow.setDate(now.getDate() + 1);
		if (date.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
		return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
	}

	// A static countdown is relative to page load; a live one to now.
	function clockFor(textNode, key) {
		const m = textNode.nodeValue.match(DURATION_RE);
		if (!m) return null;
		const seconds = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
		const now = Date.now();
		if (lastSample && lastSample.key === key && lastSample.seconds !== seconds) {
			const elapsed = (now - lastSample.at) / 1000;
			if (Math.abs(lastSample.seconds - seconds - elapsed) < 3) ticking = true;
		}
		if (!lastSample || lastSample.key !== key || lastSample.seconds !== seconds) {
			lastSample = { key, seconds, at: now };
		}
		const base = ticking ? now : performance.timeOrigin;
		return formatClock(new Date(base + seconds * 1000));
	}

	function annotate(popup, key) {
		const box = popup.querySelector('.tippy-content');
		if (!box) return;
		const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (node.parentNode.classList?.contains(MARK_CLASS)) continue;
			const clock = clockFor(node, key);
			if (!clock) continue;
			const text = ` (at ${clock})`;
			const next = node.nextSibling;
			const span = next?.classList?.contains(MARK_CLASS) ? next : document.createElement('span');
			box.querySelectorAll(`.${MARK_CLASS}`).forEach((el) => el !== span && el.remove());
			if (span.textContent !== text) span.textContent = text;
			if (span !== next) {
				span.className = MARK_CLASS;
				node.parentNode.insertBefore(span, next);
			}
			return;
		}
	}

	function watchPopup(popup, key) {
		popupObserver?.disconnect();
		popupObserver = new MutationObserver(() => {
			if (!popup.isConnected) {
				popupObserver?.disconnect();
				popupObserver = null;
				return;
			}
			annotate(popup, key);
		});
		popupObserver.observe(popup, { childList: true, subtree: true, characterData: true });
	}

	function handleButton(button) {
		const id = button.getAttribute('aria-describedby');
		if (!id) {
			popupObserver?.disconnect();
			popupObserver = null;
			return;
		}
		const key = button.closest('.warehouse, .granary')?.className || id;
		// Tippy fills the popup content right after setting the attribute.
		requestAnimationFrame(() => {
			const popup = document.getElementById(id);
			if (!popup) return;
			annotate(popup, key);
			watchPopup(popup, key);
		});
	}

	function start() {
		const bar = document.getElementById('stockBar');
		if (!bar) return;
		observer = new MutationObserver((mutations) => {
			for (const m of mutations) {
				if (m.target.classList?.contains('stockBarButton')) handleButton(m.target);
			}
		});
		observer.observe(bar, {
			subtree: true,
			attributes: true,
			attributeFilter: ['aria-describedby'],
		});
	}

	window.TravianQoL.register({
		id: 'resource-full-time',
		label: 'Resource full-at time',
		description: 'Adds the clock time to the "Full in" / "Empty in" countdown in the resource bar tooltips.',
		init() {
			if (document.body) start();
			else window.addEventListener('DOMContentLoaded', start, { once: true });
		},
		destroy() {
			observer?.disconnect();
			observer = null;
			popupObserver?.disconnect();
			popupObserver = null;
			document.querySelectorAll(`.${MARK_CLASS}`).forEach((el) => el.remove());
		},
	});
})();
