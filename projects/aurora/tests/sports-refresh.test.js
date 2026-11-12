import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
import vm from "node:vm";

test("queued forced sports refreshes run one at a time", async () => {
  let active = 0,
    maximum = 0,
    calls = 0;
  const release = [];
  const unexpected = () => {
    throw new Error("Unexpected external operation");
  };
  const mocks = {
    electron: { Notification: {}, shell: {} },
    "node:path": { join },
    "node:fs": {
      existsSync: () => false,
      readFileSync: unexpected,
      writeFileSync: unexpected,
      renameSync: unexpected,
    },
    "node:child_process": { spawn: unexpected },
    "../src/core/boxscore.js": {},
    "../src/core/streams.js": { STREAM_HOST: "invalid.example" },
    "../src/core/sports.js": {
      emptySports: () => ({ events: {}, errors: {}, sent: {} }),
      refreshSports: async (data) => {
        calls++;
        maximum = Math.max(maximum, ++active);
        await new Promise((resolve) =>
          release.push(() => {
            active--;
            resolve();
          }),
        );
        return { next: data, changed: false };
      },
    },
  };
  // Load the real coordinator while replacing only its module boundaries.
  const source = readFileSync(new URL("../electron/sports.js", import.meta.url), "utf8")
    .replace(
      /^import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];/gm,
      (_, names, id) => `const {${names}} = mocks[${JSON.stringify(id)}];`,
    )
    .replace(/^export (const|function)/gm, "$1");
  const context = { mocks, process: { env: {} }, console, URL };
  vm.runInNewContext(source + "\nthis.make = createSports;", context);
  const sports = context.make({ dataDir: "unused", onChange() {} });
  const pending = [sports.refresh({}), sports.refresh({}, true), sports.refresh({}, true)];
  while (release.length) {
    release.shift()();
    await nextTurn();
  }
  await Promise.all(pending);
  assert.equal(calls, 3, "each forced request must finish its refresh");
  assert.equal(maximum, 1, "downloads must never overlap");
});
