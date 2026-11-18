/**
 * Travian NPC Resource Helper - draggable send-resources sliders.
 * Travian's marketplace sliders only react to clicks. This adds press-and-drag:
 * while the pointer is held after pressing a bar, the amount follows the
 * cursor (clamped to stock / free merchant capacity) until release.
 * Isolated world, no page hooks; values go through the native input setter
 * plus an "input" event so Travian's own form state picks them up.
 */
(function () {
	"use strict";

	const BAR = ".resourceSelector .progressBar";
	const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;

	/** Row parts for a bar: the amount input and its "/ max" cell. */
	function rowParts(bar) {
		let el = bar.nextElementSibling;
		while (el && !el.classList.contains("inputRatio")) el = el.nextElementSibling;
		const input = el && el.querySelector("input");
		if (!input) return null;
		const max = parseInt((el.textContent || "").split("/").pop().replace(/\D/g, ""), 10);
		return { input, max: Number.isFinite(max) ? max : 0 };
	}

	/** Merchant capacity: the number the bar's full width stands for. */
	function carryCapacity() {
		const info = document.querySelector(".merchantCarryInfo");
		const nums = (info?.textContent || "").match(/\d[\d.,\s]*/g) || [];
		const n = parseInt((nums[nums.length - 1] || "").replace(/\D/g, ""), 10);
		return Number.isFinite(n) ? n : 0;
	}

	function setAmount(input, amount) {
		valueSetter.call(input, String(amount));
		input.dispatchEvent(new Event("input", { bubbles: true }));
	}

	let drag = null;

	document.addEventListener(
		"pointerdown",
		(e) => {
			if (e.button !== 0 || !e.isTrusted) return;
			const bar = e.target.closest && e.target.closest(BAR);
			if (!bar) return;
			const parts = rowParts(bar);
			const capacity = carryCapacity();
			if (!parts || !capacity) return;
			drag = { bar, ...parts, capacity };
		},
		true,
	);

	document.addEventListener(
		"pointermove",
		(e) => {
			if (!drag) return;
			if (e.buttons !== 1) {
				drag = null;
				return;
			}
			const rect = drag.bar.getBoundingClientRect();
			if (!rect.width) return;
			const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
			const amount = Math.min(drag.max, Math.round(ratio * drag.capacity));
			if (String(amount) !== drag.input.value) setAmount(drag.input, amount);
		},
		true,
	);

	const stop = () => {
		drag = null;
	};
	document.addEventListener("pointerup", stop, true);
	document.addEventListener("pointercancel", stop, true);
})();
