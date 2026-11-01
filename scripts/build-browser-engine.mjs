import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith("--")) throw new Error(`Missing ${name} value`);
  return process.argv[index + 1];
};
if (process.platform !== "win32") throw new Error("The CEF Windows browser client must be built on Windows.");
const sdkValue = option("--cef-sdk");
if (!sdkValue) throw new Error("Pass --cef-sdk with the extracted official CEF 154.0.34 Windows x64 minimal SDK directory.");
const sdk = path.resolve(sdkValue);
const output = path.resolve(option("--output") || await fs.mkdtemp(path.join(os.tmpdir(), "qqclaw-browser-build-")));
if (output.toLowerCase() === root.toLowerCase() || output.toLowerCase().startsWith(root.toLowerCase() + path.sep))
  throw new Error("Build browser components outside the project; the desktop packager will import verified artifacts.");
const expectedVersion = "154.0.34+g14c5a08+chromium-154.0.8037.98";
const expectedApiHash = "726dc73763db22edb289e41af2421a232617f7f4";
const bootstrapHash = "0b6c80b6c81615f8c2b6c051d698cb9ff93d626fb82016ce61eefd62d8cc4fec";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const versionHeader = await fs.readFile(path.join(sdk, "include/cef_version.h"), "utf8");
const apiHeader = await fs.readFile(path.join(sdk, "include/cef_api_versions.h"), "utf8");
if (!versionHeader.includes(`#define CEF_VERSION "${expectedVersion}"`) || !apiHeader.includes(expectedApiHash))
  throw new Error("The CEF SDK version or Windows API hash does not match this client.");
const bootstrap = await fs.readFile(path.join(sdk, "Release/bootstrap.exe"));
if (hash(bootstrap) !== bootstrapHash) throw new Error("The official CEF bootstrap hash does not match.");
const cefLicense = await fs.readFile(path.join(sdk, "LICENSE.txt"));
const cache = path.join(os.tmpdir(), "qqclaw-build-cache/browser-engine/json-3.12.0");
async function dependency(name, expected) {
  const destination = path.join(cache, "nlohmann", name);
  let bytes = await fs.readFile(destination).catch(error => { if (error.code !== "ENOENT") throw error; });
  if (!bytes || hash(bytes) !== expected) {
    const source = name === "json.hpp" ? "single_include/nlohmann/json.hpp" : "LICENSE.MIT";
    const response = await fetch(`https://raw.githubusercontent.com/nlohmann/json/v3.12.0/${source}`);
    if (!response.ok) throw new Error(`Could not download ${name}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== expected) throw new Error(`${name} integrity check failed.`);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  }
  return bytes;
}
await dependency("json.hpp", "aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63");
const jsonLicense = await dependency("LICENSE.MIT", "46a65cffd1ea955132d95a8dd921640714a8d6b537d2e4e482d31145ae95b603");
await fs.mkdir(output, { recursive: true });
const delayed = {
  USER32: ["CreateWindowExW", "DefWindowProcW", "DestroyWindow", "GetClientRect", "GetParent", "GetWindowLongPtrW", "GetWindowThreadProcessId", "KillTimer", "RegisterClassW", "SetParent", "SetTimer", "SetWindowLongPtrW", "SetWindowPos", "ShowWindow"],
  SHELL32: ["CommandLineToArgvW"],
};
const importLibraries = [];
for (const [library, exports] of Object.entries(delayed)) {
  const def = path.join(output, `${library}.def`), target = path.join(output, `${library}-delay.a`);
  await fs.writeFile(def, `LIBRARY ${library}.dll\nEXPORTS\n${exports.join("\n")}\n`);
  await run("dlltool", ["-d", def, "-y", target], { windowsHide: true });
  importLibraries.push(target);
}
const dll = path.join(output, "QQClawBrowser.dll"), exe = path.join(output, "QQClawBrowser.exe");
const source = path.join(root, "native/cef/BrowserEngine.cpp");
try {
  const result = await run(option("--compiler") || "g++", ["-std=c++17", "-O2", "-g", "-shared", "-static", "-Wl,--exclude-all-symbols", "-I", sdk, "-I", cache, source, "-o", dll, ...importLibraries], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  await fs.writeFile(path.join(output, "compiler.log"), result.stdout + result.stderr);
} catch (error) {
  await fs.writeFile(path.join(output, "compiler.log"), (error.stdout || "") + (error.stderr || error.message));
  throw new Error(`CEF client compilation failed; see ${path.join(output, "compiler.log")}`);
}
await fs.writeFile(exe, bootstrap);
const pe = (await run("objdump", ["-p", dll], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })).stdout;
await fs.writeFile(path.join(output, "client-pe.txt"), pe);
const importStart = pe.indexOf("The Import Tables"), importEnd = pe.indexOf("The Export Tables");
if (importStart < 0 || importEnd < importStart) throw new Error("Could not inspect the CEF client's PE imports.");
const immediateImports = pe.slice(importStart, importEnd);
if (/DLL Name: (USER32|SHELL32|libwinpthread)/i.test(immediateImports)) throw new Error("CEF sandbox client has an unsupported immediate DLL import.");
const artifact = async file => ({ file: path.basename(file), sha256: hash(await fs.readFile(file)) });
const manifest = {
  version: 1, cefVersion: expectedVersion, cefApiVersion: 15400, apiHash: expectedApiHash,
  sandboxCompatibilityHash: "265fca9293e6b6ef", sourceSha256: hash(await fs.readFile(source)),
  client: await artifact(dll), bootstrap: await artifact(exe),
  runtime: { url: `https://cef-builds.spotifycdn.com/cef_binary_${encodeURIComponent(expectedVersion)}_windows64_signed.tar.xz`,
    archiveSha256: "ed5bed11096bedd69bfc9d534f3055a8cce290a583543959eca6d3fb22de8d5f" },
  scope: "Unpublished browser surface component. Packing, installation and full product integration are not provided by this build command.",
};
await fs.writeFile(path.join(output, "browser-engine.json"), JSON.stringify(manifest, null, 2));
await fs.writeFile(path.join(output, "JSON-LICENSE.txt"), jsonLicense);
await fs.writeFile(path.join(output, "CEF-LICENSE.txt"), cefLicense);
console.log(JSON.stringify({ output, ...manifest }, null, 2));
