/**
 * Rank Tracker popup — backup export and restore.
 *
 * Depends on globals from format.js (`api`, `setStatus`) and utils.js
 * (`isTravianOrigin`).
 */

/**
 * Throw when `data` is not a valid tracker backup. Every stored key that the
 * tracker understands is checked; unknown keys pass through untouched.
 *
 * @param {object} data - Parsed backup JSON.
 * @throws {Error} "Invalid backup" on the first invalid field.
 */
function validateBackup(data) {
	const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	const requireValid = (valid) => { if (!valid) throw new Error("Invalid backup"); };
	const origin = isTravianOrigin;
	const snapshot = (value) => {
		requireValid(object(value) && Number.isFinite(value.timestamp) && value.timestamp > 0 && value.timestamp <= 8.64e15);
		for (const [key, field] of Object.entries(value)) {
			if (key === "top10") {
				requireValid(Array.isArray(field));
				for (const item of field) requireValid(object(item) &&
					["PvP of the week", "Defenders of the week", "PvE of the week", "Robbers of the week"].includes(item.label) &&
					Number.isFinite(item.rank) && item.rank > 0 && (item.val == null || Number.isFinite(item.val)));
			} else requireValid(field == null || Number.isFinite(field));
		}
	};
	requireValid(object(data) && origin(data.serverUrl));
	let hasSnapshots = false;
	for (const [key, value] of Object.entries(data)) {
		const match = /^(history|latest|baseline|firstSeen|gameStart|serverStart|lastFetchStatus)_(.+)$/.exec(key);
		if (match) {
			requireValid(origin(match[2]));
			if (match[1] === "history") {
				requireValid(Array.isArray(value));
				value.forEach(snapshot);
				hasSnapshots ||= value.length > 0;
			} else if (match[1] === "latest") { snapshot(value); hasSnapshots = true; }
			else if (match[1] === "baseline") {
				requireValid(object(value) && Number.isFinite(value.timestamp));
				snapshot(value.data);
			} else if (match[1] === "lastFetchStatus") requireValid(object(value) && Number.isFinite(value.timestamp) && typeof value.ok === "boolean" && typeof value.reason === "string");
			else requireValid(Number.isFinite(value) && value > 0);
		} else if (key === "serverUrls") requireValid(Array.isArray(value) && value.every(origin));
		else if (key === "velocityMode") requireValid(typeof value === "boolean");
		else if (key === "appZoom") requireValid(Number.isFinite(value) && value >= 0.5 && value <= 2);
		else if (key === "graphFilter") requireValid(["all", "daily"].includes(value));
		else if (key === "graphRange") requireValid([3, 6, 12, 24, 48, 72, 168].includes(value));
		else if (key === "graphZoom") requireValid(object(value) && Object.values(value).every(Number.isFinite));
		else if (key === "graphPrefs") requireValid(object(value) && Object.values(value).every((item) => typeof item === "boolean"));
		else if (key === "customGroups") requireValid(object(value) && Object.values(value).every((items) => Array.isArray(items) && items.every((item) => typeof item === "string")));
	}
	requireValid(hasSnapshots);
}

/** Download all stored tracker data as one JSON file. */
async function exportBackup() {
	try {
		const allData = await api.storage.local.get(null);
		const json = JSON.stringify(allData, null, 2);
		const filename = `travian_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
		const blobUrl = URL.createObjectURL(new Blob([json], { type: "application/json" }));

		// Firefox blocks programmatic <a download> clicks from extension popups.
		if (api.downloads) {
			await api.downloads.download({ url: blobUrl, filename, saveAs: false });
			setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
		} else {
			const a = Object.assign(document.createElement("a"), { href: blobUrl, download: filename });
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(blobUrl);
		}
	} catch {
		setStatus("Backup failed", "error");
	}
}

/**
 * Open the file picker. A popup closes when the picker takes focus, so the
 * picker runs from a full tab (`popup.html?action=import`) instead.
 */
async function openRestorePicker() {
	const currentTab = await api.tabs.getCurrent();
	if (currentTab) document.getElementById("file-input")?.click();
	else api.tabs.create({ url: api.runtime.getURL("popup.html?action=import") });
}

/**
 * Validate and write a parsed backup. Asks before deleting stored items that
 * the backup does not contain.
 *
 * @param {object} data - Parsed backup JSON.
 * @returns {Promise<boolean>} false when the user cancelled.
 */
async function applyBackup(data) {
	if (!data.serverUrl) {
		const historyKey = Object.keys(data).find((k) => k.startsWith("history_"));
		if (historyKey) data.serverUrl = historyKey.replace("history_", "");
	}

	validateBackup(data);
	for (const [key, value] of Object.entries(data)) {
		if (key.startsWith("history_")) value.sort((a, b) => a.timestamp - b.timestamp);
	}
	for (const key of Object.keys(data)) if (key.startsWith("raidIncome_")) delete data[key];

	let cancelled = false;
	await navigator.locks.request("rank-tracker-storage", async () => {
		const previous = await api.storage.local.get(null);
		const removed = Object.keys(previous).filter((key) => !(key in data));
		const servers = removed.filter((key) => key.startsWith("history_")).length;
		if (removed.length > 0 && !confirm(
			`This backup does not contain ${removed.length} saved item(s)` +
			(servers ? `, including history for ${servers} server(s)` : "") +
			". Restoring deletes them. Continue?",
		)) {
			cancelled = true;
			return;
		}
		await api.storage.local.set(data);
		await api.storage.local.remove(removed);
	});
	return !cancelled;
}

/** Handle a file chosen in #file-input. */
function onRestoreFile(e) {
	const file = e.target.files[0];
	if (!file) return;

	setStatus("Restoring…", "busy");
	const reader = new FileReader();
	reader.onload = async (ev) => {
		try {
			const applied = await applyBackup(JSON.parse(ev.target.result));
			if (!applied) {
				setStatus("Restore cancelled", "idle");
				return;
			}
			setStatus("Restored", "ok");
			setTimeout(() => (window.location.href = "popup.html"), 800);
		} catch {
			setStatus("Invalid file", "error");
		} finally {
			e.target.value = "";
		}
	};
	reader.onerror = () => setStatus("Could not read file", "error");
	reader.readAsText(file);
}

/** Wire the export and import buttons and the hidden file input. */
function initBackupRestore() {
	document.getElementById("btn-backup")?.addEventListener("click", exportBackup);
	document.getElementById("btn-restore")?.addEventListener("click", openRestorePicker);
	document.getElementById("file-input")?.addEventListener("change", onRestoreFile);
}
