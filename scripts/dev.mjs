import "./build.mjs";
import { spawn } from "node:child_process";
import path from "node:path";
const mac = process.platform === "darwin";
if (mac) {
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const directory = path.join(os.homedir(), "Library/Caches/QQClaw/dev");
  await fs.mkdir(directory, { recursive: true });
  // Unpack to a stable development directory outside the source tree.
  await fs.rm(path.join(directory, "QQClaw.app"), { recursive: true, force: true });
  execFileSync("/usr/bin/ditto", ["-x", "-k", path.resolve("release/macos/QQClaw.zip"), directory]);
  execFileSync("/usr/bin/open", [path.join(directory, "QQClaw.app")]);
}
const child = mac ? null : spawn(path.resolve("release", "QQClaw.exe"), [], {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
});
child?.unref();
