import fs from "node:fs";
import path from "node:path";
import { safeError } from "./store.mjs";

export function createLogger(directory, secrets = () => [], { maxBytes = 1024 * 1024 } = {}) {
  return (level, error) => {
    try {
      const keys = secrets();
      const message = safeError(error?.logMessage || error, keys).replace(/[\r\n]+/g, " ");
      // Keep only stack frames, never the unfiltered error header or attached data.
      const frames = typeof error?.stack === "string" ? error.stack.split(/\r?\n/)
        .filter((line) => /^\s+at /.test(line)).slice(0, 5)
        .map((line) => safeError(line, keys).replace(/[\r\n]+/g, " ")) : [];
      const record = `${new Date().toISOString()} ${level} ${message}${frames.length ? "\n" + frames.join("\n") : ""}\n`;
      const logs = path.join(directory, "logs");
      const file = path.join(logs, "backend.log");
      fs.mkdirSync(logs, { recursive: true });
      let size = 0;
      try { size = fs.statSync(file).size; } catch {}
      if (size && size + Buffer.byteLength(record) >= maxBytes) {
        fs.rmSync(`${file}.2`, { force: true });
        if (fs.existsSync(`${file}.1`)) fs.renameSync(`${file}.1`, `${file}.2`);
        fs.renameSync(file, `${file}.1`);
      }
      fs.appendFileSync(file, record, { mode: 0o600 });
    } catch { /* Logging must never affect the backend. */ }
  };
}
