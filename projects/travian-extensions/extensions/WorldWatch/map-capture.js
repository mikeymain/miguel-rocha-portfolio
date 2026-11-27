// Isolated-world receiver for the page interceptor.
window.addEventListener("message", (event) => {
	if (event.source !== window || event.origin !== location.origin ||
		!WWCore.isMapPage(new URL(location.href)) || event.data?.type !== "ww-map-response") return;
	const { url, body } = event.data;
	const response = typeof url === "string" ? URL.parse(url) : null;
	if (response?.origin !== location.origin || typeof body !== "string" ||
		!body.length || body.length > WWCore.MAX_MAP_RESPONSE_CHARS) return;
	if (response.pathname === "/map.sql") {
		chrome.runtime.sendMessage({ type: "ww-map-sql", url, body }).catch(console.error);
		return;
	}
	if (!WWCroppers.mapResponseHost(url)) return;
	let payload;
	try {
		payload = JSON.parse(body);
	} catch {
		return;
	}
	const tiles = WWCroppers.mapTiles(payload);
	for (let i = 0; i < tiles.length; i += 2000) {
		chrome.runtime.sendMessage({ type: "ww-tile-batch", url, tiles: tiles.slice(i, i + 2000) }).catch(console.error);
	}
});
