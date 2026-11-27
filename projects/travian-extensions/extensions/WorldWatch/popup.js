// WorldWatch popup: watch list, interval and manual fetch.
(function () {
	"use strict";
	const api = globalThis.browser ?? chrome; // eslint-disable-line no-undef
	const KEYS = { hosts: "wwHosts", status: "wwStatus", settings: "wwSettings" };
	const $ = (id) => document.getElementById(id);
	let scanTab, scanTimer, scanRequest = 0;

	function ago(ts) {
		if (!ts) return "–";
		const min = Math.round((Date.now() - ts) / 60000);
		if (min < 1) return "now";
		if (min < 60) return `${min}m`;
		const h = Math.floor(min / 60);
		return h < 48 ? `${h}h ${min % 60}m` : `${Math.floor(h / 24)}d`;
	}

	function setMsg(text, isError) {
		$("msg").textContent = text || "";
		$("msg").classList.toggle("error", Boolean(isError));
	}

	async function prefillHost() {
		const [tab] = await api.tabs.query({ active: true, currentWindow: true }).catch(() => []);
		const host = WWCore.normalizeHost(tab?.url);
		const input = $("host-input");
		if (host && !input.value) input.value = host;
		const page = URL.parse(tab?.url || "");
		const scanPanel = $("map-scan");
		if (!scanPanel || !Number.isInteger(tab?.id) || !WWCore.canScanMap(page)) return;
		scanTab = tab.id;
		const x = page.searchParams.get("x"), y = page.searchParams.get("y");
		if (x !== null && y !== null) $("scan-centre").value = `${x}|${y}`;
		scanPanel.hidden = false;
		void scanAction("status");
	}

	async function scanAction(action) {
		const request = ++scanRequest;
		clearTimeout(scanTimer);
		$("scan-start").disabled = true;
		$("scan-stop").disabled = action !== "status";
		const state = await api.runtime.sendMessage({
			type: `ww-scan-${action}`, tabId: scanTab,
			...(action === "start" && { centre: $("scan-centre").value, radius: Number($("scan-radius").value) }),
		}).catch((err) => ({ error: err.message }));
		if (request !== scanRequest) return;
		const running = state?.state === "running";
		$("scan-start").hidden = running;
		$("scan-start").disabled = false;
		$("scan-stop").hidden = !running;
		$("scan-stop").disabled = false;
		$("scan-centre").disabled = $("scan-radius").disabled = running;
		const progress = state?.total ? `${state.saved} of ${state.total} map views saved.` : "";
		const status = $("scan-status");
		const message = [state?.error || ({ running: "Scanning…", complete: "Scan complete.", stopped: "Scan stopped." })[state?.state], progress].filter(Boolean).join(" ");
		if (status.textContent !== message) status.textContent = message;
		status.hidden = !message;
		status.classList.toggle("error", Boolean(state?.error));
		if (running) scanTimer = setTimeout(() => void scanAction("status"), 1000);
	}

	async function read() {
		const data = await api.storage.local.get([KEYS.hosts, KEYS.status, KEYS.settings]);
		return {
			hosts: Array.isArray(data[KEYS.hosts]) ? data[KEYS.hosts] : [],
			status: data[KEYS.status] || {},
			settings: WWCore.normalizeSettings(data[KEYS.settings]),
		};
	}

	function cell(text, title) {
		const td = document.createElement("td");
		td.textContent = text;
		if (title) td.title = title;
		return td;
	}

	async function render() {
		const { hosts, status, settings } = await read();
		const body = $("hosts");
		body.replaceChildren();
		for (const host of hosts) {
			const s = status[host] || {};
			const tr = document.createElement("tr");
			tr.append(cell(host), cell(String(s.snapshots ?? 0)), cell(ago(s.lastChangeAt)));
			const emptyMap = s.error === WWCore.EMPTY_MAP;
			const checked = emptyMap
				? cell(s.error, "Travian returned an empty map download. World Watch will check again.")
				: cell(s.error ? "error" : ago(s.lastCheckedAt), s.error || "");
			if (s.error && !emptyMap) checked.classList.add("error");
			tr.append(checked);
			const td = document.createElement("td");
			const rm = document.createElement("button");
			rm.type = "button";
			rm.className = "icon";
			rm.textContent = "✕";
			rm.setAttribute("aria-label", `Remove ${host}`);
			rm.addEventListener("click", () => removeHost(host));
			td.append(rm);
			tr.append(td);
			body.append(tr);
		}
		$("empty").hidden = hosts.length > 0;
		if (document.activeElement !== $("interval")) $("interval").value = settings.intervalMin;
	}

	async function addHost(event) {
		event.preventDefault();
		const host = WWCore.normalizeHost($("host-input").value);
		if (!host) {
			setMsg("Enter a host like ts4.x1.arabics.travian.com", true);
			return;
		}
		const { hosts } = await read();
		if (hosts.includes(host)) {
			setMsg("Already watched", true);
			return;
		}
		await api.storage.local.set({ [KEYS.hosts]: [...hosts, host] });
		$("host-input").value = "";
		setMsg("Fetching…");
		await render();
		await api.runtime.sendMessage({ type: "ww-poll", hosts: [host] });
		setMsg("");
	}

	async function removeHost(host) {
		if (!confirm(`Remove ${host} and its snapshots?`)) return;
		const { hosts, status } = await read();
		const { [host]: _gone, ...rest } = status;
		await api.storage.local.set({ [KEYS.hosts]: hosts.filter((h) => h !== host), [KEYS.status]: rest });
		try {
			const metas = await WWDb.list(host);
			await WWDb.remove(metas.map((m) => m.id));
		} catch (err) {
			setMsg(`Snapshots not deleted: ${err.message}`, true);
		}
		await render();
	}

	async function saveInterval() {
		const { settings } = await read();
		const next = WWCore.normalizeSettings({ ...settings, intervalMin: $("interval").value });
		$("interval").value = next.intervalMin;
		await api.storage.local.set({ [KEYS.settings]: next });
		await api.runtime.sendMessage({ type: "ww-settings" });
	}

	async function pollNow() {
		$("poll").disabled = true;
		setMsg("Fetching…");
		try {
			await api.runtime.sendMessage({ type: "ww-poll" });
			setMsg("");
		} catch (err) {
			setMsg(err.message, true);
		} finally {
			$("poll").disabled = false;
		}
	}

	$("add-form").addEventListener("submit", addHost);
	$("interval").addEventListener("change", saveInterval);
	$("poll").addEventListener("click", pollNow);
	$("open-dash").addEventListener("click", () => api.tabs.create({ url: api.runtime.getURL("dashboard.html") }));
	$("scan-form")?.addEventListener("submit", (event) => {
		event.preventDefault();
		void scanAction("start");
	});
	$("scan-stop")?.addEventListener("click", () => void scanAction("stop"));
	api.storage.onChanged.addListener((changes, area) => {
		if (area === "local" && (changes[KEYS.status] || changes[KEYS.hosts])) render();
	});
	prefillHost();
	render();
})();
