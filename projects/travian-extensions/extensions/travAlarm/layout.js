/**
 * TravAlarm — widget layout: drag by the titlebar and apply the display
 * settings chosen in the toolbar popup (stored under UI_SETTINGS_KEY).
 * The popup (popup.js) keeps its own copy of these defaults and limits.
 */

const UI_SETTINGS_KEY = "_w4ui";
const UI_DEFAULTS = Object.freeze({
  width: 225,
  opacity: 100,
  accent: "#f5a623",
  startMinimized: false,
  left: null,
  top: null,
});
const UI_LIMITS = Object.freeze({
  widthMin: 200,
  widthMax: 360,
  opacityMin: 50,
  opacityMax: 100,
  edgeGap: 4,
  bottomGap: 10,
  minVisibleHeight: 40,
});
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (value === null || value === "" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeUiSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const pos = (v) => (Number.isFinite(v) ? v : null);
  return {
    width: clampNumber(s.width, UI_LIMITS.widthMin, UI_LIMITS.widthMax, UI_DEFAULTS.width),
    opacity: clampNumber(s.opacity, UI_LIMITS.opacityMin, UI_LIMITS.opacityMax, UI_DEFAULTS.opacity),
    accent: HEX_COLOR.test(s.accent || "") ? s.accent : UI_DEFAULTS.accent,
    startMinimized: s.startMinimized === true,
    left: pos(s.left),
    top: pos(s.top),
    colors: normalizeColors(s.colors),
  };
}

// Colour keys: section types from SECTION_META and "t:<Building>" from
// TRAINING_BUILDING_COLORS (both in ui.js). Unknown keys are dropped, so only
// known names ever reach the generated CSS.
function colorKeys() {
  return new Set([
    ...Object.keys(SECTION_META),
    ...TRAINING_BUILDING_COLORS.map(([b]) => `t:${b}`),
  ]);
}

function normalizeColors(raw) {
  if (!raw || typeof raw !== "object") return {};
  const known = colorKeys();
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (known.has(key) && HEX_COLOR.test(value)) out[key] = value;
  }
  return out;
}

function colorCss(colors) {
  return Object.entries(colors)
    .map(([key, color]) => {
      const card = `#_tw-w .tw-alarm[data-cat="${key}"] { --alarm-color: ${color}; }`;
      return key.startsWith("t:") ? card : `#_tw-w { --tw-sec-${key}: ${color}; }\n${card}`;
    })
    .join("\n");
}

function applyCategoryColors(widget, colors) {
  let style = widget.querySelector("#_tw-cc");
  if (!style) {
    style = document.createElement("style");
    style.id = "_tw-cc";
    widget.appendChild(style);
  }
  style.textContent = colorCss(colors);
}

function hexToGlow(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.12)`;
}

// Keeps the widget on screen and caps its height to the space below it.
function placeWidget(widget, left, top) {
  const rect = widget.getBoundingClientRect();
  const maxLeft = Math.max(UI_LIMITS.edgeGap, window.innerWidth - rect.width - UI_LIMITS.edgeGap);
  const maxTop = Math.max(UI_LIMITS.edgeGap, window.innerHeight - UI_LIMITS.minVisibleHeight);
  const x = Math.round(Math.min(maxLeft, Math.max(UI_LIMITS.edgeGap, left)));
  const y = Math.round(Math.min(maxTop, Math.max(UI_LIMITS.edgeGap, top)));
  widget.style.left = `${x}px`;
  widget.style.top = `${y}px`;
  widget.style.right = "auto";
  widget.style.maxHeight = `min(950px, calc(100vh - ${y + UI_LIMITS.bottomGap}px))`;
  return { left: x, top: y };
}

function clearWidgetPlacement(widget) {
  widget.style.left = "";
  widget.style.top = "";
  widget.style.right = "";
  widget.style.maxHeight = "";
}

function applyUiSettings(widget, settings) {
  widget.style.setProperty("--tw-width", `${settings.width}px`);
  widget.style.setProperty("--tw-accent", settings.accent);
  widget.style.setProperty("--tw-accent-glow", hexToGlow(settings.accent));
  widget.style.opacity = settings.opacity < 100 ? String(settings.opacity / 100) : "";
  applyCategoryColors(widget, settings.colors);
  if (settings.left === null || settings.top === null) clearWidgetPlacement(widget);
  else placeWidget(widget, settings.left, settings.top);
}

async function saveWidgetPosition(pos) {
  const res = await api.storage.local.get({ [UI_SETTINGS_KEY]: {} });
  const next = { ...res[UI_SETTINGS_KEY], left: pos.left, top: pos.top };
  await api.storage.local.set({ [UI_SETTINGS_KEY]: next });
}

function enableTitlebarDrag(widget) {
  const bar = widget.querySelector(".tw-titlebar");
  if (!bar) return;
  let drag = null;

  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    const rect = widget.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top, pos: null };
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    widget.classList.add("is-dragging");
    drag.pos = placeWidget(widget, e.clientX - drag.dx, e.clientY - drag.dy);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { pos } = drag;
    drag = null;
    widget.classList.remove("is-dragging");
    if (pos) saveWidgetPosition(pos).catch(() => {});
  };
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
}

/**
 * Wires drag-to-move and live display settings onto the widget.
 * @param {HTMLElement} widget
 * @param {() => void} minimize - minimizes the widget (for "start minimized")
 */
async function initWidgetLayout(widget, minimize) {
  enableTitlebarDrag(widget);
  let settings = normalizeUiSettings(null);
  try {
    const res = await api.storage.local.get({ [UI_SETTINGS_KEY]: {} });
    settings = normalizeUiSettings(res[UI_SETTINGS_KEY]);
  } catch {
    // Storage unavailable: keep the defaults.
  }
  applyUiSettings(widget, settings);
  if (settings.startMinimized) minimize();

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[UI_SETTINGS_KEY]) return;
    settings = normalizeUiSettings(changes[UI_SETTINGS_KEY].newValue);
    applyUiSettings(widget, settings);
  });
  window.addEventListener("resize", () => {
    if (settings.left !== null && settings.top !== null) {
      placeWidget(widget, settings.left, settings.top);
    }
  });
}
