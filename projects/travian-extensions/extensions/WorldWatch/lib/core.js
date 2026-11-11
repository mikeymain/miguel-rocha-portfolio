// Watch-list logic shared by the service worker and tests.
// Depends on WWMapSql (mapsql.js). The store is injected.
(function (root) {
	"use strict";

	const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.travian\.(com|org|net|us|de)$/;
	const DEFAULT_SETTINGS = Object.freeze({ intervalMin: 60, cap: 30 });
	const MIN_INTERVAL = 15;
	const MAX_INTERVAL = 1440;
	const MAX_CAP = 200;

	// Accepts "ts4.x1.arabics.travian.com" or a full URL. Returns null if invalid.
	function normalizeHost(input) {
		let s = String(input || "")
			.trim()
			.toLowerCase();
		if (!s) return null;
		if (!/^[a-z]+:\/\//.test(s)) s = "https://" + s;
		let host;
		try {
			host = new URL(s).hostname;
		} catch {
			return null;
		}
		return HOST_RE.test(host) ? host : null;
	}

	function normalizeSettings(raw) {
		const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
		const interval = Math.round(Number(s.intervalMin));
		const cap = Math.round(Number(s.cap));
		return {
			intervalMin: Number.isFinite(interval)
				? Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, interval))
				: DEFAULT_SETTINGS.intervalMin,
			cap: Number.isFinite(cap) ? Math.min(MAX_CAP, Math.max(2, cap)) : DEFAULT_SETTINGS.cap,
		};
	}

	async function sha256Hex(text) {
		const bytes = new TextEncoder().encode(text);
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
	}

	// Fetches map.sql for one host and stores a snapshot when the content changed.
	// deps: { fetch, store, now, cap }
	// Returns a status object; never throws.
	async function pollHost(host, deps) {
		const now = deps.now();
		const status = { host, lastCheckedAt: now, changed: false, error: null };
		try {
			const res = await deps.fetch(`https://${host}/map.sql`, {
				credentials: "omit",
				cache: "no-store",
				redirect: "error",
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const text = await res.text();
			const hash = await sha256Hex(text);
			const metas = await deps.store.list(host);
			const last = metas[metas.length - 1];
			if (!last || last.hash !== hash) {
				const snap = root.WWMapSql.parseMapSql(text);
				if (!snap.uid.length) throw new Error(`No villages parsed (${snap.skipped} lines skipped)`);
				const meta = { host, t: now, hash, bytes: text.length, skipped: snap.skipped, ...root.WWMapSql.summarize(snap) };
				await deps.store.add(meta, snap);
				metas.push(meta);
				status.changed = true;
			}
			const excess = metas.length - deps.cap;
			if (excess > 0) await deps.store.remove(metas.slice(0, excess).map((m) => m.id));
			status.snapshots = Math.min(metas.length, deps.cap);
			status.lastChangeAt = metas[metas.length - 1].t;
		} catch (err) {
			status.error = err && err.message ? err.message : String(err);
		}
		return status;
	}

	// Live-mode hook: a logged-in session can query same-origin
	// POST /api/v1/graphql (401 without a session). Not used in v1.
	// Return null to fall back to map.sql only.
	async function fetchLive(_host) {
		return null;
	}

	root.WWCore = { normalizeHost, normalizeSettings, sha256Hex, pollHost, fetchLive, DEFAULT_SETTINGS, MIN_INTERVAL, MAX_INTERVAL };
})(globalThis);
