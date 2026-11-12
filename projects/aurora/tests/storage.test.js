import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../electron/storage.js";
test("atomic persistence survives reopening and corruption uses the last valid backup", () => {
  const folder = mkdtempSync(join(tmpdir(), "daybook-test-"));
  try {
    const store = openStore(folder);
    const state = store.read();
    state.settings.theme = "dark";
    store.write(state);
    store.write(state);
    assert.equal(openStore(folder).read().settings.theme, "dark");
    writeFileSync(join(folder, "daybook.json"), "{broken");
    const restored = openStore(folder);
    assert.equal(restored.read().settings.theme, "dark");
    assert.match(restored.warning, /backup/i);
    assert.equal(readFileSync(join(folder, "daybook.json"), "utf8"), "{broken");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
