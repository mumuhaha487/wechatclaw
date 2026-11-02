import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "156.0.15+gcf671c0+chromium-156.0.8078.80";
const pins = {
  arm64: { platform: "macosarm64", size: 135024501, sha1: "bcdd1877edb300b0fb91d8f71c0b14aae256cd0f" },
  x64: { platform: "macosx64", size: 141647289, sha1: "13756e3029307720fe00898d54aef8a64c9b4043" },
};
const option = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const digest = async (file, algorithm) => { const hash = createHash(algorithm); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest("hex"); };
if (process.platform !== "darwin") throw new Error("The Mac CEF bridge must be compiled on macOS.");
if (!option("--entry")) throw new Error("Pass --entry with the native application's Objective-C++ entry point.");
const entry = path.resolve(option("--entry"));
const output = path.resolve(option("--output") || await fs.mkdtemp(path.join(os.tmpdir(), "qqclaw-mac-browser-")));
const pin = pins[process.arch];
if (!pin) throw new Error("Unsupported macOS architecture");
await fs.mkdir(output, { recursive: true });
const archive = path.join(output, "cef-sdk.tar.bz2");
const valid = async () => (await fs.stat(archive).catch(() => null))?.size === pin.size && await digest(archive, "sha1") === pin.sha1;
if (!await valid()) {
  const name = `cef_binary_${version}_${pin.platform}_minimal.tar.bz2`;
  const response = await fetch("https://cef-builds.spotifycdn.com/" + encodeURIComponent(name));
  if (!response.ok || !response.body) throw new Error(`CEF download HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
  if (!await valid()) throw new Error("CEF SDK does not match the pinned official archive");
}
const sdk = path.join(output, "sdk"), build = path.join(output, "build");
await fs.mkdir(sdk, { recursive: true });
await run("/usr/bin/tar", ["-xjf", archive, "-C", sdk, "--strip-components", "1"], { maxBuffer: 1024 * 1024 });
const sdkBuild = path.join(sdk, "CMakeLists.txt");
const extra = `\nadd_subdirectory("${path.join(project, "native/cef/macos")}" "\${CMAKE_BINARY_DIR}/qqclaw-macos")\n`;
await fs.writeFile(sdkBuild, "add_compile_definitions(CEF_API_VERSION=15600)\n" + await fs.readFile(sdkBuild, "utf8") + extra);
const execute = async (exe, args) => {
  try { const { stdout, stderr } = await run(exe, args, { maxBuffer: 16 * 1024 * 1024 }); if (stdout.trim()) console.log(stdout.trim()); if (stderr.trim()) console.log(stderr.trim()); }
  catch (error) { throw new Error([error.stdout, error.stderr, error.message].filter(Boolean).join("\n")); }
};
await execute("cmake", ["-S", sdk, "-B", build, "-DCMAKE_BUILD_TYPE=Release", `-DPROJECT_ARCH=${process.arch === "arm64" ? "arm64" : "x86_64"}`, "-DUSE_SANDBOX=ON", "-DCMAKE_OSX_DEPLOYMENT_TARGET=13.5", `-DQQCLAW_CEF_ENTRY=${entry}`]);
await execute("cmake", ["--build", build, "--config", "Release", "--target", "QQClawBrowser", "--parallel", "4"]);
// CEF_TARGET_OUT_DIR depends on the selected generator and CEF SDK layout.
let builtApp;
async function locate(directory, depth = 0) {
  if (depth > 5) return;
  for (const child of await fs.readdir(directory, { withFileTypes: true })) if (child.isDirectory()) {
    const file = path.join(directory, child.name);
    if (child.name === "QQClawBrowser.app") { builtApp = file; return; }
    await locate(file, depth + 1); if (builtApp) return;
  }
}
await locate(build);
if (!builtApp) throw new Error("CEF component app was not generated");
const frameworks = path.join(builtApp, "Contents/Frameworks");
async function signLibraries(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await signLibraries(file);
    else if (item.isFile() && item.name.endsWith(".dylib")) await execute("/usr/bin/codesign", ["--force", "--sign", "-", file]);
  }
}
await signLibraries(path.join(frameworks, "Chromium Embedded Framework.framework"));
await execute("/usr/bin/codesign", ["--force", "--sign", "-", path.join(frameworks, "Chromium Embedded Framework.framework")]);
await execute("/usr/bin/codesign", ["--force", "--sign", "-", path.join(frameworks, "libQQClawCefBridge.dylib")]);
for (const item of await fs.readdir(frameworks)) if (item.endsWith(".app")) await execute("/usr/bin/codesign", ["--force", "--sign", "-", path.join(frameworks, item)]);
await execute("/usr/bin/codesign", ["--force", "--sign", "-", builtApp]);
await execute("/usr/bin/codesign", ["--verify", "--deep", "--strict", builtApp]);
const sourceHashes = {};
for (const name of ["CefBridge.h", "CefBridge.mm", "Helper.cc", "CMakeLists.txt", "Info.plist.in"]) sourceHashes[name] = await digest(path.join(project, "native/cef/macos", name), "sha256");
const record = { version, platform: pin.platform, archiveSha1: pin.sha1, archiveSha256: await digest(archive, "sha256"), app: builtApp, executable: path.join(builtApp, "Contents/MacOS/QQClawBrowser"), sandboxRequested: true, sourceHashes };
await fs.writeFile(path.join(output, "mac-browser-build.json"), JSON.stringify(record, null, 2));
console.log(JSON.stringify(record));
