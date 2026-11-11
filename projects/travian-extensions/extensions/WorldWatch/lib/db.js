// IndexedDB snapshot store. Summaries ("meta") and columnar data ("data")
// live in separate object stores so listing history stays cheap.
(function (root) {
	"use strict";

	const DB_NAME = "worldwatch";
	const DB_VERSION = 1;
	let dbPromise = null;

	function req(request) {
		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	function open() {
		if (dbPromise) return dbPromise;
		dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			request.onupgradeneeded = () => {
				const db = request.result;
				const meta = db.createObjectStore("meta", { keyPath: "id", autoIncrement: true });
				meta.createIndex("host", "host");
				db.createObjectStore("data", { keyPath: "id" });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => {
				dbPromise = null;
				reject(request.error);
			};
		});
		return dbPromise;
	}

	function done(tx) {
		return new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
		});
	}

	// Metas for one host, oldest first.
	async function list(host) {
		const db = await open();
		const rows = await req(db.transaction("meta").objectStore("meta").index("host").getAll(host));
		return rows.sort((a, b) => a.t - b.t);
	}

	async function getData(id) {
		const db = await open();
		const row = await req(db.transaction("data").objectStore("data").get(id));
		return row ? row.snap : null;
	}

	async function add(meta, snap) {
		const db = await open();
		const tx = db.transaction(["meta", "data"], "readwrite");
		const id = await req(tx.objectStore("meta").add(meta));
		tx.objectStore("data").put({ id, snap });
		await done(tx);
		return id;
	}

	async function remove(ids) {
		if (!ids.length) return;
		const db = await open();
		const tx = db.transaction(["meta", "data"], "readwrite");
		for (const id of ids) {
			tx.objectStore("meta").delete(id);
			tx.objectStore("data").delete(id);
		}
		await done(tx);
	}

	root.WWDb = { list, getData, add, remove };
})(globalThis);
