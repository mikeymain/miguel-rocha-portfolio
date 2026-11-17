// DevTools receives responses from the inspected tab while it is open.
chrome.devtools.network.onRequestFinished.addListener((entry) => {
	const url = entry.request.url;
	if (!WWCroppers.mapResponseHost(url) || entry.response.status !== 200) return;
	entry.getContent((body, encoding) => {
		let payload;
		try {
			const text = encoding === "base64" ? new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0))) : body;
			payload = JSON.parse(text);
		} catch {
			return;
		}
		const tiles = WWCroppers.mapTiles(payload);
		if (tiles.length) chrome.runtime.sendMessage({ type: "ww-tile-batch", url, tiles }).catch(console.error);
	});
});
