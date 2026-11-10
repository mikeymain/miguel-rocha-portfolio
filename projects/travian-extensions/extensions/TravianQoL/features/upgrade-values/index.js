// Upgrade values.
// On a building page, Travian shows the current culture points, population
// and construction-time values with the upgrade's delta, e.g. "18 (+3)".
// This adds the value at the target level: "18 → 21 (+3)".
//
// Compliance note: read-only DOM change. No clicks, no network calls.
(function () {
	const MARK_CLASS = 'tlw-next-value';
	const DEBOUNCE_MS = 150;
	const BIDI_CHARS = /[‎‏‪-‮]/g;

	let observer = null;
	let debounceTimer = null;

	/** Parse "1,234", "67%", "(+3)" or "(−3%)" into a number; null if none. */
	function parseNumber(text) {
		const clean = text.replace(BIDI_CHARS, '').replace(/[−–]/g, '-').replace(/[,\s()]/g, '');
		const match = clean.match(/[+-]?\d+(\.\d+)?/);
		return match ? Number(match[0]) : null;
	}

	function annotateUnit(unit) {
		if (unit.querySelector(`.${MARK_CLASS}`)) return;
		const valueEl = unit.querySelector(':scope > .value');
		const deltaEl = unit.querySelector(':scope > .delta');
		if (!valueEl || !deltaEl) return;
		const current = parseNumber(valueEl.textContent);
		const delta = parseNumber(deltaEl.textContent);
		if (current === null || delta === null) return;
		const isPercent = valueEl.textContent.includes('%');
		const next = current + delta;
		// Inside .value: .unit is a fixed grid, so a new sibling would wrap.
		const nextEl = document.createElement('span');
		nextEl.className = MARK_CLASS;
		nextEl.textContent = ` → ${next.toLocaleString()}${isPercent ? '%' : ''}`;
		valueEl.appendChild(nextEl);
	}

	function annotateAll() {
		document.querySelectorAll('.unit').forEach(annotateUnit);
	}

	function start() {
		annotateAll();
		observer = new MutationObserver(() => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(annotateAll, DEBOUNCE_MS);
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}

	window.TravianQoL.register({
		id: 'upgrade-values',
		label: 'Upgrade target values',
		description: 'On building pages, shows the culture points, population and construction time at the level being upgraded to.',
		init() {
			if (!location.pathname.startsWith('/build.php')) return;
			if (document.body) start();
			else window.addEventListener('DOMContentLoaded', start, { once: true });
		},
		destroy() {
			observer?.disconnect();
			observer = null;
			clearTimeout(debounceTimer);
			debounceTimer = null;
			document.querySelectorAll(`.${MARK_CLASS}`).forEach((el) => el.remove());
		},
	});
})();
