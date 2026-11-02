import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { bundledBrowser, bundledNativeHost } from "./bundled-browser.mjs";
import { matchMacBrowserProfile } from "./macos-browser-identity.mjs";

const exec = promisify(execFile);
export const officialExtensionId = "hehggadaopoacecdllhhajmbjkdcmajg";
const present = file => fs.stat(file).then(value => value.isFile(), () => false);
const extensionId = key => createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32)
  .replace(/[0-9a-f]/g, value => String.fromCharCode(97 + parseInt(value, 16)));

// Prefer the packaged original components. The legacy Windows discovery reads
// installation paths only; never Desktop credentials or live worker identity.
export async function discoverOfficialBrowser({ platform = process.platform, env = process.env, home = os.homedir(), runtimeDirectory = env.QQCLAW_RUNTIME_DIR } = {}) {
  if (!["win32", "darwin"].includes(platform) || platform === "darwin" && env.QQCLAW_MAC_BROWSER_READY !== "1") return { available: false, reason: "当前 macOS 网页内核尚未接通官方 ChatGPT 扩展。" };
  try { const bundled = await bundledBrowser(runtimeDirectory, { platform }); if (bundled) return { ...bundled, home }; }
  catch (error) { return { available: false, reason: error.message }; }
  if (platform === "darwin") return { available: false, reason: "此 Mac 架构的官方浏览运行库尚未内置。" };
  const local = env.LOCALAPPDATA;
  if (!local) return { available: false, reason: "未找到官方浏览器运行组件的安装目录。" };
  let registry;
  try { registry = JSON.parse(await fs.readFile(path.join(local, "OpenAI/Codex/chrome-native-hosts-v2.json"), "utf8")); }
  catch { return { available: false, reason: "未检测到官方浏览器运行组件，请先安装官方 Codex 浏览器插件。" }; }
  let runtime;
  for (const entry of registry.entries || []) {
    const paths = entry.paths;
    if (!paths || ![paths.nodeReplPath, paths.nodePath, paths.browserServicePath, paths.browserClientPath].every(file => typeof file === "string" && path.isAbsolute(file))) continue;
    if ((await Promise.all([paths.nodeReplPath, paths.nodePath, paths.browserServicePath, paths.browserClientPath].map(present))).some(value => !value)) continue;
    if (!Array.isArray(paths.nodeModuleDirs) || !paths.nodeModuleDirs.length || paths.nodeModuleDirs.some(file => typeof file !== "string" || !path.isAbsolute(file))) continue;
    runtime = { paths, version: String(entry.appVersion || "") }; break;
  }
  if (!runtime) return { available: false, reason: "官方浏览器运行组件不完整，请通过官方插件安装入口修复。" };
  const extensionRoots = [path.join(local, "Google/Chrome/User Data"), path.join(local, "Microsoft/Edge/User Data")];
  let extension;
  for (const root of extensionRoots) {
    const profiles = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const profile of profiles.filter(item => item.isDirectory() && /^(Default|Profile \d+)$/.test(item.name))) {
      const directory = path.join(root, profile.name, "Extensions", officialExtensionId);
      const versions = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of versions.filter(item => item.isDirectory()).sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))) {
        try {
          const source = path.join(directory, entry.name), manifest = JSON.parse(await fs.readFile(path.join(source, "manifest.json"), "utf8"));
          if (manifest.manifest_version !== 3 || !manifest.key || extensionId(manifest.key) !== officialExtensionId || !manifest.permissions?.includes("nativeMessaging")) continue;
          extension = { path: source, id: officialExtensionId, version: manifest.version }; break;
        } catch {}
      }
      if (extension) break;
    }
    if (extension) break;
  }
  if (!extension) return { available: false, reason: "未检测到官方 ChatGPT 浏览器扩展，请先从官方商店安装。" };
  return { available: true, ...runtime, extension, home };
}

export async function prepareOfficialBrowser({ session, executable, directory, native, discovery = discoverOfficialBrowser, execImpl = exec }) {
  const installation = await discovery();
  if (!installation.available) return installation;
  const { paths, extension } = installation;
  const own = path.join(directory, "browser-runtime", session.id);
  const isolated = { CODEX_HOME: path.join(own, "codex"), LOCALAPPDATA: path.join(own, "local"), APPDATA: path.join(own, "roaming"),
    TEMP: path.join(own, "temp"), TMP: path.join(own, "temp") };
  await Promise.all(Object.values(isolated).map(file => fs.mkdir(file, { recursive: true })));
  const nativeHostManifest = installation.bundled ? await bundledNativeHost(installation, executable, own) : "";
  const profile = createHash("sha256").update(`qqclaw-official:${session.id}`).digest("hex").slice(0, 32);
  const page = await native("browser.control", { action: "prepareOfficial", owner: session.id, profile,
    extensionPath: extension.path, extensionId: extension.id,
    ...(nativeHostManifest ? { nativeHostManifest, nativeLocalAppData: isolated.LOCALAPPDATA, nativeCodexHome: isolated.CODEX_HOME } : {}) });
  const browserFamily = page?.engine === "cef" ? "chrome" : page?.engine === "webview2" ? "edge" : null;
  if (!browserFamily || page.browserFamily !== browserFamily || typeof page.tabCreation !== "boolean" ||
    page?.extensionId !== officialExtensionId || !Number.isSafeInteger(page.browserProcessId) || page.browserProcessId <= 0 ||
    !Number.isSafeInteger(page.applicationProcessId) || page.applicationProcessId <= 0)
    throw new Error("应用内官方扩展未返回有效的所属进程，已拒绝连接其他浏览器。");
  // This helper reads kernel handle names only after checking both publishers
  // and the exact QQClaw -> owned browser -> official native-host process chain.
  const mac = installation.platform === "darwin";
  if (typeof page.applicationPath !== "string" || !path.isAbsolute(page.applicationPath) || !mac && !/\.exe$/i.test(page.applicationPath)) throw new Error("浏览器所属的原生程序路径无效。");
  let stdout;
  let transport;
  if (mac) {
    const expectedProfile = path.join(directory, "browser-profiles", profile);
    const identityUrl = "about:blank#qqclaw-profile-" + profile;
    if (page.nativeProfileDirectory !== expectedProfile || page.identityUrl !== identityUrl) throw new Error("Mac 官方浏览器未确认本会话的独立配置目录。");
    const manifest = JSON.parse(await fs.readFile(nativeHostManifest, "utf8"));
    transport = await matchMacBrowserProfile({ installation, identityUrl, sessionId: session.id, directory: own,
      browserPid: page.browserProcessId, applicationPid: page.applicationProcessId, nativeHost: manifest.path });
  } else {
  try {
    ({ stdout } = await execImpl(page.applicationPath, ["--official-browser-pipes", String(page.browserProcessId), String(page.applicationProcessId), paths.nodeReplPath, ...(nativeHostManifest ? [nativeHostManifest] : [])],
      { windowsHide: true, timeout: 15000, maxBuffer: 65536, encoding: "utf8" }));
  } catch (error) {
    let report; try { report = JSON.parse(error.stdout); } catch {}
    throw new Error(report?.reason || "无法验证本会话的官方扩展进程和数字签名。");
  }
  transport = JSON.parse(stdout);
  if (!transport.verified || transport.engine !== page.engine || transport.browserPid !== page.browserProcessId || transport.applicationPid !== page.applicationProcessId ||
    transport.paths?.length !== 1 || !/^\\\\\.\\pipe\\codex-browser-use\\[a-f0-9-]{36}$/i.test(transport.paths[0]))
    throw new Error("无法唯一确认本会话的官方扩展通道，已拒绝连接其他浏览器。");
  }
  const env = {
    ...isolated,
    CODEX_CLI_PATH: mac ? paths.codexCliPath : executable,
    NODE_REPL_NODE_PATH: paths.nodePath,
    NODE_REPL_NODE_MODULE_DIRS: paths.nodeModuleDirs.join(path.delimiter),
    NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ browser: paths.browserServicePath }),
    NODE_REPL_TRUSTED_CODE_PATHS: [path.resolve(paths.browserServicePath, "../.."), ...paths.nodeModuleDirs].join(path.delimiter),
    CUA_REPL_ENABLED_SURFACES: "browser",
    BROWSER_USE_BACKEND_PATHS: transport.paths[0],
  };
  return { available: true, identity: JSON.stringify([page.engine, paths, extension.version, transport.paths[0]]),
    command: mac ? paths.nodePath : paths.nodeReplPath,
    args: mac ? [path.join(installation.root, "../../macos-official-mcp.cjs"), installation.root] : [],
    env, clientUrl: pathToFileURL(paths.browserClientPath).href, profile,
    platform: installation.platform || process.platform, engine: page.engine, browserFamily, tabCreation: page.tabCreation };
}

export function officialBrowserArguments(configuration, accessEnvironment) {
  if (!configuration?.available) return [];
  const env = { ...configuration.env, ...accessEnvironment };
  const tomlEnv = `{${Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(",")}}`;
  return ["-c", `mcp_servers.node_repl={enabled=true,required=true,command=${JSON.stringify(configuration.command)},args=${JSON.stringify(configuration.args || [])},env=${tomlEnv},startup_timeout_sec=30,tool_timeout_sec=300}`];
}

export function officialBrowserInstructions(configuration) {
  if (!configuration?.available) return '当前内置浏览器扩展未连接。可按任务需要使用可用的浏览器、Playwright、CDP、HTTP 请求或其他工具完成网页任务。';
  return `已配置应用内浏览器，优先使用官方 ChatGPT 扩展。首次调用 const { setupBrowserRuntime } = await import(${JSON.stringify(configuration.clientUrl)}); const agent = await setupBrowserRuntime(); 然后通过 agent.browsers.list() 选择 extension 浏览器，并阅读 browser.documentation()。已有 REPL 句柄可直接沿用。官方扩展未连接或能力不足时，可以使用其他可用浏览器、Playwright、CDP、HTTP 请求等方式继续任务；按需要读取和写入文件。下载按实际工具 API 操作，交付时返回真实文件路径。`;
}
