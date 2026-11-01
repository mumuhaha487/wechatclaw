import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

export function browserUrl(value) {
  const url = new URL(String(value || ""));
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hostname === "qqclaw.local")
    throw new Error("网页预览仅支持不含登录凭据的 HTTP/HTTPS 网页。");
  return url.href;
}

// Never inherit a parent worker's browser services. A prepared QQClaw-owned
// official runtime may explicitly override node_repl after these arguments.
export function browserIsolationArguments() {
  return ["browser", "unified-computer-use", "chrome", "computer-use"]
    .flatMap((name) => ["-c", `plugins.${name}@openai-bundled.enabled=false`])
    .concat(["-c", 'mcp_servers.node_repl={enabled=false,command="node"}',
      "-c", 'mcp_servers.qqclaw_browser={enabled=false,command="node"}']);
}

// This viewer is called only by explicit UI actions. It is not exposed to Codex
// as automation, an official extension, or a fallback to that extension.
export class BrowserViewer {
  constructor({ native, session }) { Object.assign(this, { native, session }); }
  call(action, args = {}) {
    if (action === "open" || action === "restoreTab" && args.url) args = { ...args, url: browserUrl(args.url) };
    return this.native("browser.control", { ...args, action, owner: this.session.id,
      profile: createHash("sha256").update(this.session.accountId || this.session.id).digest("hex").slice(0, 32),
      workspace: this.session.workspace });
  }
}

// Installation is not authorization or connectivity. Check only official store
// IDs, and report all three states separately. No host identity/token is read.
export async function officialBrowserStatus({ platform = process.platform, env = process.env, home = os.homedir(), fsImpl = fs } = {}) {
  const ids = ["hehggadaopoacecdllhhajmbjkdcmajg", "odlomjlbamekndcpllcnffbgeohgkmjh"];
  const roots = platform === "win32" ? [
    ["Google Chrome", path.join(env.LOCALAPPDATA || home, "Google/Chrome/User Data")],
    ["Microsoft Edge", path.join(env.LOCALAPPDATA || home, "Microsoft/Edge/User Data")],
  ] : platform === "darwin" ? [
    ["Google Chrome", path.join(home, "Library/Application Support/Google/Chrome")],
    ["Microsoft Edge", path.join(home, "Library/Application Support/Microsoft Edge")],
  ] : [];
  const browsers = [];
  for (const [name, root] of roots) {
    let profiles;
    try { profiles = await fsImpl.readdir(root, { withFileTypes: true }); }
    catch (error) { browsers.push({ name, installed: false, detection: error.code === "ENOENT" ? "absent" : "unknown" }); continue; }
    let installed = false, unknown = false;
    for (const profile of profiles.filter(e => e.isDirectory() && /^(Default|Profile \d+)$/.test(e.name))) {
      for (const id of ids) {
        const directory = path.join(root, profile.name, "Extensions", id);
        try {
          const versions = await fsImpl.readdir(directory, { withFileTypes: true });
          for (const version of versions.filter(v => v.isDirectory())) {
            try {
              const manifest = JSON.parse(await fsImpl.readFile(path.join(directory, version.name, "manifest.json"), "utf8"));
              if (manifest.manifest_version && manifest.version) installed = true;
            } catch { unknown = true; }
          }
        } catch (error) { if (error.code !== "ENOENT") unknown = true; }
      }
    }
    browsers.push({ name, installed, detection: installed ? "installed" : unknown ? "unknown" : "absent" });
  }
  return { connected: false, available: false, browsers,
    reason: "当前会话尚未检测官方扩展连接；安装检测不代表启用或连接成功。",
    documentation: "https://developers.openai.com/codex/chrome-extension",
    store: "https://chromewebstore.google.com/detail/chatgpt/hehggadaopoacecdllhhajmbjkdcmajg" };
}
