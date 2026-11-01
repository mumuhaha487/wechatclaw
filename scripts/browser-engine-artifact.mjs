import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const cefVersion = "154.0.34+g14c5a08+chromium-154.0.8037.98";
const runtimeUrl = `https://cef-builds.spotifycdn.com/cef_binary_${encodeURIComponent(cefVersion)}_windows64_signed.tar.xz`;
// The packager imports a local, freshly built client, never a downloaded
// manifest as an authority for arbitrary native binaries.
export async function importBrowserEngine(source, staging, project) {
  const manifest = JSON.parse(await fs.readFile(path.join(source, "browser-engine.json"), "utf8"));
  if (manifest.version !== 1 || manifest.cefVersion !== cefVersion || manifest.cefApiVersion !== 15400 ||
    manifest.apiHash !== "726dc73763db22edb289e41af2421a232617f7f4" || manifest.sandboxCompatibilityHash !== "265fca9293e6b6ef" ||
    manifest.sourceSha256 !== digest(await fs.readFile(path.join(project, "native/cef/BrowserEngine.cpp"))) ||
    manifest.bootstrap?.file !== "QQClawBrowser.exe" || manifest.client?.file !== "QQClawBrowser.dll" ||
    manifest.elf?.file !== "chrome_elf.dll" || manifest.elf.sha256 !== "f26656bfe38e1b78e42f292b6a8be1b5f0b5db15395ac571d6e20a1dedf698fb" ||
    manifest.bootstrap.sha256 !== "0b6c80b6c81615f8c2b6c051d698cb9ff93d626fb82016ce61eefd62d8cc4fec" ||
    !/^[0-9a-f]{64}$/.test(manifest.client.sha256) || manifest.runtime?.url !== runtimeUrl ||
    manifest.runtime.archiveSha256 !== "ed5bed11096bedd69bfc9d534f3055a8cce290a583543959eca6d3fb22de8d5f" ||
    manifest.runtime.librarySha256 !== "23bc0d10e6a4b1980890f9e383d3747819598a803e5e860569cb381e5c47b472")
    throw new Error("Browser build does not match the current source and pinned official CEF SDK. Rebuild with build:browser.");
  const files = await Promise.all([manifest.bootstrap, manifest.client, manifest.elf].map(async entry => {
    const bytes = await fs.readFile(path.join(source, entry.file));
    if (digest(bytes) !== entry.sha256) throw new Error(`Browser artifact integrity check failed: ${entry.file}`);
    return { name: entry.file, bytes };
  }));
  const licenses = await Promise.all(["CEF-LICENSE.txt", "JSON-LICENSE.txt"].map(async name => {
    const bytes = await fs.readFile(path.join(source, name));
    if (!bytes.length) throw new Error(`Missing browser license: ${name}`);
    return { name, bytes };
  }));
  const destination = path.join(staging, "browser-engine");
  await fs.mkdir(destination, { recursive: true });
  for (const entry of [...files, ...licenses]) await fs.writeFile(path.join(destination, entry.name), entry.bytes);
  const resource = path.join(destination, "browser-engine.json");
  await fs.writeFile(resource, JSON.stringify(manifest));
  return { resource, manifest };
}
