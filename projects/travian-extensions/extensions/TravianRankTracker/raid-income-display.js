/**
 * Adds raid income to the production figures Travian shows:
 *   - the "Production per hour" table on the resources page (/resources,
 *     formerly dorf1.php);
 *   - the "Production" line and the "Full in" / "Empty in" countdown in the
 *     stock-bar tooltips.
 * Raid income is the bounty per hour from raid-income-bridge.js, split evenly
 * over the four resources (the statistics only give a total).
 *
 * Compliance note: rewrites text the page already shows. No clicks, no
 * network calls, nothing the game reads back.
 */
var RankTrackerRaidDisplay = {
	/** Ignore a raid rate whose latest statistics sample is older than this. */
	MAX_AGE_MS: 24 * 60 * 60 * 1000,
	RESOURCE_COUNT: 4,
	// State lives here, not in attributes on game nodes, so the page sees no
	// extension-specific markers.
	/** Production-table cell -> field production before raids. */
	fieldProd: new WeakMap(),
	/** Tooltip box -> production value we last wrote. */
	rewrittenNet: new WeakMap(),
	DURATION_RE: /(\d+):(\d{2}):(\d{2})/,
	NUMBER_RE: /[−-]?[‪-‮‎‏]*\d[\d.,‪-‮‎‏]*/,

	/** Raid income per resource per hour, or 0 when missing or stale. */
	shareFor(summary, now = Date.now()) {
		if (!summary || !Number.isFinite(summary.perHour) || summary.perHour <= 0) return 0;
		if (!Number.isFinite(summary.updatedAt) || now - summary.updatedAt > this.MAX_AGE_MS) return 0;
		return Math.round(summary.perHour / this.RESOURCE_COUNT);
	},

	/** Integer from Travian's formatted text ("‭1,200‬", "−35"). */
	parseNum(text) {
		const cleaned = String(text ?? "")
			.replace(/[‪-‮‎‏]/g, "")
			.replace(/[−‒–]/g, "-")
			.replace(/[^\d-]/g, "");
		const value = parseInt(cleaned, 10);
		return Number.isFinite(value) ? value : null;
	},

	formatDuration(seconds) {
		const s = Math.max(0, Math.round(seconds));
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
	},

	isResourcesPage(pathname = location.pathname) {
		return /^\/(dorf1\.php|resources)$/.test(pathname);
	},

	/** Production table on the resources page: one row per resource. */
	applyToProductionTable(doc, share) {
		const cells = doc.querySelectorAll("#production tbody tr td.num");
		cells.forEach((cell, i) => {
			if (i >= this.RESOURCE_COUNT) return;
			const field = this.fieldProd.has(cell)
				? this.fieldProd.get(cell)
				: this.parseNum(cell.textContent);
			if (field === null) return;
			this.fieldProd.set(cell, field);
			cell.textContent = String(field + share);
		});
	},

	/** Index 0-3 of the stock-bar button's resource, or -1. */
	resourceIndex(button) {
		for (let i = 1; i <= this.RESOURCE_COUNT; i++) {
			if (button.classList.contains(`resource${i}`)) return i - 1;
		}
		return -1;
	},

	/** Current stock and capacity read from the stock bar, for resource `index`. */
	stockAndCapacity(doc, index) {
		const stock = this.parseNum(doc.getElementById(`l${index + 1}`)?.textContent);
		const store = index === 3 ? ".granary" : ".warehouse";
		const capacity = this.parseNum(doc.querySelector(`#stockBar ${store} .capacity .value`)?.textContent);
		return { stock, capacity };
	},

	/**
	 * Rewrite one tooltip's "Production" and countdown lines. Travian's
	 * countdown is relative to page load, so the new one is derived from it
	 * (same reference point) rather than from the live stock.
	 */
	applyToTooltip(doc, box, index, share) {
		const walker = doc.createTreeWalker(box, 4 /* NodeFilter.SHOW_TEXT */);
		let prodNode = null;
		let countNode = null;
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (node.parentNode?.classList?.contains("tqol-full-at")) continue;
			if (this.DURATION_RE.test(node.nodeValue)) {
				if (!countNode) countNode = node;
			} else if (!prodNode && /:\s*\S*\d/.test(node.nodeValue)) {
				prodNode = node;
			}
		}
		if (!prodNode) return;
		const numMatch = prodNode.nodeValue.match(this.NUMBER_RE);
		const field = this.parseNum(numMatch?.[0]);
		if (field === null) return;
		// Already rewritten (our own mutation, or a re-check of the same text).
		if (this.rewrittenNet.get(box) === field) return;
		const net = field + share;
		this.rewrittenNet.set(box, net);
		prodNode.nodeValue = prodNode.nodeValue.replace(numMatch[0], String(net));
		if (!countNode) return;

		const d = countNode.nodeValue.match(this.DURATION_RE);
		const seconds = (+d[1]) * 3600 + (+d[2]) * 60 + (+d[3]);
		if (field !== 0 && Math.sign(field) === Math.sign(net)) {
			// Full in: space left is unchanged, it fills faster.
			// Empty in: stock left is unchanged, it empties slower.
			countNode.nodeValue = countNode.nodeValue.replace(d[0], this.formatDuration(seconds * field / net));
		} else if (field < 0 && net > 0) {
			// Raids turn a crop deficit into a gain: show when it fills instead.
			const { stock, capacity } = this.stockAndCapacity(doc, index);
			if (stock === null || capacity === null) return;
			const before = countNode.nodeValue.slice(0, d.index).replace(/[^:\n]*:\s*$/, "");
			const after = countNode.nodeValue.slice(d.index + d[0].length);
			const fullIn = this.formatDuration((capacity - stock) / net * 3600);
			countNode.nodeValue = `${before}Full in: ${fullIn}${after}`;
		}
	},

	/** Watch stock-bar buttons for their tippy tooltip opening. */
	watchStockBar(doc, share) {
		const bar = doc.getElementById("stockBar");
		if (!bar) return null;
		// Travian re-renders an open tooltip, which restores its own text; this
		// watches the open popup and rewrites it again.
		let popupObserver = null;
		const onButton = (button) => {
			popupObserver?.disconnect();
			popupObserver = null;
			const id = button.getAttribute("aria-describedby");
			const index = this.resourceIndex(button);
			if (!id || index < 0) return;
			const apply = () => {
				const popup = doc.getElementById(id);
				const box = popup?.querySelector(".tippy-content");
				if (box) this.applyToTooltip(doc, box, index, share);
				if (popup && !popupObserver) {
					popupObserver = new MutationObserver(() => {
						const current = popup.querySelector(".tippy-content");
						if (popup.isConnected && current) this.applyToTooltip(doc, current, index, share);
					});
					popupObserver.observe(popup, { childList: true, subtree: true });
				}
			};
			apply();
			// Tippy may fill the popup just after setting the attribute.
			setTimeout(apply, 0);
		};
		const observer = new MutationObserver((mutations) => {
			for (const m of mutations) {
				if (m.target.classList?.contains("stockBarButton")) onButton(m.target);
			}
		});
		observer.observe(bar, { subtree: true, attributes: true, attributeFilter: ["aria-describedby"] });
		return observer;
	},

	start(summary, doc = document) {
		const share = this.shareFor(summary);
		if (share <= 0) return;
		if (this.isResourcesPage()) this.applyToProductionTable(doc, share);
		this.watchStockBar(doc, share);
	},
};
