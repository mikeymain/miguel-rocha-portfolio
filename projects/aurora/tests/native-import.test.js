import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { simpleParser } from "mailparser";
import { applyAction, validateBackup } from "../src/core/actions.js";
import { emptyState, collectDue, reconcileReminders } from "../src/core/calendar.js";
import { keepUsefulSuggestions } from "../src/core/imports.js";
import { enrichTimezones } from "../electron/google.js";

const calendar =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:import-test\r\nDTSTART:20991112T100000Z\r\nDTEND:20991112T110000Z\r\nSUMMARY:Imported meeting\r\nEND:VEVENT\r\nEND:VCALENDAR";

function nativeHandler(selection, parse = simpleParser) {
  const writes = [];
  const mocks = {
    electron: {
      app: {
        setPath() {},
        getPath: () => tmpdir(),
        setAppUserModelId() {},
        commandLine: { appendSwitch() {} },
        requestSingleInstanceLock: () => false,
        quit() {},
      },
      BrowserWindow: { getAllWindows: () => [] },
      dialog: { showOpenDialog: async () => selection },
    },
    "node:url": { fileURLToPath },
    "node:path": { dirname, join, extname },
    "node:fs": { readFileSync },
    mailparser: { simpleParser: parse },
    "./storage.js": {},
    "../src/core/actions.js": { applyAction, validateBackup },
    "../src/core/calendar.js": { collectDue, reconcileReminders },
    "../src/core/imports.js": { keepUsefulSuggestions },
    "./google.js": { enrichTimezones },
    "./icloud.js": {},
    "./icloud-write.js": {},
    "./sports.js": {},
  };
  const main = new URL("../electron/main.js", import.meta.url);
  // Execute the actual native handler with inert Electron boundaries and memory-only storage.
  const source = readFileSync(main, "utf8")
    .replace(
      /^import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];/gm,
      (_, names, id) => `const {${names}} = mocks[${JSON.stringify(id)}];`,
    )
    .replaceAll("import.meta.url", JSON.stringify(main.href));
  const context = {
    mocks,
    writes,
    initial: emptyState(),
    structuredClone,
    URL,
    process: { argv: [], env: {} },
    console,
  };
  vm.runInNewContext(
    source +
      '\nstate = initial; store = { warning: "", write: value => writes.push(structuredClone(value)) }; this.native = { handle, read: () => structuredClone(state) };',
    context,
  );
  return { ...context.native, writes };
}

function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), "aurora-import-test-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const valid = join(folder, "meeting.ics"),
    mail = join(folder, "message.eml"),
    invalid = join(folder, "no-birthdays.vcf");
  writeFileSync(valid, calendar);
  writeFileSync(mail, "From: example@example.com\r\nSubject: Hello\r\n\r\nJust saying hello.");
  writeFileSync(invalid, "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Example\r\nEND:VCARD");
  return { valid, mail, invalid };
}

test("native file import preserves changes saved while email parsing is pending", async (t) => {
  const files = fixture(t);
  let release, started;
  const parsing = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const native = nativeHandler(
    { canceled: false, filePaths: [files.valid, files.mail] },
    async (...args) => {
      started();
      await gate;
      return simpleParser(...args);
    },
  );
  const importing = native.handle({ type: "importFile" });
  try {
    await parsing;
    await native.handle({ type: "settings", settings: { theme: "dark" } });
  } finally {
    release();
  }
  await importing;
  assert.equal(native.read().settings.theme, "dark");
  assert.equal(native.read().events.length, 1);
  assert.equal(native.read().events[0].externalId, "import-test");
});

test("a native import batch with an invalid file leaves all saved data unchanged", async (t) => {
  const files = fixture(t);
  const native = nativeHandler({ canceled: false, filePaths: [files.valid, files.invalid] });
  await native.handle({ type: "settings", settings: { theme: "dark" } });
  const before = native.read();
  const saved = native.writes.length;
  await assert.rejects(native.handle({ type: "importFile" }), /birthday/i);
  assert.deepEqual(native.read(), before);
  assert.equal(native.writes.length, saved);
});

test("cancelling native file selection does not mutate or save data", async () => {
  const native = nativeHandler({ canceled: true, filePaths: ["must-not-be-read.eml"] });
  const before = native.read();
  await native.handle({ type: "importFile" });
  assert.deepEqual(native.read(), before);
  assert.equal(native.writes.length, 0);
});
