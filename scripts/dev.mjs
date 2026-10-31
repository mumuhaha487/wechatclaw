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
  const mount = await fs.mkdtemp(path.join(os.tmpdir(), "qqclaw-dev-image-"));
  // Copy from the read-only installer into a stable development directory.
  let mounted = false;
  try {
    execFileSync("/usr/bin/hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, path.resolve("release/macos/QQClaw.dmg")]);
    mounted = true;
    await fs.rm(path.join(directory, "QQClaw.app"), { recursive: true, force: true });
    execFileSync("/usr/bin/ditto", [path.join(mount, "QQClaw.app"), path.join(directory, "QQClaw.app")]);
  } finally {
    if (mounted) execFileSync("/usr/bin/hdiutil", ["detach", mount]);
    await fs.rmdir(mount);
  }
  execFileSync("/usr/bin/open", [path.join(directory, "QQClaw.app")]);
}
const child = mac ? null : spawn(path.resolve("release", "QQClaw.exe"), [], {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
});
child?.unref();
