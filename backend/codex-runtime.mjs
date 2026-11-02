import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const resolutions = new Map();
export const CODEX_SOURCES = ["auto", "desktop", "cli", "custom"];

export function codexEnvironment(source = process.env) {
  return { ...source, QQCLAW_REMOTE: "1", CODEX_WECHAT_REMOTE: "1" };
}

export function resolveCodex(options = {}) {
  const { configured = "", source = configured ? "custom" : "auto", env = process.env } = options;
  if (!CODEX_SOURCES.includes(source)) return Promise.reject(new Error("Codex 来源无效。"));
  const key = JSON.stringify([source, configured, options.platform || process.platform,
    env.PATH, env.LOCALAPPDATA, env.APPDATA, env.CODEX_APP_RUNTIME_CLI_PATH]);
  const cached = resolutions.get(key);
  const cacheable = !options.fsImpl && !options.execImpl && !options.home && !options.node;
  if (cacheable && !options.refresh && cached && cached.expires > Date.now()) return cached.promise;
  const promise = discover({ ...options, configured, source, env });
  if (cacheable) {
    const entry = { promise, expires: Date.now() + 30000 };
    resolutions.set(key, entry);
    promise.catch(() => { if (resolutions.get(key) === entry) resolutions.delete(key); });
  }
  return promise;
}

async function discover({ configured, source, env, platform = process.platform,
  home = os.homedir(), node = process.execPath, fsImpl = fs, execImpl = exec }) {
  const windows = platform === "win32", paths = windows ? path.win32 : path.posix;
  const desktop = [], cli = [], seen = new Set();
  const join = (...parts) => paths.join(...parts);
  const add = (list, candidate) => { if (candidate) list.push(candidate); };
  const local = env.LOCALAPPDATA, roaming = env.APPDATA;
  const hint = env.CODEX_APP_RUNTIME_CLI_PATH;
  const desktopPath = (candidate) => windows
    ? /[\\/]OpenAI[\\/]Codex[\\/]|[\\/]Codex[\\/]resources[\\/]/i.test(candidate)
    : /\.app\/Contents\//.test(candidate);
  if (source === "custom") {
    if (!configured.trim()) throw new Error("请选择 Codex 程序路径。");
    cli.push(configured.trim());
  } else {
    if (windows) {
      if (local) {
        const root = join(local, "OpenAI", "Codex", "bin");
        const versions = [];
        try {
          for (const entry of await fsImpl.readdir(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const file = join(root, entry.name, "codex.exe");
            try { versions.push({ file, time: (await fsImpl.stat(file)).mtimeMs }); } catch {}
          }
        } catch {}
        versions.sort((a, b) => b.time - a.time);
        desktop.push(...versions.map((v) => v.file), join(root, "codex.exe"),
          join(local, "Programs", "OpenAI", "Codex", "bin", "codex.exe"),
          join(local, "Programs", "Codex", "resources", "codex.exe"));
      }
    } else {
      for (const directory of ["/Applications", join(home, "Applications")]) {
        for (const app of ["Codex.app", "ChatGPT.app"]) desktop.push(join(directory, app, "Contents", "Resources", "codex"));
      }
    }
    add(hint && desktopPath(hint) ? desktop : cli, hint);
    const directories = [...new Set([paths.dirname(node), ...String(env.PATH || "").split(windows ? ";" : ":"),
      ...(windows ? [] : ["/opt/homebrew/bin", "/usr/local/bin", join(home, ".npm-global/bin"), join(home, ".volta/bin")])].filter(Boolean))];
    for (const directory of directories) {
      for (const name of windows ? ["codex.exe", "codex.cmd", "codex"] : ["codex"]) {
        const candidate = join(directory.replace(/^"|"$/g, ""), name);
        if (!desktopPath(candidate)) cli.push(candidate);
      }
    }
    if (roaming) cli.push(join(roaming, "npm", "node_modules", "@openai", "codex", "bin", "codex.js"));
    cli.push(join(paths.dirname(node), "node_modules", "@openai", "codex", "bin", "codex.js"),
      join(home, ".npm-global", "lib", "node_modules", "@openai", "codex", "bin", "codex.js"));
  }
  const groups = source === "desktop" ? [["desktop", desktop]] : source === "cli" || source === "custom"
    ? [[source, cli]] : [["desktop", desktop], ["cli", cli]];
  for (const [kind, candidates] of groups) {
    for (let candidate of candidates) {
      if (/\.(cmd|ps1)$/i.test(candidate)) candidate = join(paths.dirname(candidate), "node_modules", "@openai", "codex", "bin", "codex.js");
      try {
        candidate = await fsImpl.realpath(candidate);
        const key = windows ? candidate.toLowerCase() : candidate;
        if (seen.has(key) || !(await fsImpl.stat(candidate)).isFile()) continue;
        seen.add(key);
        // A symlink in PATH can point back into Desktop; explicit CLI excludes it.
        if (source === "cli" && desktopPath(candidate)) continue;
        const js = /\.[cm]?js$/i.test(candidate);
        if (!windows && !js) await fsImpl.access(candidate, 1);
        const { stdout } = await execImpl(js ? node : candidate, js ? [candidate, "--version"] : ["--version"],
          { env: codexEnvironment(env), timeout: 5000, maxBuffer: 32768, windowsHide: true });
        const version = String(stdout).split(/\r?\n/).find((s) => /^codex(?:-cli)?\s+\d/i.test(s.trim()))?.trim();
        if (!version) continue;
        return { path: candidate, version, source: kind };
      } catch {}
    }
  }
  // npm prefixes can be customized. Query only after known locations fail.
  if (source !== "desktop" && source !== "custom") {
    try {
      const npm = join(paths.dirname(node), "node_modules", "npm", "bin", "npm-cli.js");
      const { stdout } = await execImpl(node, [npm, "root", "--global"], { env: codexEnvironment(env), timeout: 6000, windowsHide: true, maxBuffer: 32768 });
      const candidate = join(stdout.trim(), "@openai", "codex", "bin", "codex.js");
      const result = await discover({ configured: candidate, source: "custom", env, platform, home, node, fsImpl, execImpl });
      return { ...result, source: "cli" };
    } catch {}
  }
  throw new Error(source === "desktop" ? "未检测到可用的 Desktop 运行程序，请安装并启动 Codex Desktop，或切换为自动检测 / CLI。"
    : source === "custom" ? "所选文件无法运行 Codex --version，请重新选择可用的 Codex 程序。"
    : source === "cli" ? "未检测到独立 Codex CLI，请一键安装，或切换为自动检测。"
    : "未检测到可用的 Codex Desktop 运行程序或 CLI，请在运行环境中配置。");
}

export async function findCodex(configured = "", env = process.env, source = configured ? "custom" : "auto") {
  return (await resolveCodex({ configured, env, source })).path;
}
