import fs from "node:fs/promises";
import path from "node:path";

const exists = file => fs.stat(file).then(value => value.isFile(), () => false);
export async function bundledBrowser(runtimeDirectory, { platform = process.platform, arch = process.arch } = {}) {
  if (!runtimeDirectory) return null;
  const root = path.join(runtimeDirectory, "official-browser", ...(platform === "darwin" ? [arch] : []));
  if (!await exists(path.join(root, "runtime.json"))) return null;
  const manifest = JSON.parse(await fs.readFile(path.join(root, "runtime.json"), "utf8"));
  if (manifest.version !== 1 || manifest.platform !== platform || !["win32", "darwin"].includes(platform) || !/^[\d.]+$/.test(manifest.vendorVersion)) throw new Error("内置浏览运行库版本无效。");
  if (platform === "darwin") {
    if (manifest.arch !== arch || manifest.includesBrowserCli !== true) throw new Error("内置 Mac 浏览运行库架构不匹配。");
    const inside = name => {
      if (typeof name !== "string" || !name.length) throw new Error("内置 Mac 浏览组件路径缺失。");
      const file = path.resolve(root, name);
      if (!file.startsWith(root + path.sep)) throw new Error("内置 Mac 浏览组件路径无效。");
      return file;
    };
    const paths = Object.fromEntries(["nodePath", "nodeReplPath", "browserServicePath", "browserClientPath", "codexCliPath"].map(key => [key, inside(manifest.paths?.[key])]));
    paths.nodeModuleDirs = (manifest.paths.nodeModuleDirs || []).map(inside);
    const host = inside(manifest.paths.host);
    const extension = { path: path.join(root, "extension"), id: "hehggadaopoacecdllhhajmbjkdcmajg", version: manifest.extensionVersion };
    if (!paths.nodeModuleDirs.length || (await Promise.all([...Object.values(paths).filter(value => typeof value === "string"), host, path.join(extension.path, "manifest.json")].map(exists))).some(value => !value))
      throw new Error("内置 Mac 浏览运行库不完整，请重新安装 QQClaw。");
    return { available: true, bundled: true, platform, root, paths, extension, host, version: manifest.vendorVersion };
  }
  const paths = {
    nodePath: path.join(root, "node/bin/node.exe"), nodeReplPath: path.join(root, "node/bin/node_repl.exe"),
    nodeModuleDirs: [path.join(root, "node/bin/node_modules")],
    browserServicePath: path.join(root, "plugin/scripts/browser-service.mjs"), browserClientPath: path.join(root, "plugin/scripts/browser-client.mjs"),
  };
  const extension = { path: path.join(root, "extension"), id: "hehggadaopoacecdllhhajmbjkdcmajg", version: manifest.extensionVersion };
  const host = path.join(root, "plugin/extension-host/windows/x64/extension-host.exe");
  if ((await Promise.all([paths.nodePath, paths.nodeReplPath, paths.browserServicePath, paths.browserClientPath, host, path.join(extension.path, "manifest.json")].map(exists))).some(value => !value))
    throw new Error("内置浏览运行库不完整，请重新解压或更新 QQClaw。");
  return { available: true, bundled: true, platform, root, paths, extension, host, version: manifest.vendorVersion };
}

const macNativeHosts = new Map();
export async function bundledNativeHost(installation, executable, own) {
  const mac = installation.platform === "darwin";
  const hostHome = mac ? path.dirname(own) : own;
  const directory = path.join(hostHome, "native-host", installation.version);
  if (!mac) return writeNativeHost(installation, executable, hostHome, directory);
  let pending = macNativeHosts.get(directory);
  if (!pending) {
    pending = writeNativeHost(installation, executable, hostHome, directory).catch(error => { macNativeHosts.delete(directory); throw error; });
    macNativeHosts.set(directory, pending);
  }
  return pending;
}
async function writeNativeHost(installation, executable, hostHome, directory) {
  await fs.mkdir(directory, { recursive: true });
  const mac = installation.platform === "darwin";
  const host = path.join(directory, mac ? "ChatGPT for Chrome" : "extension-host.exe");
  if (!await exists(host)) await fs.copyFile(installation.host, host);
  if (mac) { await fs.chmod(host, 0o755); await fs.mkdir(path.join(hostHome, "codex"), { recursive: true }); }
  // This is the upstream host's documented installManifest configuration,
  // containing only our paths. No Desktop identity, live pipe or login is copied.
  await fs.writeFile(path.join(directory, "extension-host-config.json"), JSON.stringify({
    schemaVersion: 1, channel: "prod", codexCliPath: mac ? installation.paths.codexCliPath : executable,
    ...(mac ? { codexHome: path.join(hostHome, "codex") } : {}),
    browserClientPath: installation.paths.browserClientPath, nodePath: installation.paths.nodePath,
    nodeReplPath: installation.paths.nodeReplPath, proxyHost: "127.0.0.1", proxyPort: 0,
  }));
  const manifest = path.join(directory, "com.openai.codexextension.json");
  await fs.writeFile(manifest, JSON.stringify({ name: "com.openai.codexextension", type: "stdio",
    description: "QQClaw bundled official ChatGPT host", path: host,
    allowed_origins: ["chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/"] }));
  return manifest;
}
