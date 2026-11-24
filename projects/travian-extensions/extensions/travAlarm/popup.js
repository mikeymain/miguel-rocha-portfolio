/**
 * TravAlarm toolbar popup: edits the panel display settings in
 * storage.local._w4ui. Open Travian tabs apply changes live (layout.js).
 * Keep the defaults and limits in sync with layout.js.
 */

const api = typeof browser !== "undefined" ? browser : chrome;
const UI_SETTINGS_KEY = "_w4ui";
const DEFAULTS = Object.freeze({ width: 225, opacity: 100, accent: "#f5a623", startMinimized: false });
const ACCENTS = Object.freeze([
  ["#f5a623", "Gold"],
  ["#34d399", "Green"],
  ["#60a5fa", "Blue"],
  ["#a78bfa", "Purple"],
  ["#f472b6", "Pink"],
  ["#f87171", "Red"],
]);
const STATUS_CLEAR_MS = 1500;
// Default colours mirror SECTION_META / TRAINING_BUILDING_COLORS in ui.js and
// the --tw-c-* values in content.css.
const SECTION_COLORS = Object.freeze([
  ["attack", "Attacks", "#f87171"],
  ["hero", "Hero", "#f5a623"],
  ["building", "Buildings", "#f97316"],
  ["farmlist", "Farm List", "#a78bfa"],
  ["storage", "Storage", "#fbbf24"],
  ["training", "Training", "#60a5fa"],
  ["culture", "Parties", "#10b981"],
  ["custom", "Custom", "#f472b6"],
  ["daily", "Daily", "#a3e635"],
  ["auto", "Preset", "#a78bfa"],
]);
const TRAINING_COLORS = Object.freeze([
  ["t:Great Barracks", "Great Barracks", "#22d3ee"],
  ["t:Great Stable", "Great Stable", "#f97316"],
  ["t:Barracks", "Barracks", "#60a5fa"],
  ["t:Stable", "Stable", "#c08a5b"],
  ["t:Workshop", "Workshop", "#a78bfa"],
  ["t:Academy", "Academy", "#34d399"],
  ["t:Smithy", "Smithy", "#f472b6"],
  ["t:Settlers", "Settlers", "#a3e635"],
  ["t:Trapper", "Trapper", "#2dd4bf"],
  ["t:Hospital", "Hospital", "#f87171"],
]);
const colorInputs = new Map();

const $ = (id) => document.getElementById(id);
const widthInput = $("set-width");
const opacityInput = $("set-opacity");
const minInput = $("set-min");
const accentGroup = $("set-accent");
let statusTimer = 0;

function showStatus(text) {
  $("status").textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => ($("status").textContent = ""), STATUS_CLEAR_MS);
}

async function readSettings() {
  const res = await api.storage.local.get({ [UI_SETTINGS_KEY]: {} });
  return { ...DEFAULTS, ...res[UI_SETTINGS_KEY] };
}

async function updateSettings(patch) {
  try {
    const current = await readSettings();
    await api.storage.local.set({ [UI_SETTINGS_KEY]: { ...current, ...patch } });
  } catch (error) {
    showStatus("Could not save. Reopen the popup.");
    console.warn("TravAlarm popup could not save settings", error);
  }
}

function render(s) {
  widthInput.value = s.width;
  $("out-width").textContent = `${s.width}px`;
  opacityInput.value = s.opacity;
  $("out-opacity").textContent = `${s.opacity}%`;
  minInput.checked = s.startMinimized === true;
  const colors = s.colors || {};
  for (const [key, { input, fallback }] of colorInputs) {
    input.value = colors[key] || fallback;
  }
  for (const btn of accentGroup.children) {
    const on = btn.dataset.color === s.accent;
    btn.setAttribute("aria-checked", String(on));
    btn.tabIndex = on ? 0 : -1;
  }
}

function buildSwatches() {
  for (const [color, name] of ACCENTS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.dataset.color = color;
    btn.style.background = color;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-label", name);
    btn.title = name;
    btn.addEventListener("click", async () => {
      await updateSettings({ accent: color });
      render(await readSettings());
    });
    accentGroup.appendChild(btn);
  }
}

function buildColorRows(container, rows) {
  for (const [key, label, fallback] of rows) {
    const id = `color-${key.replace(/[^a-z0-9]/gi, "-")}`;
    const row = document.createElement("label");
    row.className = "row";
    row.htmlFor = id;
    const name = document.createElement("span");
    name.textContent = label;
    const input = document.createElement("input");
    input.type = "color";
    input.id = id;
    input.value = fallback;
    input.addEventListener("input", async () => {
      const current = await readSettings();
      updateSettings({ colors: { ...(current.colors || {}), [key]: input.value } });
    });
    row.append(name, input);
    container.appendChild(row);
    colorInputs.set(key, { input, fallback });
  }
}

function bindInputs() {
  $("reset-colors").addEventListener("click", async () => {
    await updateSettings({ colors: {} });
    render(await readSettings());
    showStatus("Colors reset");
  });
  widthInput.addEventListener("input", () => {
    $("out-width").textContent = `${widthInput.value}px`;
    updateSettings({ width: Number(widthInput.value) });
  });
  opacityInput.addEventListener("input", () => {
    $("out-opacity").textContent = `${opacityInput.value}%`;
    updateSettings({ opacity: Number(opacityInput.value) });
  });
  minInput.addEventListener("change", () => updateSettings({ startMinimized: minInput.checked }));

  $("reset-pos").addEventListener("click", async () => {
    await updateSettings({ left: null, top: null });
    showStatus("Position reset");
  });
  $("reset-all").addEventListener("click", async () => {
    try {
      await api.storage.local.remove(UI_SETTINGS_KEY);
      render({ ...DEFAULTS });
      showStatus("Settings reset");
    } catch (error) {
      showStatus("Could not reset. Reopen the popup.");
      console.warn("TravAlarm popup could not reset settings", error);
    }
  });
}

buildSwatches();
buildColorRows($("colors-sections"), SECTION_COLORS);
buildColorRows($("colors-training"), TRAINING_COLORS);
bindInputs();
readSettings()
  .then(render)
  .catch(() => {
    render({ ...DEFAULTS });
    showStatus("Could not load settings.");
  });
