import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { emptyState } from "../src/core/calendar.js";
import { validateBackup } from "../src/core/actions.js";

export function openStore(folder) {
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "daybook.json"),
    backup = `${file}.bak`;
  let state = emptyState(),
    warning = "";
  if (existsSync(file)) {
    try {
      state = validateBackup(JSON.parse(readFileSync(file, "utf8")));
    } catch {
      if (!existsSync(backup))
        throw new Error(
          `Aurora could not read its data. Your original file has been preserved: ${file}`,
        );
      state = validateBackup(JSON.parse(readFileSync(backup, "utf8")));
      warning = "Recovered the last valid backup. The unreadable original was preserved.";
    }
  }
  return {
    warning,
    read: () => structuredClone(state),
    write(value) {
      const valid = validateBackup(value);
      if (existsSync(file)) {
        if (warning) {
          copyFileSync(file, `${file}.damaged-${Date.now()}`);
          warning = "";
        } else copyFileSync(file, backup);
      }
      writeFileSync(`${file}.tmp`, JSON.stringify(valid, null, 2), { mode: 0o600, flush: true });
      renameSync(`${file}.tmp`, file);
      state = structuredClone(valid);
    },
  };
}
