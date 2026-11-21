// Chrome loads this script in an offscreen document. Firefox loads it in its
// background page, where it can play audio without opening a game tab.
"use strict";
let settlementAudio;

async function playSettlementAudio() {
	if (!settlementAudio) {
		settlementAudio = new Audio("alarm.mp3");
		settlementAudio.loop = true;
	}
	try {
		if (settlementAudio.paused) await settlementAudio.play();
		return { played: true };
	} catch (error) {
		return { played: false, error: error.message };
	}
}

function stopSettlementAudio() {
	if (!settlementAudio) return;
	settlementAudio.pause();
	settlementAudio.currentTime = 0;
}

if (location.pathname === "/offscreen.html") {
	chrome.runtime.onMessage.addListener((message, _sender, respond) => {
		if (message?.target !== "nsc-offscreen" || message.action !== "PLAY_ALARM")
			return false;
		playSettlementAudio().then(respond);
		return true;
	});
}
