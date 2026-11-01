import fs from "node:fs/promises";
import path from "node:path";

const exists = file => fs.stat(file).then(value => value.isFile(), () => false);
export async function bundledBrowser(runtimeDirectory) {
  if (!runtimeDirectory) return null;
  const root = path.join(runtimeDirectory, "official-browser");
  if (!await exists(path.join(root, "runtime.json"))) return null;
  const manifest = JSON.parse(await fs.readFile(path.join(root, "runtime.json"), "utf8"));
  if (manifest.version !== 1 || manifest.platform !== "win32" || !/^[\d.]+$/.test(manifest.vendorVersion)) throw new Error("内置浏览运行库版本无效。");
  const paths = {
    nodePath: path.join(root, "node/bin/node.exe"), nodeReplPath: path.join(root, "node/bin/node_repl.exe"),
    nodeModuleDirs: [path.join(root, "node/bin/node_modules")],
    browserServicePath: path.join(root, "plugin/scripts/browser-service.mjs"), browserClientPath: path.join(root, "plugin/scripts/browser-client.mjs"),
  };
  const extension = { path: path.join(root, "extension"), id: "hehggadaopoacecdllhhajmbjkdcmajg", version: manifest.extensionVersion };
  const host = path.join(root, "plugin/extension-host/windows/x64/extension-host.exe");
  if ((await Promise.all([paths.nodePath, paths.nodeReplPath, paths.browserServicePath, paths.browserClientPath, host, path.join(extension.path, "manifest.json")].map(exists))).some(value => !value))
    throw new Error("内置浏览运行库不完整，请重新解压或更新 QQClaw。");
  return { available: true, bundled: true, paths, extension, host, version: manifest.vendorVersion };
}

export async function bundledNativeHost(installation, executable, own) {
  const directory = path.join(own, "native-host", installation.version);
  await fs.mkdir(directory, { recursive: true });
  const host = path.join(directory, "extension-host.exe");
  if (!await exists(host)) await fs.copyFile(installation.host, host);
  // This is the upstream host's documented installManifest configuration,
  // containing only our paths. No Desktop identity, live pipe or login is copied.
  await fs.writeFile(path.join(directory, "extension-host-config.json"), JSON.stringify({
    schemaVersion: 1, channel: "prod", codexCliPath: executable,
    browserClientPath: installation.paths.browserClientPath, nodePath: installation.paths.nodePath,
    nodeReplPath: installation.paths.nodeReplPath, proxyHost: "127.0.0.1", proxyPort: 0,
  }));
  const manifest = path.join(directory, "com.openai.codexextension.json");
  await fs.writeFile(manifest, JSON.stringify({ name: "com.openai.codexextension", type: "stdio",
    description: "QQClaw bundled official ChatGPT host", path: host,
    allowed_origins: ["chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/"] }));
  return manifest;
}
