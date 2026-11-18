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

	function formatClock(date) {
		const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
		const now = new Date();
		if (date.toDateString() === now.toDateString()) return time;
		const tomorrow = new Date(now);
		tomorrow.setDate(now.getDate() + 1);
		if (date.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
		return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
	}

	// The countdown is relative to page load, not to when the tooltip opens.
	function clockFor(textNode) {
		const m = textNode.nodeValue.match(DURATION_RE);
		if (!m) return null;
		const seconds = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
		return formatClock(new Date(performance.timeOrigin + seconds * 1000));
	}

	function annotate(popup) {
		const box = popup.querySelector('.tippy-content');
		if (!box || box.querySelector(`.${MARK_CLASS}`)) return;
		const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const clock = clockFor(node);
			if (!clock) continue;
			const span = document.createElement('span');
			span.className = MARK_CLASS;
			span.textContent = ` (at ${clock})`;
			node.parentNode.insertBefore(span, node.nextSibling);
			return;
		}
	}

	function handleButton(button) {
		const id = button.getAttribute('aria-describedby');
		if (!id) return;
		// Tippy fills the popup content right after setting the attribute.
		requestAnimationFrame(() => {
			const popup = document.getElementById(id);
			if (popup) annotate(popup);
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
			document.querySelectorAll(`.${MARK_CLASS}`).forEach((el) => el.remove());
		},
	});
})();
