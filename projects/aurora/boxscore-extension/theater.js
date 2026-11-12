// Theater mode for the stream player: fills the browser window without going OS fullscreen.
(() => {
  const wrapper = document.getElementById("player-wrapper");
  if (!wrapper) return;
  const KEY = "sa-theater";
  const root = document.documentElement;

  const cornerBtn = document.createElement("button");
  cornerBtn.id = "sa-theater-btn";
  cornerBtn.type = "button";
  wrapper.append(cornerBtn);

  // also offer it next to the "Alternative Feeds" buttons, styled like them
  const feeds = document.querySelector(".stream-selector .stream-buttons");
  let feedBtn = null;
  if (feeds) {
    feedBtn = document.createElement("button");
    feedBtn.id = "sa-theater-feed-btn";
    feedBtn.type = "button";
    feedBtn.className = "stream-btn";
    feeds.append(feedBtn);
  }

  function set(on) {
    root.classList.toggle("sa-theater", on);
    cornerBtn.textContent = on ? "✕ Exit theater" : "⛶ Theater";
    cornerBtn.title = on ? "Exit theater mode (Esc)" : "Theater mode (T)";
    if (feedBtn) feedBtn.textContent = on ? "Exit theater" : "⛶ Theater mode";
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {}
  }
  const toggle = () => set(!root.classList.contains("sa-theater"));

  cornerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });
  feedBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });
  // keys only reach the page when the video frame doesn't have focus
  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, [contenteditable]")) return;
    if (e.key === "Escape" && root.classList.contains("sa-theater")) set(false);
    else if ((e.key === "t" || e.key === "T") && !e.ctrlKey && !e.metaKey && !e.altKey) toggle();
  });

  let saved = false;
  try {
    saved = localStorage.getItem(KEY) === "1";
  } catch {}
  set(saved); // remember theater mode between games
})();
