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
	// The handle travels along ".slider" (between the end caps), so the cursor
	// maps onto that track, not the whole bar.
	const TRACK = ".slider";
	// Handle/fill animation while dragging (Travian's own is 250 ms).
	const DRAG_TRANSITION = "60ms";
	// Handle sits this many pixels to the right of the cursor.
	const HANDLE_OFFSET_PX = 1;
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

	/** Bar full width = total carry capacity: the "/ N" after "Total" (all merchants). */
	function carryCapacity() {
		const text = (document.querySelector(".resourceSelector")?.parentElement
			?.querySelector(".summary")?.textContent || "").replace(/[\u200e\u200f\u202a-\u202e]/g, "");
		const m = text.match(/Total[^/]*\/\s*([\d.,\s]+)/i);
		const n = m ? parseInt(m[1].replace(/\D/g, ""), 10) : NaN;
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
			const track = bar.querySelector(TRACK) || bar;
			// Travian animates the handle and fill (about 250 ms) on every value
			// change, which reads as lag under a drag. Shorten it until release.
			const animated = [...bar.querySelectorAll(".handle, .filling")].map((el) => ({
				el,
				duration: el.style.transitionDuration,
			}));
			animated.forEach(({ el }) => el.style.setProperty("transition-duration", DRAG_TRANSITION));
			drag = { track, ...parts, capacity, animated, userSelect: document.documentElement.style.userSelect };
			// No text selection while dragging.
			document.documentElement.style.userSelect = "none";
			getSelection()?.removeAllRanges();
		},
		true,
	);

	// One write per frame with the latest pointer position: React re-renders
	// the whole form per input event, so per-move writes lag.
	let frame = 0;
	let lastX = 0;
	function apply() {
		frame = 0;
		if (!drag) return;
		const rect = drag.track.getBoundingClientRect();
		if (!rect.width) return;
		const ratio = Math.min(1, Math.max(0, (lastX + HANDLE_OFFSET_PX - rect.left) / rect.width));
		const amount = Math.min(drag.max, Math.round(ratio * drag.capacity));
		if (String(amount) !== drag.input.value) setAmount(drag.input, amount);
	}

	document.addEventListener(
		"pointermove",
		(e) => {
			if (!drag) return;
			if (e.buttons !== 1) {
				stop();
				return;
			}
			lastX = e.clientX;
			if (!drag.moved) {
				drag.moved = true;
				apply();
			} else if (!frame) {
				frame = requestAnimationFrame(apply);
			}
		},
		true,
	);

	const stop = () => {
		if (!drag) return;
		if (frame) {
			cancelAnimationFrame(frame);
			apply();
		}
		document.documentElement.style.userSelect = drag.userSelect;
		drag.animated.forEach(({ el, duration }) => {
			if (duration) el.style.transitionDuration = duration;
			else el.style.removeProperty("transition-duration");
		});
		drag = null;
	};
	document.addEventListener("pointerup", stop, true);
	document.addEventListener("pointercancel", stop, true);
})();
