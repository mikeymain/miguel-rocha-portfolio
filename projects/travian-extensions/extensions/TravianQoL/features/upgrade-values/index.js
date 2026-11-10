// Upgrade values.
// On a building page, Travian shows culture points, population and
// construction time as "value (+delta)" for the next level after any queued
// upgrades. This rewrites them as "built level → built level + 1", e.g. a
// Residence at level 8 with levels 9 and 10 queued shows "9 → 10 (+1)".
//
// The building's base values are solved from the shown numbers with the game
// formulas (kirilloid):
//   culture points at level L = round(cp * 1.2^L)
//   population at level L     = cu + sum(l = 2..L) round((5cu + l - 1) / 10)
//   Main Building time        = round(100 * 0.964^(L - 1)) %
// A unit is left as the game shows it when no formula matches.
//
// Compliance note: read-only DOM change. No clicks, no network calls.
(function () {
	const DONE_ATTR = 'tlwUpgradeDone';
	const ORIGINAL_ATTR = 'tlwOriginal';
	const DEBOUNCE_MS = 150;
	const MAX_QUEUED_LEVELS = 6;
	const MAX_BASE_CP = 20;
	const MAX_BASE_CU = 10;
	const BIDI_CHARS = /[‎‏‪-‮]/g;

	let observer = null;
	let debounceTimer = null;

	/** Parse "1,234", "67%", "(+3)" or "(−3%)" into a number; null if none. */
	function parseNumber(text) {
		const clean = text.replace(BIDI_CHARS, '').replace(/[−–]/g, '-').replace(/[,\s()]/g, '');
		const match = clean.match(/[+-]?\d+(\.\d+)?/);
		return match ? Number(match[0]) : null;
	}

	const cpAt = (cp, level) => Math.round(cp * 1.2 ** level);
	function popAt(cu, level) {
		if (level <= 0) return 0;
		let total = cu;
		for (let l = 2; l <= level; l++) total += Math.round((5 * cu + l - 1) / 10);
		return total;
	}
	const timeAt = (_base, level) => Math.round(100 * 0.964 ** (level - 1));

	const FORMULAS = {
		culturePoints_medium: { at: cpAt, bases: MAX_BASE_CP },
		population_medium: { at: popAt, bases: MAX_BASE_CU },
		constructionTime_medium: { at: timeAt, bases: 0 },
	};

	/** Base value that gives `value` at `level` and `value + delta` at level + 1. */
	function solveBase(formula, level, value, delta) {
		for (let base = 0; base <= formula.bases; base++) {
			if (formula.at(base, level) === value && formula.at(base, level + 1) - value === delta) return base;
		}
		return null;
	}

	function builtLevel() {
		const el = document.querySelector('#build[class*="level"]');
		const match = el?.className.match(/\blevel(\d+)\b/);
		return match ? Number(match[1]) : null;
	}

	function readUnit(unit) {
		const valueEl = unit.querySelector(':scope > .value');
		const deltaEl = unit.querySelector(':scope > .delta');
		const iconClass = [...(unit.querySelector(':scope > i')?.classList ?? [])].find((c) => FORMULAS[c]);
		if (!valueEl || !deltaEl || !iconClass) return null;
		const value = parseNumber(valueEl.textContent);
		const delta = parseNumber(deltaEl.textContent);
		if (value === null || delta === null) return null;
		return { unit, valueEl, deltaEl, formula: FORMULAS[iconClass], value, delta };
	}

	/** Level the game's numbers refer to: the lowest one all units agree on. */
	function shownLevel(units, built) {
		for (let level = built; level <= built + MAX_QUEUED_LEVELS; level++) {
			if (units.every((u) => solveBase(u.formula, level, u.value, u.delta) !== null)) return level;
		}
		return null;
	}

	function formatDelta(delta, isPercent) {
		const sign = delta < 0 ? '−' : '+';
		return `(${sign}${Math.abs(delta).toLocaleString()}${isPercent ? '%' : ''})`;
	}

	function rewriteUnit(u, shown, built) {
		const base = solveBase(u.formula, shown, u.value, u.delta);
		const current = u.formula.at(base, built);
		const next = u.formula.at(base, built + 1);
		const isPercent = u.valueEl.textContent.includes('%');
		const suffix = isPercent ? '%' : '';
		u.valueEl.dataset[ORIGINAL_ATTR] = u.valueEl.textContent;
		u.deltaEl.dataset[ORIGINAL_ATTR] = u.deltaEl.textContent;
		u.valueEl.textContent = `${current.toLocaleString()}${suffix} → ${next.toLocaleString()}${suffix}`;
		u.deltaEl.textContent = formatDelta(next - current, isPercent);
	}

	function annotateWrapper(wrapper, built) {
		const units = [...wrapper.querySelectorAll(':scope > .unit')]
			.filter((unit) => !unit.dataset[DONE_ATTR])
			.map(readUnit)
			.filter(Boolean);
		if (units.length === 0) return;
		const shown = shownLevel(units, built);
		units.forEach((u) => {
			u.unit.dataset[DONE_ATTR] = 'true';
			if (shown !== null) rewriteUnit(u, shown, built);
		});
	}

	function annotateAll() {
		const built = builtLevel();
		if (built === null) return;
		const wrappers = new Set([...document.querySelectorAll('.unit')].map((unit) => unit.parentElement));
		wrappers.forEach((wrapper) => annotateWrapper(wrapper, built));
	}

	function restoreAll() {
		document.querySelectorAll(`[data-tlw-original]`).forEach((el) => {
			el.textContent = el.dataset[ORIGINAL_ATTR];
			delete el.dataset[ORIGINAL_ATTR];
		});
		document.querySelectorAll('[data-tlw-upgrade-done]').forEach((el) => delete el.dataset[DONE_ATTR]);
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
		description: 'On building pages, shows culture points, population and construction time at the built level and the next level.',
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
			restoreAll();
		},
	});
})();
