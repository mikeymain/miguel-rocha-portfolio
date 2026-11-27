// Runs in the page world. Observe responses without consuming the caller's body.
(() => {
	"use strict";
	if (!["/map", "/karte.php"].includes(location.pathname)) return;

	const origin = location.origin;
	const maxBodyChars = 16 * 1024 * 1024;
	const liveCapture = location.hostname !== "ts1.x1.europe.travian.com";
	const wanted = (value, status) => {
		if (status !== 200) return false;
		const url = URL.parse(value);
		return url?.origin === origin && (url.pathname === "/map.sql" ||
			(liveCapture && /^(?:\/api\/v\d+)?\/map\/position$/.test(url.pathname)));
	};
	const publish = (url, body) => {
		if (typeof body === "string" && body.length <= maxBodyChars) {
			window.postMessage({ type: "ww-map-response", url, body }, origin);
		}
	};

	const fetch = window.fetch;
	window.fetch = function (...args) {
		const request = Reflect.apply(fetch, this, args);
		request.then(async (response) => {
			if (wanted(response.url, response.status)) {
				publish(response.url, await response.clone().text());
			}
		}).catch(() => {}); // Capture failures must not affect the page request.
		return request;
	};

	const send = XMLHttpRequest.prototype.send;
	XMLHttpRequest.prototype.send = function (...args) {
		const onLoadEnd = () => {
			if (!wanted(this.responseURL, this.status)) return;
			try {
				const type = this.responseType;
				if (type === "" || type === "text") publish(this.responseURL, this.responseText);
				if (type === "json") publish(this.responseURL, JSON.stringify(this.response));
			} catch {
				// Capture failures must not affect the page request.
			}
		};
		this.addEventListener("loadend", onLoadEnd, { once: true });
		try {
			return Reflect.apply(send, this, args);
		} catch (err) {
			this.removeEventListener("loadend", onLoadEnd);
			throw err;
		}
	};
})();
