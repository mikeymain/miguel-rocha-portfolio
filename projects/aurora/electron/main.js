import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  dialog,
  shell,
  safeStorage,
  powerMonitor,
} from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { simpleParser } from "mailparser";
import { openStore } from "./storage.js";
import { applyAction, validateBackup } from "../src/core/actions.js";
import { collectDue, reconcileReminders } from "../src/core/calendar.js";
import { keepUsefulSuggestions } from "../src/core/imports.js";
import { connectGoogle, syncGoogle, enrichTimezones } from "./google.js";
import { syncICloud } from "./icloud.js";
import { changeICloudEvent } from "./icloud-write.js";
import { createSports, SPORTS_LINK_HOSTS } from "./sports.js";

const root = dirname(fileURLToPath(import.meta.url));
const rendererFile = join(root, "../dist/index.html");
const iconFile = join(root, "../assets/daybook.png");
const smoke = process.argv.includes("--smoke-test");
// The app was renamed from Daybook (then Daybreak) to Aurora. Keep the original data folder so
// existing events, accounts and settings stay where they are.
const DATA_FOLDER_NAME = "Daybook";
app.setPath(
  "userData",
  smoke
    ? join(app.getPath("temp"), `daybook-smoke-${Date.now()}`)
    : join(app.getPath("appData"), DATA_FOLDER_NAME),
);
const registerLogin = (openAtLogin) =>
  app.setLoginItemSettings({
    openAtLogin,
    path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    args: ["--hidden"],
  });
app.setAppUserModelId("local.daybook.calendar");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let mainWindow,
  alarmWindow,
  tray,
  store,
  sports,
  state,
  secrets = {},
  googleCache = {},
  quitting = false,
  syncing = false,
  connecting = false;
const secretFile = () => join(app.getPath("userData"), "accounts.encrypted");
const cacheFile = () => join(app.getPath("userData"), "calendar-cache.json");
// Previous versions of every event Aurora changes on iCloud, so any change can be undone by hand.
const icloudChangeLog = () => join(app.getPath("userData"), "icloud-changes.jsonl");
function saveSecrets() {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error(
      "Windows credential protection is unavailable. Account credentials were not saved.",
    );
  writeFileSync(secretFile(), safeStorage.encryptString(JSON.stringify(secrets)), {
    mode: 0o600,
    flush: true,
  });
}
function publicState() {
  return {
    ...state,
    desktop: true,
    syncing,
    connecting,
    storageWarning: store.warning,
    dataPath: app.getPath("userData"),
    sports: sports?.snapshot(),
  };
}
function broadcast() {
  for (const window of BrowserWindow.getAllWindows())
    if (!window.isDestroyed()) window.webContents.send("daybook:state", publicState());
}
function persist(next = state) {
  store.write(next);
  state = next;
  broadcast();
  updateAlarmWindow();
}
function makeWindow(options = {}) {
  const window = new BrowserWindow({
    width: 1460,
    height: 960,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: "#ffffff",
    title: "Aurora",
    icon: iconFile,
    autoHideMenuBar: true,
    show: false,
    ...options,
    webPreferences: {
      preload: join(root, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !smoke,
      offscreen: smoke,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url.split("#")[0] !== new URL(`file://${rendererFile.replaceAll("\\", "/")}`).href)
      event.preventDefault();
  });
  window.webContents.on("did-fail-load", (_, code, description) =>
    console.error(`Aurora renderer failed: ${code} ${description}`),
  );
  window.loadFile(rendererFile, options.alarm ? { hash: "ringing" } : undefined);
  if (!smoke) window.once("ready-to-show", () => window.show());
  return window;
}
function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = makeWindow();
  mainWindow.show();
  mainWindow.focus();
}
function ringing() {
  return Object.values(state.alarmState).filter((r) => r.status === "ringing");
}
function updateAlarmWindow() {
  if (ringing().length) {
    if (!alarmWindow || alarmWindow.isDestroyed()) {
      alarmWindow = makeWindow({
        width: 480,
        height: 580,
        minWidth: 400,
        minHeight: 460,
        alwaysOnTop: true,
        alarm: true,
        title: "Aurora — Alarm",
      });
      alarmWindow.on("close", (event) => {
        if (!quitting && ringing().length) {
          event.preventDefault();
          alarmWindow.flashFrame(true);
        }
      });
    }
    if (!smoke) {
      alarmWindow.show();
      alarmWindow.setAlwaysOnTop(true, "screen-saver");
      alarmWindow.flashFrame(true);
    }
  } else if (alarmWindow && !alarmWindow.isDestroyed()) {
    alarmWindow.destroy();
    alarmWindow = null;
  }
}
function tick() {
  try {
    const due = collectDue(state);
    if (!due.length) {
      updateAlarmWindow();
      return;
    }
    const next = structuredClone(state);
    for (const alarm of due) next.alarmState[alarm.key] = { ...alarm, status: "ringing" };
    // Persist before opening the alarm window so a restart cannot schedule duplicates.
    persist(next);
  } catch (error) {
    console.error("Alarm check failed:", error.message);
  }
}
function clearInvalidRinging(next) {
  reconcileReminders(next);
}
async function applySyncResult(account, result) {
  const next = structuredClone(state);
  const { mergeInvitations } = await import("../src/core/imports.js");
  next.events = mergeInvitations(
    next.events,
    result.events.filter((e) => e.externalId),
  );
  for (const suggestion of result.suggestions)
    if (!next.suggestions.some((s) => s.id === suggestion.id)) next.suggestions.push(suggestion);
  next.accounts = [...next.accounts.filter((a) => a.id !== account.id), result.account];
  clearInvalidRinging(next);
  secrets[account.id] = result.tokens;
  saveSecrets();
  googleCache[account.id] = result.cache;
  writeFileSync(cacheFile(), JSON.stringify(googleCache), { mode: 0o600 });
  persist(next);
}
async function doSync(accountId) {
  if (syncing) throw new Error("A sync is already running.");
  syncing = true;
  broadcast();
  try {
    for (const account of state.accounts.filter((a) => !accountId || a.id === accountId)) {
      try {
        if (!secrets[account.id]) throw new Error("Reconnect this account to restore its access.");
        const result =
          account.provider === "icloud"
            ? await syncICloud(account, secrets[account.id], state)
            : await syncGoogle(
                account,
                secrets[account.id],
                structuredClone(googleCache[account.id] || {}),
                state,
              );
        // Apply network results to the current state, preserving edits made while syncing.
        await applySyncResult(account, result);
      } catch (error) {
        const next = structuredClone(state);
        next.accounts = next.accounts.map((a) =>
          a.id === account.id ? { ...a, error: error.message } : a,
        );
        persist(next);
        if (accountId) throw error;
      }
    }
  } finally {
    syncing = false;
    broadcast();
    tick();
  }
  return publicState();
}

// Sends edits, deletions and new events for iCloud calendars to iCloud first; returns null for
// Aurora-only events. Syncing is blocked during the write so the two can't interleave.
async function saveToICloud(action) {
  const previous = state.events.find((e) => e.id === (action.item?.id ?? action.id));
  const accountId =
    previous?.source?.type === "icloud-calendar"
      ? previous.source.accountId
      : !previous && action.type === "saveEvent"
        ? action.item?.saveTo?.accountId
        : null;
  if (!accountId) return null;
  if (syncing) throw new Error("Wait for the current sync to finish, then try again.");
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account || !secrets[accountId])
    throw new Error("Reconnect iCloud from Accounts before changing this event.");
  syncing = true;
  broadcast();
  try {
    const apply = await changeICloudEvent({
      action,
      previous,
      account,
      credentials: secrets[accountId],
      logFile: icloudChangeLog(),
    });
    persist(apply(state));
  } catch (error) {
    syncing = false;
    // A failed write may still have reached iCloud (e.g. a timeout), so always refresh from iCloud.
    await doSync(accountId).catch((e) => console.error(e.message));
    throw error;
  } finally {
    syncing = false;
    broadcast();
  }
  // Refresh from iCloud so Aurora holds the version tag iCloud assigned to the change.
  await doSync(accountId).catch((e) => console.error(e.message));
  tick();
  return publicState();
}

async function handle(action) {
  if (!action || typeof action.type !== "string") throw new Error("Invalid Aurora request.");
  switch (action.type) {
    case "getState":
      return publicState();
    case "boxScore": {
      if (typeof action.gameId !== "string" || action.gameId.length > 80)
        throw new Error("Choose a game.");
      return { box: await sports.boxScore(action.gameId) };
    }
    case "openStream": {
      if (typeof action.gameId !== "string" || action.gameId.length > 80)
        throw new Error("Choose a game.");
      await sports.openStream(action.gameId, state.settings);
      return publicState();
    }
    case "searchTeams": {
      const query = typeof action.query === "string" ? action.query.trim() : "";
      if (query.length < 2 || query.length > 60)
        throw new Error("Type 2 to 60 characters to search.");
      return { results: await sports.search(query) };
    }
    case "refreshSports":
      await sports.refresh(state.settings, true);
      return publicState();
    case "openExternal": {
      const url = new URL(action.url);
      if (
        url.protocol !== "https:" ||
        ![
          "mail.google.com",
          "calendar.google.com",
          "console.cloud.google.com",
          "developers.google.com",
          "myaccount.google.com",
          "account.apple.com",
          "support.apple.com",
          "www.icloud.com",
          ...SPORTS_LINK_HOSTS,
        ].includes(url.hostname)
      )
        throw new Error("This link is not a supported account destination.");
      await shell.openExternal(url.href);
      return publicState();
    }
    case "connectGoogle": {
      if (connecting) throw new Error("A Google sign-in is already open in your browser.");
      if (!safeStorage.isEncryptionAvailable())
        throw new Error("Windows credential protection is unavailable.");
      connecting = true;
      broadcast();
      try {
        const result = await connectGoogle({
          clientId: action.clientId?.trim(),
          clientSecret: action.clientSecret?.trim(),
          openExternal: (url) => shell.openExternal(url),
        });
        const id = `google:${result.email}`;
        secrets[id] = result.tokens;
        saveSecrets();
        const next = structuredClone(state);
        next.settings.googleClientId = action.clientId.trim();
        const previous = next.accounts.find((a) => a.id === id);
        next.accounts = [
          ...next.accounts.filter((a) => a.id !== id),
          {
            ...previous,
            id,
            email: result.email,
            provider: "google",
            error: "",
          },
        ];
        persist(next);
        await doSync(id);
      } finally {
        connecting = false;
        broadcast();
      }
      return publicState();
    }
    case "connectICloud": {
      if (connecting || syncing)
        throw new Error("Wait for the current connection or sync to finish.");
      if (!safeStorage.isEncryptionAvailable())
        throw new Error("Windows credential protection is unavailable.");
      const username = String(action.email || "").trim(),
        password = String(action.password || "").trim();
      if (!username.includes("@") || !password)
        throw new Error("Enter your Apple Account email and an app-specific password.");
      connecting = true;
      broadcast();
      try {
        const id = `icloud:${username.toLowerCase()}`;
        const previous = state.accounts.find((a) => a.id === id);
        const account = {
          ...previous,
          id,
          email: username,
          provider: "icloud",
        };
        const result = await syncICloud(account, { username, password }, state);
        await applySyncResult(account, result);
        tick();
      } finally {
        connecting = false;
        broadcast();
      }
      return publicState();
    }
    case "disconnectAccount":
    case "disconnectGoogle": {
      if (syncing) throw new Error("Wait for the current sync to finish before disconnecting.");
      const next = structuredClone(state);
      next.accounts = next.accounts.filter((a) => a.id !== action.id);
      delete secrets[action.id];
      delete googleCache[action.id];
      saveSecrets();
      writeFileSync(cacheFile(), JSON.stringify(googleCache), { mode: 0o600 });
      persist(next);
      return publicState();
    }
    case "selectCalendars": {
      if (syncing) throw new Error("Wait for the current sync to finish.");
      const next = structuredClone(state),
        account = next.accounts.find((a) => a.id === action.id);
      if (!account) throw new Error("Account not found.");
      account.selectedCalendars = action.ids.filter((id) =>
        account.calendars?.some((c) => c.id === id),
      );
      persist(next);
      return publicState();
    }
    case "sync":
      return doSync(action.id);
    case "saveEvent":
    case "deleteEvent": {
      const remote = await saveToICloud(action);
      if (remote) return remote;
      const next = applyAction(state, action);
      persist(next);
      tick();
      return publicState();
    }
    case "importFile": {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Import calendars, birthdays, or email",
        filters: [
          {
            name: "Calendars, contacts, or email",
            extensions: ["ics", "vcf", "eml"],
          },
        ],
        properties: ["openFile", "multiSelections"],
      });
      if (result.canceled) return publicState();
      const imports = [];
      for (const file of result.filePaths) {
        const buffer = readFileSync(file);
        if (buffer.length > 25 * 1024 * 1024) throw new Error("Choose a file smaller than 25 MB.");
        if (extname(file).toLowerCase() === ".vcf")
          imports.push({
            type: "importBirthdays",
            text: buffer.toString("utf8"),
            source: { name: file.split(/[\\/]/).pop() },
          });
        else if (extname(file).toLowerCase() === ".ics")
          imports.push({
            type: "importCalendar",
            text: enrichTimezones(buffer.toString("utf8")),
            source: { type: "calendar-file", name: file.split(/[\\/]/).pop() },
          });
        else {
          const mail = await simpleParser(buffer, { skipImageLinks: true });
          let invitation = false;
          for (const attachment of mail.attachments || [])
            if (
              attachment.contentType === "text/calendar" ||
              /\.ics$/i.test(attachment.filename || "")
            ) {
              imports.push({
                type: "importCalendar",
                text: enrichTimezones(attachment.content.toString("utf8")),
                source: { subject: mail.subject, from: mail.from?.text },
              });
              invitation = true;
            }
          if (!invitation)
            imports.push({
              type: "importText",
              mail: {
                subject: mail.subject,
                text: mail.text,
                from: mail.from?.text,
                sourceId: mail.messageId || file,
              },
            });
        }
      }
      // Parsing email yields to other requests; apply the batch to the latest saved state.
      persist(imports.reduce((next, action) => applyAction(next, action), state));
      tick();
      return publicState();
    }
    case "exportBackup": {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `daybreak-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "Aurora backup", extensions: ["json"] }],
      });
      if (!result.canceled) {
        const backup = structuredClone(state);
        backup.accounts = [];
        writeFileSync(result.filePath, JSON.stringify(backup, null, 2));
      }
      return publicState();
    }
    case "restoreBackup": {
      const result = await dialog.showOpenDialog(mainWindow, {
        filters: [{ name: "Aurora backup", extensions: ["json"] }],
        properties: ["openFile"],
      });
      if (result.canceled) return publicState();
      const backup = validateBackup(JSON.parse(readFileSync(result.filePaths[0], "utf8")));
      const confirm = await dialog.showMessageBox(mainWindow, {
        type: "question",
        message: "Replace your calendar and alarms with this backup?",
        detail:
          "Your current data will be kept as the automatic backup. Google connections will remain connected.",
        buttons: ["Cancel", "Restore backup"],
        defaultId: 0,
        cancelId: 0,
      });
      if (confirm.response === 1) {
        backup.accounts = state.accounts;
        persist(backup);
        tick();
      }
      return publicState();
    }
    case "chooseSound": {
      const result = await dialog.showOpenDialog(mainWindow, {
        filters: [{ name: "Alarm sound", extensions: ["mp3", "wav", "ogg"] }],
        properties: ["openFile"],
      });
      if (!result.canceled) {
        const file = result.filePaths[0],
          audio = readFileSync(file);
        if (audio.length > 8 * 1024 * 1024) throw new Error("Choose a sound smaller than 8 MB.");
        const next = structuredClone(state),
          mime = {
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".ogg": "audio/ogg",
          }[extname(file).toLowerCase()];
        next.settings.customSound = {
          name: file.split(/[\\/]/).pop(),
          data: `data:${mime};base64,${audio.toString("base64")}`,
        };
        next.settings.sound = "custom";
        persist(next);
      }
      return publicState();
    }
    case "testAlarm": {
      const next = structuredClone(state),
        key = `test:${Date.now()}`;
      next.alarmState[key] = {
        key,
        title: "This is your alarm",
        kind: "test",
        start: new Date().toISOString(),
        sound: state.settings.sound,
        status: "ringing",
      };
      persist(next);
      return publicState();
    }
    default: {
      let next = applyAction(state, action);
      if (action.type === "settings" && action.settings.startAtLogin != null)
        registerLogin(Boolean(next.settings.startAtLogin));
      persist(next);
      tick();
      return publicState();
    }
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", showMain);
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("window-all-closed", () => {});
  app.whenReady().then(async () => {
    try {
      store = openStore(app.getPath("userData"));
      state = store.read();
      sports = createSports({
        dataDir: app.getPath("userData"),
        onChange: broadcast,
        offline: smoke,
      });
      // Re-register so start-at-login points at this executable after a rename or move.
      if (!smoke && state.settings?.startAtLogin) registerLogin(true);
      // Drop email suggestions that are now in the past or would not pass today's scanning rules.
      const usefulSuggestions = keepUsefulSuggestions(state.suggestions);
      if (!smoke && usefulSuggestions.length !== state.suggestions.length) {
        state = { ...state, suggestions: usefulSuggestions };
        store.write(state);
      }
      if (existsSync(secretFile())) {
        try {
          secrets = JSON.parse(safeStorage.decryptString(readFileSync(secretFile())));
        } catch {
          state.accounts = state.accounts.map((a) => ({
            ...a,
            error: "Windows could not unlock this account. Reconnect from Accounts.",
          }));
        }
      }
      if (existsSync(cacheFile())) {
        try {
          googleCache = JSON.parse(readFileSync(cacheFile(), "utf8"));
        } catch {
          googleCache = {};
        }
      }
      ipcMain.handle("daybook:request", async (event, action) => {
        if (
          !BrowserWindow.getAllWindows().some((w) => w.webContents === event.sender) ||
          !event.senderFrame?.url.startsWith("file:")
        )
          throw new Error("Untrusted request.");
        return handle(action);
      });
      mainWindow = makeWindow();
      mainWindow.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          mainWindow.hide();
        }
      });
      const icon = nativeImage.createFromPath(iconFile).resize({ width: 20, height: 20 });
      tray = new Tray(icon);
      tray.setToolTip("Aurora — Calendar & alarms");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Open Aurora", click: showMain },
          {
            label: "Check email and calendar",
            click: () => doSync().catch((error) => console.error(error.message)),
          },
          { type: "separator" },
          { label: "Quit Aurora", click: () => app.quit() },
        ]),
      );
      tray.on("double-click", showMain);
      powerMonitor.on("resume", tick);
      powerMonitor.on("unlock-screen", tick);
      setInterval(tick, 1000);
      const refreshSports = () =>
        sports
          .refresh(state.settings)
          .catch((error) => console.error("Sports refresh failed:", error.message));
      setInterval(() => sports.checkAlerts(state.settings), 15_000);
      setInterval(refreshSports, 60_000);
      refreshSports();
      setInterval(() => {
        if (state.accounts.length && !syncing)
          doSync().catch((error) => console.error(error.message));
      }, 5 * 60000);
      tick();
      if (state.accounts.length && !smoke) doSync().catch((error) => console.error(error.message));
      if (process.argv.includes("--hidden"))
        mainWindow.once("ready-to-show", () => mainWindow.hide());
      if (smoke) {
        mainWindow.webContents.once("did-finish-load", async () => {
          try {
            const title = await mainWindow.webContents.executeJavaScript("document.title");
            const body = await mainWindow.webContents.executeJavaScript(
              "new Promise(resolve => setTimeout(() => resolve(document.body.innerText), 500))",
            );
            if (!body.includes("Aurora") || !body.includes("Calendar"))
              throw new Error("The main interface did not render.");
            const { nativeSmoke } = await import("./smoke.js");
            await nativeSmoke({
              mainWindow,
              handle,
              getAlarmWindow: () => alarmWindow,
              getState: () => state,
              tick,
              app,
            });
            await handle({ type: "testAlarm" });
            await new Promise((resolve) =>
              alarmWindow.webContents.once("did-finish-load", resolve),
            );
            const alarmBody = await alarmWindow.webContents.executeJavaScript(
              "new Promise(resolve => setTimeout(() => resolve(document.body.innerText), 500))",
            );
            if (!alarmBody.includes("This is your alarm"))
              throw new Error("Alarm window did not render.");
            console.log(
              JSON.stringify({
                ok: true,
                title,
                alarmWindow: true,
                isolatedRenderer: mainWindow.webContents.getLastWebPreferences().contextIsolation,
              }),
            );
            app.exit(0);
          } catch (error) {
            console.error(error);
            app.exit(1);
          }
        });
      }
    } catch (error) {
      console.error(error.message);
      if (!smoke) dialog.showErrorBox("Aurora could not start", error.message);
      app.exit(1);
    }
  });
}
