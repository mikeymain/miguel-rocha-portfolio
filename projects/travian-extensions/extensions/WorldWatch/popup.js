// WorldWatch popup: watch list, interval and manual fetch.
(function () {
	"use strict";
	const api = globalThis.browser ?? chrome; // eslint-disable-line no-undef
	const KEYS = { hosts: "wwHosts", status: "wwStatus", settings: "wwSettings" };
	const $ = (id) => document.getElementById(id);

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
			const checked = cell(s.error ? "error" : ago(s.lastCheckedAt), s.error || "");
			if (s.error) checked.classList.add("error");
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
	api.storage.onChanged.addListener((changes, area) => {
		if (area === "local" && (changes[KEYS.status] || changes[KEYS.hosts])) render();
	});
	render();
})();
