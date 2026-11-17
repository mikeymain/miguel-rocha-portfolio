/**
 * Travian NPC Resource Helper - per-input NPC lock.
 * Isolated world only: no page-world property traps, no window globals, no
 * expando properties on page elements. Lock state lives in a closure Map.
 * A 🔓/🔒 button sits next to each desired input. While any lock is engaged,
 * "Distribute remaining" is handled here (locked values stay put) and then
 * every lock is released; with no lock engaged Travian's own handler runs.
 */
(function () {
	"use strict";

	const BTN_CLASS = "_npc-lock-btn";
	const TIP_LOCK = "Lock this value — Distribute will not change it";
	const locks = new Map(); // input -> locked value string

	const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
	const getValue = (input) => nativeValue.get.call(input);
	const setValue = (input, v) => nativeValue.set.call(input, v);

	const getInputs = () =>
		[0, 1, 2, 3].map((i) => document.querySelector('input[name="desired' + i + '"]'));

	// Pool = sum of the current-resources row. "Rest:" is stale after
	// programmatic writes, so it is not used.
	function getPool() {
		let sum = 0;
		document.querySelectorAll("#npc td.all").forEach((c) => {
			const n = parseInt((c.textContent || "").replace(/[^\d-]/g, ""), 10);
			if (Number.isFinite(n)) sum += n;
		});
		return sum;
	}

	function paintButton(btn, locked, value) {
		btn.textContent = locked ? "🔒" : "🔓";
		btn.classList.toggle("_npc-lock-on", locked);
		btn.setAttribute("aria-pressed", locked ? "true" : "false");
		btn.title = locked ? "Unlock — value is currently held at " + value : TIP_LOCK;
	}

	function buttonFor(input) {
		const b = input.nextElementSibling;
		return b && b.classList && b.classList.contains(BTN_CLASS) ? b : null;
	}

	function toggle(input, btn) {
		if (locks.has(input)) {
			locks.delete(input);
			input.readOnly = false;
			paintButton(btn, false);
		} else {
			const v = getValue(input);
			locks.set(input, v);
			input.readOnly = true;
			paintButton(btn, true, v);
		}
	}

	function unlockAll() {
		for (const input of [...locks.keys()]) {
			locks.delete(input);
			input.readOnly = false;
			const btn = buttonFor(input);
			if (btn) paintButton(btn, false);
		}
	}

	// Split the unallocated pool across unlocked inputs; remainder goes one
	// per input so the sum hits the pool exactly. Locked inputs are untouched.
	function redistribute() {
		const inputs = getInputs();
		if (inputs.some((x) => !x)) return;
		const unlocked = inputs.filter((x) => !locks.has(x));
		if (!unlocked.length) return;
		const current = inputs.reduce((s, x) => s + (parseInt(getValue(x), 10) || 0), 0);
		const leftover = getPool() - current;
		if (leftover <= 0) return;
		const base = Math.floor(leftover / unlocked.length);
		const remainder = leftover - base * unlocked.length;
		unlocked.forEach((x, i) => {
			const cur = parseInt(getValue(x), 10) || 0;
			setValue(x, String(cur + base + (i < remainder ? 1 : 0)));
			x.dispatchEvent(new Event("input", { bubbles: true }));
			x.dispatchEvent(new Event("change", { bubbles: true }));
			x.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "0" }));
		});
	}

	function setup() {
		for (const input of getInputs()) {
			if (!input || buttonFor(input)) continue;
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = BTN_CLASS;
			btn.setAttribute("aria-label", "Lock value");
			paintButton(btn, locks.has(input), locks.get(input));
			btn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				toggle(input, btn);
			});
			input.insertAdjacentElement("afterend", btn);
		}
		// Drop locks whose input left the DOM (dialog re-render).
		for (const input of [...locks.keys()]) if (!input.isConnected) locks.delete(input);
	}

	// Restore a locked value if something else changed it.
	function guard(e) {
		const input = e.target;
		if (locks.has(input) && getValue(input) !== locks.get(input)) {
			setValue(input, locks.get(input));
		}
	}
	document.addEventListener("input", guard, true);
	document.addEventListener("change", guard, true);

	document.addEventListener(
		"click",
		(e) => {
			const btn = e.target && e.target.closest && e.target.closest("button, a");
			if (!btn || btn.classList.contains(BTN_CLASS)) return;
			if (!/distribute/i.test(btn.textContent || "")) return;
			if (!getInputs().some((x) => x && locks.has(x))) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			redistribute();
			unlockAll();
		},
		true,
	);

	setup();
	const probe = document.getElementsByName("desired0");
	let pending = 0;
	new MutationObserver(() => {
		if (pending || !probe.length) return;
		pending = setTimeout(() => {
			pending = 0;
			setup();
		}, 50);
	}).observe(document.documentElement, { childList: true, subtree: true });
})();
