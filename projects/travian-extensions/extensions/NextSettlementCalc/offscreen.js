/**
 * Plays the target-reached alarm. Offscreen documents opened for
 * AUDIO_PLAYBACK are exempt from the autoplay policy, so the alarm sounds
 * without a click in a game tab, or with no game tab open at all. The worker
 * stops the sound by closing this document.
 */
"use strict";
let audio = null;
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
	if (message?.target !== "nsc-offscreen" || message.action !== "PLAY_ALARM")
		return;
	if (!audio) {
		audio = new Audio("alarm.mp3");
		audio.loop = true;
	}
	if (!audio.paused) {
		respond({ played: true });
		return;
	}
	audio.play().then(
		() => respond({ played: true }),
		(error) => respond({ played: false, error: error.message }),
	);
	return true;
});
