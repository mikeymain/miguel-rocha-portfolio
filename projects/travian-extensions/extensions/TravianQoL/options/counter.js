// Counter-attack tab of the options page. Self-contained; loaded after options.js.
// =====================================================================
// Counter-attack tab
// =====================================================================
// Mirrors inactivesearch.it/tools/counter-attack-calculator: take an
// incoming attack's arrival time + the attacker's slowest unit + both
// villages' coords, compute (a) when their army returns home, and
// (b) when you must launch a counter to land at that same moment.
(function initCounterAttackTab() {
	const root = document.getElementById('tab-counter');
	if (!root) return;

	// Canonical Travian unit speeds (fields/hour) by tribe, including
	// the slow late-game units that usually pace an attack (rams, catas,
	// chiefs, settlers). Grouped in the dropdown by tribe.
	const UNITS = {
		Romans: [
			['Legionnaire', 6], ['Praetorian', 5], ['Imperian', 7],
			['Equites Legati', 16], ['Equites Imperatoris', 14], ['Equites Caesaris', 10],
			['Battering Ram', 4], ['Fire Catapult', 3], ['Senator', 4], ['Settler', 5],
		],
		Teutons: [
			['Clubswinger', 7], ['Spearman', 7], ['Axeman', 6], ['Scout', 9],
			['Paladin', 10], ['Teutonic Knight', 9],
			['Ram', 4], ['Catapult', 3], ['Chief', 4], ['Settler', 5],
		],
		Gauls: [
			['Phalanx', 7], ['Swordsman', 6], ['Pathfinder', 17],
			['Theutates Thunder', 19], ['Druidrider', 16], ['Haeduan', 13],
			['Ram', 4], ['Trebuchet', 3], ['Chieftain', 5], ['Settler', 5],
		],
		Egyptians: [
			['Slave Militia', 7], ['Ash Warden', 6], ['Khopesh Warrior', 7],
			['Sopdu Explorer', 16], ['Anhur Guard', 15], ['Resheph Chariot', 10],
			['Ram', 4], ['Stone Catapult', 3], ['Nomarch', 4], ['Settler', 5],
		],
		Huns: [
			['Mercenary', 6], ['Bowman', 6], ['Spotter', 19],
			['Steppe Rider', 16], ['Marksman', 14], ['Marauder', 13],
			['Ram', 4], ['Catapult', 3], ['Logades', 5], ['Settler', 5],
		],
		Spartans: [
			['Hoplite', 7], ['Sentinel', 9], ['Shieldsman', 7],
			['Twinsteel Therion', 6], ['Elpida Rider', 16], ['Corinthian Crusher', 13],
			['Ram', 4], ['Ballista', 3], ['Ephor', 5], ['Settler', 5],
		],
	};

	function populateUnitSelect(sel) {
		sel.innerHTML = '';
		for (const tribe of Object.keys(UNITS)) {
			const g = document.createElement('optgroup');
			g.label = tribe;
			for (const [name, speed] of UNITS[tribe]) {
				const o = document.createElement('option');
				o.value = String(speed);
				o.textContent = `${name} — ${speed} f/h`;
				g.appendChild(o);
			}
			sel.appendChild(g);
		}
	}
	function populateTsSelect(sel) {
		sel.innerHTML = '';
		for (let i = 0; i <= 20; i++) {
			const o = document.createElement('option');
			o.value = String(i);
			o.textContent = i === 0 ? '—' : String(i);
			sel.appendChild(o);
		}
	}

	root.querySelectorAll('select[data-att="speed"], select[data-int="speed"]').forEach(populateUnitSelect);
	root.querySelectorAll('select[data-att="ts"], select[data-int="ts"]').forEach(populateTsSelect);

	// Village picker for the interceptor — populated from the village
	// snapshot the content script writes to chrome.storage.local on
	// every Travian page load. Stays hidden until a snapshot exists.
	const intCoordsEl = root.querySelector('[data-int="coords"]');
	const villagePicker = document.getElementById('ca-int-village');
	// The picker now lives in its own grid cell — hide the whole
	// field (the wrapping <label>) when there's no snapshot, not just
	// the <select>, so the column gap collapses cleanly.
	const villageField = villagePicker.closest('.ca__field');
	let villages = [];
	function loadVillages(snapshot) {
		const list = snapshot?.list || [];
		villages = list.filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
		// Storage callbacks are async, so the rest of the tab is ready.
		recompute();
		if (!list.length) { villageField.hidden = true; return; }
		villagePicker.innerHTML = '';
		const placeholder = document.createElement('option');
		placeholder.value = '';
		placeholder.textContent = `— pick (${list.length}) —`;
		villagePicker.appendChild(placeholder);
		for (const v of list) {
			const o = document.createElement('option');
			o.value = `(${v.x}|${v.y})`;
			o.textContent = `${v.name} (${v.x}|${v.y})`;
			villagePicker.appendChild(o);
		}
		villageField.hidden = false;
	}
	villagePicker.addEventListener('change', () => {
		if (!villagePicker.value) return;
		intCoordsEl.value = villagePicker.value;
		intCoordsEl.dispatchEvent(new Event('input', { bubbles: true }));
		villagePicker.selectedIndex = 0;
	});
	chrome.storage.local.get(['travianQoL.villages'], (res) => loadVillages(res['travianQoL.villages']));
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === 'local' && changes['travianQoL.villages']) {
			loadVillages(changes['travianQoL.villages'].newValue);
		}
	});

	// Sensible defaults: slowest units on each side default to ram/cata.
	root.querySelector('select[data-att="speed"]').value = '4';
	root.querySelector('select[data-int="speed"]').value = '4';

	// Pre-fill arrival time with "now + 30 min" so the user has a
	// concrete starting point.
	const arrivalEl = document.getElementById('ca-arrival');
	function setArrival(t) {
		const pad = (n) => String(n).padStart(2, '0');
		arrivalEl.value = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
	}
	setArrival(new Date(Date.now() + 30 * 60 * 1000));

	// "Arrives in" takes the countdown shown on the incoming attack
	// (h:mm:ss or mm:ss) and turns it into the arrival time. Its own
	// listener runs before the panel's bubbling one, so recompute()
	// already sees the new arrival.
	const arrivesInEl = document.getElementById('ca-arrives-in');
	function parseCountdown(str) {
		const parts = String(str).trim().split(':');
		if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
		const [h, m, s] = parts.length === 3 ? parts.map(Number) : [0, ...parts.map(Number)];
		if (m > 59 || s > 59) return null;
		return (h * 3600 + m * 60 + s) * 1000;
	}
	arrivesInEl.addEventListener('input', () => {
		const ms = parseCountdown(arrivesInEl.value);
		if (ms != null) setArrival(new Date(Date.now() + ms));
	});
	arrivalEl.addEventListener('input', () => { arrivesInEl.value = ''; });

	// Persist inputs across sessions. Arrival time is intentionally
	// excluded — it auto-prefills to now+30m, which beats restoring a
	// stale timestamp from a previous session.
	const STORAGE_KEY = 'travianQoL.counterAttack.inputs';
	const PERSIST_IDS = ['ca-target', 'ca-server-speed', 'ca-map'];
	const PERSIST_DATA = [
		['att', 'coords'], ['att', 'speed'], ['att', 'ts'], ['att', 'boots'], ['att', 'art'],
		['int', 'coords'], ['int', 'speed'], ['int', 'ts'], ['int', 'boots'], ['int', 'art'], ['int', 'delay'],
	];
	function snapshotInputs() {
		const data = {};
		for (const id of PERSIST_IDS) {
			const el = document.getElementById(id);
			if (el) data[id] = el.value;
		}
		for (const [side, key] of PERSIST_DATA) {
			const el = root.querySelector(`[data-${side}="${key}"]`);
			if (el) data[`${side}.${key}`] = el.value;
		}
		return data;
	}
	function restoreInputs(data) {
		if (!data) return;
		for (const id of PERSIST_IDS) {
			if (data[id] != null) {
				const el = document.getElementById(id);
				if (el) el.value = data[id];
			}
		}
		for (const [side, key] of PERSIST_DATA) {
			const v = data[`${side}.${key}`];
			if (v == null) continue;
			const el = root.querySelector(`[data-${side}="${key}"]`);
			if (el) el.value = v;
		}
	}
	let saveTimer = null;
	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			chrome.storage.local.set({ [STORAGE_KEY]: snapshotInputs() });
		}, 250);
	}
	chrome.storage.local.get([STORAGE_KEY], (res) => {
		restoreInputs(res[STORAGE_KEY]);
		recompute();
	});

	// --- math ---
	function parseCoords(str) {
		if (!str) return null;
		// Pasted Travian coordinates use U+2212 and bidi marks; without this
		// "(−5|3)" parses as (5|3) and the launch time is wrong.
		const m = String(str)
			.replace(/[‪-‮‎‏]/g, '')
			.replace(/[−‒–]/g, '-')
			.match(/-?\d+/g);
		if (!m || m.length < 2) return null;
		return { x: parseInt(m[0], 10), y: parseInt(m[1], 10) };
	}
	function torusDistance(a, b, mapSize) {
		// Map is square with coords in [-S/2 .. +S/2]; wrap-around uses
		// `mapSize` (200/400/800) as the perimeter.
		const dx = Math.min(Math.abs(a.x - b.x), mapSize - Math.abs(a.x - b.x));
		const dy = Math.min(Math.abs(a.y - b.y), mapSize - Math.abs(a.y - b.y));
		return Math.sqrt(dx * dx + dy * dy);
	}
	// Travian help, "Troops Speed Increase & Tournament Square": artefacts
	// multiply the whole trip; boots and the Tournament Square only count
	// after the first 20 fields, and their bonuses ADD (+25% boots and
	// TS 10 = x(1 + 0.25 + 2), not x1.25 x3).
	// Travian help, "Game Versions and Speed": troops move x2 on x2, x3
	// and x5 servers and x4 on x10, not at the server's game speed.
	const TROOP_SPEED = { 1: 1, 2: 2, 3: 2, 5: 2, 10: 4 };
	function troopSpeedFor(gameSpeed) {
		return TROOP_SPEED[parseInt(gameSpeed, 10)] || 1;
	}
	const TS_FREE_FIELDS = 20;
	const TS_BONUS_PER_LEVEL = 0.2;
	function travelSeconds(dist, baseSpeed, serverSpeed, artefact, bootsMult, tsLevel) {
		const speed = baseSpeed * serverSpeed * artefact; // fields/hour
		if (!Number.isFinite(speed) || speed <= 0) return Infinity;
		if (dist <= TS_FREE_FIELDS) return (dist / speed) * 3600;
		const beyondBonus = 1 + (bootsMult - 1) + TS_BONUS_PER_LEVEL * tsLevel;
		const beyond = dist - TS_FREE_FIELDS;
		return (TS_FREE_FIELDS / speed + beyond / (speed * beyondBonus)) * 3600;
	}
	function fmtDuration(sec) {
		if (!Number.isFinite(sec) || sec < 0) return '—';
		sec = Math.round(sec);
		const h = Math.floor(sec / 3600);
		const m = Math.floor((sec % 3600) / 60);
		const s = sec % 60;
		const pad = (n) => String(n).padStart(2, '0');
		return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
	}
	function fmtTime(d) {
		if (!(d instanceof Date) || isNaN(d)) return '—';
		const pad = (n) => String(n).padStart(2, '0');
		const same = (a, b) =>
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate();
		const today = new Date();
		const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
		const stamp = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
		if (same(d, today)) return stamp;
		if (same(d, tomorrow)) return `tomorrow ${stamp}`;
		return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${stamp}`;
	}

	const outEl = document.getElementById('ca-out');
	function read(side, key) {
		const el = root.querySelector(`[data-${side}="${key}"]`);
		return el ? el.value : '';
	}

	// Last computed plan; consumed by the countdown tick so we can refresh
	// the "launch in / too late" banner once per second without redoing
	// the trig on every frame.
	let plan = null;

	function escapeHtml(s) {
		return String(s).replace(/[&<>"']/g, (c) => ({
			'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
		}[c]));
	}

	// Vertical sequence of the events that matter, in time order. A
	// stacked rail can never overlap (unlike the old horizontal strip),
	// so no collision/stagger logic is needed — just render rows.
	// `events` arrive pre-sorted; the last row drops its connector line.
	function buildSequence(events) {
		const rows = events.map((e, i) => {
			const isLast = i === events.length - 1;
			return `
				<div class="ca__seq-row" data-kind="${e.kind}">
					<span class="ca__seq-time">${escapeHtml(fmtTime(e.t))}</span>
					<span class="ca__seq-rail">
						<span class="ca__seq-dot"></span>
						${isLast ? '' : '<span class="ca__seq-line"></span>'}
					</span>
					<span class="ca__seq-body">
						<span class="ca__seq-label">${escapeHtml(e.label)}</span>
						${e.desc ? `<span class="ca__seq-desc">${escapeHtml(e.desc)}</span>` : ''}
					</span>
				</div>`;
		}).join('');
		return `
			<div class="ca__seq">
				<div class="ca__seq-head">Sequence</div>
				${rows}
			</div>`;
	}

	// Launch time from every village in the sidebar snapshot, soonest
	// launch first. Rows already past their launch time sort last.
	// `rows` carry {name, x, y, dist, t, depart}.
	function buildVillageTable(rows, selected) {
		if (rows.length < 2) return '';
		const now = Date.now();
		const sorted = [...rows].sort((a, b) => {
			const late = (r) => r.depart.getTime() < now - 1000;
			if (late(a) !== late(b)) return late(a) ? 1 : -1;
			return late(a) ? b.depart - a.depart : a.depart - b.depart;
		});
		const body = sorted.map((r) => {
			const coords = `(${r.x}|${r.y})`;
			const isSel = selected && selected.x === r.x && selected.y === r.y;
			const missed = r.depart.getTime() < now - 1000;
			return `
				<tr class="${missed ? 'ca__vt-missed' : ''}${isSel ? ' ca__vt-sel' : ''}" data-coords="${escapeHtml(coords)}" tabindex="0">
					<td>${escapeHtml(r.name)} <span class="ca__vt-xy">${escapeHtml(coords)}</span></td>
					<td>${r.dist.toFixed(1)}</td>
					<td>${escapeHtml(fmtDuration(r.t))}</td>
					<td>${missed ? 'Missed' : escapeHtml(fmtTime(r.depart))}</td>
				</tr>`;
		}).join('');
		return `
			<table class="ca__vt">
				<thead><tr><th>Village</th><th>Fields</th><th>Travel</th><th>Launch</th></tr></thead>
				<tbody>${body}</tbody>
			</table>`;
	}

	function statusFor(launchAt) {
		// No counter target → neutral banner.
		if (!launchAt) {
			return { cls: '', label: 'Waiting', value: '—', sub: 'Add interceptor coords to plan a counter.' };
		}
		const ms = launchAt.getTime() - Date.now();
		if (ms <= -1000) {
			return { cls: 'ca__answer--bad', label: 'Too late', value: 'MISSED', sub: `Should have launched ${fmtDuration(-ms / 1000)} ago.` };
		}
		if (ms <= 10_000) {
			return { cls: 'ca__answer--bad', label: 'Launch now', value: 'NOW', sub: 'Send the counter immediately.' };
		}
		if (ms <= 10 * 60 * 1000) {
			return { cls: 'ca__answer--warn', label: 'Launch in', value: fmtDuration(ms / 1000), sub: `at ${fmtTime(launchAt)}` };
		}
		return { cls: 'ca__answer--ok', label: 'Launch in', value: fmtDuration(ms / 1000), sub: `at ${fmtTime(launchAt)}` };
	}

	// Re-render just the answer block — cheap; runs once per second.
	function renderStatus(launchAt) {
		const s = statusFor(launchAt);
		const node = outEl.querySelector('.ca__answer');
		if (!node) return;
		node.className = `ca__answer ${s.cls}`.trim();
		node.querySelector('.ca__answer-label').textContent = s.label;
		node.querySelector('.ca__countdown').textContent = s.value;
		node.querySelector('.ca__answer-note').textContent = s.sub;
	}

	function recompute() {
		const target = parseCoords(document.getElementById('ca-target').value);
		const att = parseCoords(read('att', 'coords'));
		const inter = parseCoords(read('int', 'coords'));
		const arrival = arrivalEl.value ? new Date(arrivalEl.value) : null;
		const serverSpeed = troopSpeedFor(document.getElementById('ca-server-speed').value);
		const delaySec = Math.max(0, parseFloat(read('int', 'delay')) || 0);
		const mapSize = parseInt(document.getElementById('ca-map').value, 10) || 400;

		const aSpeed = parseFloat(read('att', 'speed')) || 0;
		const aTs = parseInt(read('att', 'ts'), 10) || 0;
		const aBoots = parseFloat(read('att', 'boots')) || 1;
		const aArt = parseFloat(read('att', 'art')) || 1;

		const iSpeed = parseFloat(read('int', 'speed')) || 0;
		const iTs = parseInt(read('int', 'ts'), 10) || 0;
		const iBoots = parseFloat(read('int', 'boots')) || 1;
		const iArt = parseFloat(read('int', 'art')) || 1;

		const errs = [];
		if (!target) errs.push('target coords');
		if (!att) errs.push('attacker coords');
		if (!arrival || isNaN(arrival)) errs.push('arrival time');
		if (errs.length) {
			outEl.className = 'ca__out';
			outEl.innerHTML = `<div class="ca__hint">Fill ${errs.join(', ')} to calculate.</div>`;
			plan = null;
			return;
		}

		// 1) Distance + travel times for the incoming attack.
		const distAtt = torusDistance(target, att, mapSize);
		const tAtt = travelSeconds(distAtt, aSpeed, serverSpeed, aArt, aBoots, aTs);
		const depart = new Date(arrival.getTime() - tAtt * 1000);
		const returns = new Date(arrival.getTime() + tAtt * 1000);

		// 2) Counter — must land on the attacker's village the moment
		//    their army gets back home.
		//    `delaySec` lands it that many seconds after they are home.
		const landAt = new Date(returns.getTime() + delaySec * 1000);
		const counterFrom = (from) => {
			const dist = torusDistance(att, from, mapSize);
			const t = travelSeconds(dist, iSpeed, serverSpeed, iArt, iBoots, iTs);
			return { dist, t, depart: new Date(landAt.getTime() - t * 1000) };
		};
		let distInt = 0, tInt = 0, counterDepart = null;
		if (inter && iSpeed > 0) {
			({ dist: distInt, t: tInt, depart: counterDepart } = counterFrom(inter));
		}

		plan = { counterDepart };

		// Sequence events in time order. Arrival is user input; the
		// calculated moments are `returns` (attacker army home) and the
		// counter launch. Each carries a short desc for the sequence rail.
		const events = [];
		events.push({ t: arrival, kind: 'hit-us', label: 'Attack hits us', desc: 'their army turns for home' });
		if (counterDepart) events.push({ t: counterDepart, kind: 'counter', label: 'Launch your counter \u2192', desc: `travel ${fmtDuration(tInt)} \u00b7 ${distInt.toFixed(1)} f` });
		if (counterDepart && delaySec > 0) {
			events.push({ t: returns, kind: 'return', label: 'Army home', desc: 'attacker army back home' });
			events.push({ t: landAt, kind: 'return', label: 'Counter lands', desc: `${fmtDuration(delaySec)} after return` });
		} else {
			events.push({ t: returns, kind: 'return', label: 'Army home \u00b7 counter lands', desc: counterDepart ? 'snipe connects' : 'attacker army back home' });
		}
		events.sort((a, b) => a.t - b.t);

		// Bottom raw strip — distances + counter travel only. Each side
		// is a grid cell; CSS draws the divider between them so it aligns
		// with the answer/sequence column boundary above.
		const rawCounter = counterDepart
			? `<span><b>Counter</b> ${distInt.toFixed(1)} f \u00b7 travel ${fmtDuration(tInt)}</span>`
			: '';

		outEl.className = 'ca__out ca__out--rich';
		outEl.innerHTML = `
			<div class="ca__plan">
				<div class="ca__answer">
					<span class="ca__answer-label"></span>
					<span class="ca__countdown"></span>
					<span class="ca__answer-note"></span>
				</div>
				${buildSequence(events)}
			</div>
			<div class="ca__raw">
				<span><b>Att</b> ${distAtt.toFixed(1)} f</span>
				${rawCounter}
			</div>
			${iSpeed > 0 ? buildVillageTable(villages.map((v) => ({ ...v, ...counterFrom(v) })), inter) : ''}`;

		renderStatus(counterDepart);
	}

	// Picking a row in the village table makes it the interceptor.
	function useVillageRow(row) {
		if (!row) return;
		intCoordsEl.value = row.dataset.coords;
		intCoordsEl.dispatchEvent(new Event('input', { bubbles: true }));
	}
	outEl.addEventListener('click', (e) => useVillageRow(e.target.closest('tr[data-coords]')));
	outEl.addEventListener('keydown', (e) => {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		const row = e.target.closest('tr[data-coords]');
		if (row) { e.preventDefault(); useVillageRow(row); }
	});

	// Wire up live recompute on any change/input within the panel.
	root.addEventListener('input', () => { recompute(); scheduleSave(); });
	root.addEventListener('change', () => { recompute(); scheduleSave(); });
	// 1-Hz countdown refresh — cheap, only touches the answer block. Tracked
	// so we can drop it on page unload (cleanliness, not necessity).
	const tickId = setInterval(() => { if (plan) renderStatus(plan.counterDepart); }, 1000);
	window.addEventListener('beforeunload', () => clearInterval(tickId), { once: true });
	recompute();
	// Note: chrome.storage.local.get above will call recompute() again
	// once the persisted snapshot loads. The synchronous call here keeps
	// the "fill X to calculate" hint visible during that brief window.
})();
