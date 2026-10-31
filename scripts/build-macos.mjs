import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { iconPNG } from "./macos-icon.mjs";

const exec = promisify(execFile);
const project = path.resolve(import.meta.dirname, "..");
export const macTargets = ["arm64-apple-macosx13.3", "x86_64-apple-macosx13.3"];

export async function macPayload(root, resources) {
  await fs.mkdir(path.join(resources, "ui"), { recursive: true });
  await build({ entryPoints: [path.join(root, "backend/main.mjs")], outfile: path.join(resources, "backend.cjs"), bundle: true, platform: "node", target: "node22", format: "cjs", minify: true, legalComments: "none" });
  await build({ entryPoints: [path.join(root, "ui/app.mjs")], outfile: path.join(resources, "ui/app.js"), bundle: true, platform: "browser", target: "safari16.4", format: "iife", minify: true, legalComments: "none" });
  for (const file of ["index.html", "app.css", "desktop.css"]) await fs.copyFile(path.join(root, "ui", file), path.join(resources, "ui", file));
  await fs.cp(path.join(root, "ui/assets"), path.join(resources, "ui/assets"), { recursive: true });
  const notices = [await fs.readFile(path.join(root, "LICENSE"), "utf8")];
  for (const file of ["CODEX-WEIXIN-LICENSE.txt", "PI-DESKTOP-LICENSE.txt"]) notices.push(`${file}\n${await fs.readFile(path.join(root, "docs", file), "utf8")}`);
  const lock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
  for (const [location, info] of Object.entries(lock.packages)) {
    if (!location || info.dev) continue;
    const directory = path.join(root, location);
    const pkg = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
    const licenses = (await fs.readdir(directory)).filter((name) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name));
    notices.push(`${pkg.name}@${pkg.version} (${pkg.license || info.license || "see package"})\n${(await Promise.all(licenses.map((name) => fs.readFile(path.join(directory, name), "utf8")))).join("\n")}`);
  }
  await fs.writeFile(path.join(resources, "THIRD-PARTY-LICENSES.txt"), notices.join("\n\n========================================\n\n"));
}

export async function buildMac(root = project) {
  if (process.platform !== "darwin") throw new Error("macOS 原生构建需要 macOS 和 Xcode Command Line Tools。当前平台不能生成经过原生编译的 .app；请在 Mac 或 macOS CI 执行 npm run build:mac。");
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "qqclaw-macos-build-"));
  const app = path.join(temporary, "QQClaw.app"), contents = path.join(app, "Contents"), resources = path.join(contents, "Resources"), binaries = path.join(contents, "MacOS");
  const run = async (exe, args) => {
    try { const result = await exec(exe, args, { timeout: 600000, maxBuffer: 8 * 1024 * 1024 }); if (result.stdout.trim()) console.log(result.stdout.trim()); return result.stdout.trim(); }
    catch (error) { throw new Error(error.stderr || error.stdout || error.message); }
  };
  try {
    await fs.mkdir(binaries, { recursive: true });
    await macPayload(root, resources);
    const { version } = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    const plist = (await fs.readFile(path.join(root, "native/macos/Info.plist"), "utf8")).replaceAll("__VERSION__", version);
    await fs.writeFile(path.join(contents, "Info.plist"), plist);
    await run("/usr/bin/plutil", ["-lint", path.join(contents, "Info.plist")]);
    const sdk = await run("/usr/bin/xcrun", ["--sdk", "macosx", "--show-sdk-path"]);
    const compiled = [];
    for (const target of macTargets) {
      const binary = path.join(temporary, target.split("-")[0]); compiled.push(binary);
      await run("/usr/bin/xcrun", ["swiftc", "-swift-version", "5", "-parse-as-library", "-O", "-whole-module-optimization", "-sdk", sdk, "-target", target, "-framework", "AppKit", "-framework", "WebKit", "-framework", "Security", "-framework", "CryptoKit", path.join(root, "native/macos/QQClaw.swift"), "-o", binary]);
    }
    const executable = path.join(binaries, "QQClaw");
    await run("/usr/bin/lipo", ["-create", ...compiled, "-output", executable]);
    await run("/usr/bin/lipo", [executable, "-verify_arch", "arm64", "x86_64"]);
    await fs.chmod(executable, 0o755);
    const icons = path.join(temporary, "AppIcon.iconset"); await fs.mkdir(icons);
    for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) await fs.writeFile(path.join(icons, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`), iconPNG(size * scale));
    await run("/usr/bin/iconutil", ["-c", "icns", icons, "-o", path.join(resources, "AppIcon.icns")]);
    const identity = process.env.MACOS_SIGN_IDENTITY || "-";
    await run("/usr/bin/codesign", ["--force", "--sign", identity, ...(identity === "-" ? [] : ["--options", "runtime", "--timestamp"]), app]);
    await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
    const archive = path.join(temporary, "QQClaw.zip");
    const zip = () => run("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, archive]);
    await zip();
    if (process.env.MACOS_NOTARY_PROFILE) {
      if (identity === "-") throw new Error("公证需要 Developer ID 签名，请配置 MACOS_SIGN_IDENTITY。");
      const result = JSON.parse(await run("/usr/bin/xcrun", ["notarytool", "submit", archive, "--keychain-profile", process.env.MACOS_NOTARY_PROFILE, "--wait", "--output-format", "json"]));
      if (result.status !== "Accepted") throw new Error(`Apple 公证未通过：${result.status}`);
      await run("/usr/bin/xcrun", ["stapler", "staple", app]);
      await run("/usr/bin/xcrun", ["stapler", "validate", app]);
      await fs.rm(archive); await zip();
    }
    const output = path.join(root, "release/macos/QQClaw.zip");
    await fs.mkdir(path.dirname(output), { recursive: true }); await fs.copyFile(archive, output);
    console.log(`已构建 ${output} · macOS 13.3+ · Apple Silicon / Intel Universal · ${identity === "-" ? "本地签名，尚未公证" : process.env.MACOS_NOTARY_PROFILE ? "Developer ID 已签名并公证" : "Developer ID 已签名，未公证"} · 不内置 Node / Codex`);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildMac();
