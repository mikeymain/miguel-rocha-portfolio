// Smithy efficiency.
// On the smithy page, each unit upgrade gets one line: how many of that unit
// the next level needs to be worth its cost, next to how many you have.
// Uses the cost shown on the page; math in features/smithy-efficiency/core.js.
//
// Compliance note: read-only DOM addition. No clicks, no network calls, no
// storage. Added lines carry no extension class, id or attribute; they are
// tracked in this closure and removed on destroy.
(function () {
	const SCAN_DELAY_MS = 150;
	const MET_COLOR = '#3c9a3c';
	const SHORT_COLOR = '#c0632a';

	const added = new Map(); // research row -> our line
	let observer = null;
	let timer = null;

	const isSmithyPage = () => !!document.querySelector('#build.gid13');
	const digits = (text) => Number(String(text ?? '').replace(/[^\d]/g, '')) || 0;

	function readRow(row) {
		const id = Number(row.querySelector('img.unit')?.className.match(/\bu(\d+)\b/)?.[1]);
		const levelText = row.querySelector('.title .level')?.textContent;
		const values = [...row.querySelectorAll('.resourceWrapper .value')];
		if (!id || levelText == null || values.length < 4) return null;
		return {
			id,
			level: digits(levelText),
			cost: values.slice(0, 4).reduce((sum, v) => sum + digits(v.textContent), 0),
			present: digits(row.querySelector('.title .furtherInfo')?.textContent),
		};
	}

	function lineFor(data) {
		const S = window.TravianQoLSmithy;
		const unit = S.unitById(data.id);
		if (!unit) return null;
		const target = data.level + 1;
		const need = S.breakEven(unit, target, data.cost || undefined);
		if (!Number.isFinite(need)) return null;
		const line = document.createElement('div');
		line.style.cssText = 'margin-top:4px;font-size:12px;';
		const count = document.createElement('b');
		count.style.color = data.present >= need ? MET_COLOR : SHORT_COLOR;
		count.textContent = need.toLocaleString();
		line.append(`Level ${target} is efficient from `, count, ` ${unit.name} (you have ${data.present.toLocaleString()})`);
		return line;
	}

	function render() {
		for (const [row, line] of added) if (!row.isConnected || !line.isConnected) added.delete(row);
		for (const row of document.querySelectorAll('#build.gid13 .research')) {
			if (added.has(row)) continue;
			const data = readRow(row);
			const line = data && lineFor(data);
			if (!line) continue;
			row.querySelector('.resourceWrapper').after(line);
			added.set(row, line);
		}
	}

	function schedule() {
		if (timer) return;
		timer = setTimeout(() => {
			timer = null;
			render();
		}, SCAN_DELAY_MS);
	}

	window.TravianQoL.register({
		id: 'smithy-efficiency',
		label: 'Smithy efficiency',
		description: 'On the smithy page, shows how many units each upgrade needs to be worth its cost, next to how many you have.',
		init() {
			if (!isSmithyPage()) return;
			render();
			observer = new MutationObserver(schedule);
			observer.observe(document.getElementById('build'), { childList: true, subtree: true });
		},
		destroy() {
			observer?.disconnect();
			observer = null;
			clearTimeout(timer);
			timer = null;
			added.forEach((line) => line.remove());
			added.clear();
		},
	});
})();
