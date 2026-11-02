import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { iconPNG } from "./macos-icon.mjs";
import { bundleMacNode } from "./macos-node-runtime.mjs";
import { bundleMacOfficialMcp, unpackMacBrowserRuntime } from "./macos-browser-runtime.mjs";

const exec = promisify(execFile);
const project = path.resolve(import.meta.dirname, "..");
export const macTargets = ["arm64-apple-macosx13.5", "x86_64-apple-macosx13.5"];

export async function macPayload(root, resources) {
  await fs.mkdir(path.join(resources, "ui"), { recursive: true });
  await build({ entryPoints: [path.join(root, "backend/main.mjs")], outfile: path.join(resources, "backend.cjs"), bundle: true, platform: "node", target: "node22", format: "cjs", minify: true, legalComments: "none" });
  await bundleMacOfficialMcp(root, resources);
  await build({ entryPoints: [path.join(root, "ui/app.mjs")], outfile: path.join(resources, "ui/app.js"), bundle: true, platform: "browser", target: "safari16.4", format: "iife", minify: true, legalComments: "none" });
  for (const file of ["index.html", "app.css", "desktop.css"]) await fs.copyFile(path.join(root, "ui", file), path.join(resources, "ui", file));
  await fs.copyFile(path.join(root, "shared/browser-page.js"), path.join(resources, "browser-page.js"));
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

export async function buildMac(root = project, { browserBuild, runtimeCache, output: requestedOutput } = {}) {
  if (process.platform !== "darwin") throw new Error("macOS 原生构建需要 macOS 和 Xcode Command Line Tools。当前平台不能生成经过原生编译的 .app；请在 Mac 或 macOS CI 执行 npm run build:mac。");
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "qqclaw-macos-build-"));
  const imageRoot = path.join(temporary, "image");
  const app = path.join(imageRoot, "QQClaw.app"), contents = path.join(app, "Contents"), resources = path.join(contents, "Resources"), binaries = path.join(contents, "MacOS");
  const run = async (exe, args) => {
    try { const result = await exec(exe, args, { timeout: 600000, maxBuffer: 8 * 1024 * 1024 }); if (result.stdout.trim()) console.log(result.stdout.trim()); return result.stdout.trim(); }
    catch (error) { throw new Error(error.stderr || error.stdout || error.message); }
  };
  try {
    await fs.mkdir(binaries, { recursive: true });
    let browser;
    if (browserBuild) {
      browser = JSON.parse(await fs.readFile(browserBuild, "utf8"));
      if (browser.platform !== (process.arch === "arm64" ? "macosarm64" : "macosx64")) throw Error("CEF 构建架构与本次应用打包架构不一致。");
      if (!runtimeCache) throw Error("内置官方浏览器需要提供已经校验的原版运行库目录。");
      await exec("/usr/bin/ditto", [path.join(browser.app, "Contents/Frameworks"), path.join(contents, "Frameworks")]);
      await unpackMacBrowserRuntime({ cache: runtimeCache, destination: path.join(resources, "official-browser", process.arch) });
    }
    await macPayload(root, resources);
    await bundleMacNode(root, resources);
    const { version } = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    const plist = (await fs.readFile(path.join(root, "native/macos/Info.plist"), "utf8")).replaceAll("__VERSION__", version);
    await fs.writeFile(path.join(contents, "Info.plist"), plist);
    await run("/usr/bin/plutil", ["-lint", path.join(contents, "Info.plist")]);
    const sdk = await run("/usr/bin/xcrun", ["--sdk", "macosx", "--show-sdk-path"]);
    const compiled = [];
    const targets = macTargets;
    for (const target of targets) {
      const binary = path.join(temporary, target.split("-")[0]); compiled.push(binary);
      await run("/usr/bin/xcrun", ["swiftc", "-swift-version", "5", "-parse-as-library", "-O", "-whole-module-optimization", "-sdk", sdk, "-target", target, "-framework", "AppKit", "-framework", "WebKit", "-framework", "Security", "-framework", "CryptoKit", path.join(root, "native/macos/QQClaw.swift"), path.join(root, "native/macos/BrowserHost.swift"), path.join(root, "native/macos/CefRuntime.swift"), "-o", binary]);
    }
    const executable = path.join(binaries, "QQClaw");
    await run("/usr/bin/lipo", ["-create", ...compiled, "-output", executable]);
    await run("/usr/bin/lipo", [executable, "-verify_arch", ...targets.map(target => target.split("-")[0])]);
    await fs.chmod(executable, 0o755);
    const icons = path.join(temporary, "AppIcon.iconset"); await fs.mkdir(icons);
    for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) await fs.writeFile(path.join(icons, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`), iconPNG(size * scale));
    await run("/usr/bin/iconutil", ["-c", "icns", icons, "-o", path.join(resources, "AppIcon.icns")]);
    const identity = process.env.MACOS_SIGN_IDENTITY || "-";
    for (const arch of ["arm64", "x64"]) {
      await run("/usr/bin/codesign", ["--force", "--sign", identity, ...(identity === "-" ? [] : ["--options", "runtime", "--timestamp"]), path.join(resources, "node", arch, "bin/node")]);
    }
    await run("/usr/bin/codesign", ["--force", "--sign", identity, ...(identity === "-" ? [] : ["--options", "runtime", "--timestamp"]), app]);
    await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
    await fs.symlink("/Applications", path.join(imageRoot, "Applications"));
    await fs.writeFile(path.join(imageRoot, "安装说明.txt"), [
      "QQClaw · Mac 安装说明", "",
      "1. 将 QQClaw 拖到旁边的 Applications（应用程序）文件夹。",
      "2. 打开 Mac 的“应用程序”，双击 QQClaw。以后可直接从这里启动。",
      process.env.MACOS_NOTARY_PROFILE
        ? "3. 首次打开时，如系统询问是否打开，请确认。"
        : "3. 初次打开若被系统拦截，请先尝试打开一次，再到“系统设置 → 隐私与安全性”中选择“仍要打开”。当前版本尚未经过 Apple 公证。",
      "4. 已内置 Node.js 24 和 npm，无需另行安装 Node.js。首次进入软件，按照“前往配置”提示安装或选择 Codex 并登录。",
      "", "支持 macOS 13.5 及更新版本，兼容 Apple Silicon 和 Intel。",
      ...(browser ? [`已内置原版官方浏览扩展及运行库；当前官方自动浏览适用于 ${process.arch === "arm64" ? "Apple Silicon" : "Intel"}。其他架构保留聊天和手动网页功能，并明确提示自动浏览尚未接通。`] : []),
      "安装完成后可以推出此磁盘映像。删除应用不会主动删除对话数据。", ""
    ].join("\n"));
    const archive = path.join(temporary, "QQClaw.dmg");
    await run("/usr/bin/hdiutil", ["create", "-volname", "QQClaw", "-srcfolder", imageRoot, "-fs", "HFS+", "-format", "UDZO", archive]);
    if (identity !== "-") {
      await run("/usr/bin/codesign", ["--force", "--sign", identity, "--timestamp", archive]);
      await run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", archive]);
    }
    if (process.env.MACOS_NOTARY_PROFILE) {
      if (identity === "-") throw new Error("公证需要 Developer ID 签名，请配置 MACOS_SIGN_IDENTITY。");
      const result = JSON.parse(await run("/usr/bin/xcrun", ["notarytool", "submit", archive, "--keychain-profile", process.env.MACOS_NOTARY_PROFILE, "--wait", "--output-format", "json"]));
      if (result.status !== "Accepted") throw new Error(`Apple 公证未通过：${result.status}`);
      await run("/usr/bin/xcrun", ["stapler", "staple", archive]);
      await run("/usr/bin/xcrun", ["stapler", "validate", archive]);
    }
    await run("/usr/bin/hdiutil", ["verify", archive]);
    const output = requestedOutput ? path.resolve(requestedOutput) : path.join(root, "release/macos/QQClaw.dmg");
    await fs.mkdir(path.dirname(output), { recursive: true }); await fs.copyFile(archive, output);
    console.log(`已构建 ${output} · macOS 13.5+ · Apple Silicon / Intel Universal · ${identity === "-" ? "本地签名，尚未公证" : process.env.MACOS_NOTARY_PROFILE ? "Developer ID 已签名并公证" : "Developer ID 已签名，未公证"} · 已内置 Node / npm${browser ? ` / 官方浏览运行库（${process.arch}）` : ""}，Codex 按需安装`);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildMac();
