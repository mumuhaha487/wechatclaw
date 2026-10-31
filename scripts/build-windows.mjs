import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "qqclaw-build-"));
const staging = path.join(temporary, "payload");
const sdkVersion = "1.0.4314.35";
const sdkSha512 = "cOaiVqP3BmQHMnxGpZzANM22tUXgycrisyJHjIGNzIaMsm8iXj7Kx+ceYg+RbYwJtzT009qfcFTocvVLY+ekMw==";
const sdkCache = path.join(
  os.tmpdir(),
  "qqclaw-build-cache",
  `webview2-${sdkVersion}`,
);
const ps = (value) => `'${value.replace(/'/g, "''")}'`;
const powershell = async (command) => {
  const result = await exec(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$ErrorActionPreference='Stop'; ${command}`,
    ],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  );
  if (result.stdout.trim()) console.log(result.stdout.trim());
};
await fs.mkdir(path.join(staging, "ui"), { recursive: true });
await fs.mkdir(path.join(root, "release"), { recursive: true });
await build({
  entryPoints: [path.join(root, "backend", "main.mjs")],
  outfile: path.join(staging, "backend.cjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: true,
  legalComments: "none",
});
await build({
  entryPoints: [path.join(root, "ui", "app.mjs")],
  outfile: path.join(staging, "ui", "app.js"),
  bundle: true,
  platform: "browser",
  target: "chrome110",
  format: "iife",
  minify: true,
  legalComments: "none",
});
for (const file of ["index.html", "app.css", "desktop.css"])
  await fs.copyFile(
    path.join(root, "ui", file),
    path.join(staging, "ui", file),
  );

const notices = [await fs.readFile(path.join(root, "LICENSE"), "utf8")];
notices.push("codex-weixin · https://github.com/XavierJiezou/codex-weixin\n" + await fs.readFile(path.join(root, "docs", "CODEX-WEIXIN-LICENSE.txt"), "utf8"));
await fs.cp(
  path.join(root, "ui", "assets"),
  path.join(staging, "ui", "assets"),
  { recursive: true },
);
notices.push(
  "PI-Desktop homepage mascot assets · https://github.com/vastsa/pi-desktop\n" +
    (await fs.readFile(
      path.join(root, "docs", "PI-DESKTOP-LICENSE.txt"),
      "utf8",
    )),
);
const lock = JSON.parse(
  await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
);
for (const [location, info] of Object.entries(lock.packages)) {
  if (!location || info.dev) continue;
  const directory = path.join(root, location);
  const pkg = JSON.parse(
    await fs.readFile(path.join(directory, "package.json"), "utf8"),
  );
  const licenses = (await fs.readdir(directory)).filter((name) =>
    /^(licen[cs]e|copying|notice)(\.|$)/i.test(name),
  );
  const texts = await Promise.all(
    licenses.map((name) => fs.readFile(path.join(directory, name), "utf8")),
  );
  notices.push(
    `${pkg.name}@${pkg.version} (${pkg.license || info.license || "see package"})\n${texts.join("\n")}`,
  );
}

if (process.platform !== "win32")
  throw new Error("Windows EXE 构建需要在 Windows 上运行。");
try {
  await fs.access(
    path.join(sdkCache, "lib", "net462", "Microsoft.Web.WebView2.Core.dll"),
  );
} catch {
  console.log(`正在获取 Microsoft WebView2 SDK ${sdkVersion}（仅构建使用）…`);
  await fs.mkdir(path.dirname(sdkCache), { recursive: true });
  const url = `https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/${sdkVersion}/microsoft.web.webview2.${sdkVersion}.nupkg`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`SDK 下载失败 HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha512").update(bytes).digest("base64") !== sdkSha512)
    throw new Error("SDK 校验失败。");
  const archive = path.join(
    path.dirname(sdkCache),
    `webview2-${sdkVersion}.zip`,
  );
  await fs.writeFile(archive, bytes);
  await powershell(
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${ps(archive)}, ${ps(sdkCache)})`,
  );
}
for (const file of [
  "Microsoft.Web.WebView2.Core.dll",
  "Microsoft.Web.WebView2.WinForms.dll",
])
  await fs.copyFile(
    path.join(sdkCache, "lib", "net462", file),
    path.join(staging, file),
  );
await fs.copyFile(
  path.join(sdkCache, "runtimes", "win-x64", "native", "WebView2Loader.dll"),
  path.join(staging, "WebView2Loader.dll"),
);
const sdkLicenseNames = (await fs.readdir(sdkCache)).filter(
  (name) => /license|notice/i.test(name) && !name.endsWith(".png"),
);
for (const name of sdkLicenseNames) {
  try {
    notices.push(
      `Microsoft WebView2 SDK ${sdkVersion}\n${await fs.readFile(path.join(sdkCache, name), "utf8")}`,
    );
  } catch {}
}
await fs.writeFile(
  path.join(staging, "THIRD-PARTY-LICENSES.txt"),
  notices.join("\n\n========================================\n\n"),
);

// Draw the original code mark into an ICO; no external image assets are used.
const size = 64;
const pixels = Buffer.alloc(size * size * 4);
const lines = [
  [20, 21, 10, 32],
  [10, 32, 20, 43],
  [44, 21, 54, 32],
  [54, 32, 44, 43],
  [36, 16, 28, 48],
];
const distance = (x, y, a, b, c, d) => {
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - a) * (c - a) + (y - b) * (d - b)) / ((c - a) ** 2 + (d - b) ** 2),
    ),
  );
  return Math.hypot(x - a - t * (c - a), y - b - t * (d - b));
};
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    let alpha = 0,
      white = 0;
    for (let sy = 0; sy < 4; sy++)
      for (let sx = 0; sx < 4; sx++) {
        const px = x + (sx + 0.5) / 4,
          py = y + (sy + 0.5) / 4;
        const dx = Math.max(13 - px, px - 51, 0),
          dy = Math.max(13 - py, py - 51, 0);
        const inside =
          Math.hypot(dx, dy) <= 12 &&
          px >= 1 &&
          px <= 63 &&
          py >= 1 &&
          py <= 63;
        if (inside) {
          alpha++;
          if (lines.some((l) => distance(px, py, ...l) <= 2.15)) white++;
        }
      }
    const i = ((size - 1 - y) * size + x) * 4;
    const tone = alpha ? Math.round(32 + (white / alpha) * 220) : 0;
    pixels[i] = tone;
    pixels[i + 1] = tone;
    pixels[i + 2] = tone;
    pixels[i + 3] = Math.round((alpha / 16) * 255);
  }
const dib = Buffer.alloc(40);
dib.writeUInt32LE(40);
dib.writeInt32LE(size, 4);
dib.writeInt32LE(size * 2, 8);
dib.writeUInt16LE(1, 12);
dib.writeUInt16LE(32, 14);
dib.writeUInt32LE(pixels.length, 20);
const mask = Buffer.alloc((size * size) / 8);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = size;
header[7] = size;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(dib.length + pixels.length + mask.length, 14);
header.writeUInt32LE(22, 18);
await fs.writeFile(
  path.join(staging, "app.ico"),
  Buffer.concat([header, dib, pixels, mask]),
);

const archive = path.join(temporary, "payload.zip");
await powershell(
  `Add-Type -AssemblyName System.IO.Compression.FileSystem; if(Test-Path -LiteralPath ${ps(archive)}){[IO.File]::Delete(${ps(archive)})}; [IO.Compression.ZipFile]::CreateFromDirectory(${ps(staging)}, ${ps(archive)}, [IO.Compression.CompressionLevel]::Optimal, $false)`,
);
const compiler = path.join(
  process.env.WINDIR || "C:\\Windows",
  "Microsoft.NET",
  "Framework64",
  "v4.0.30319",
  "csc.exe",
);
const references = [
  "System.dll",
  "System.Core.dll",
  "System.Drawing.dll",
  "System.Windows.Forms.dll",
  "System.Security.dll",
  "System.Web.Extensions.dll",
  "System.IO.Compression.dll",
  "System.IO.Compression.FileSystem.dll",
  path.join(staging, "Microsoft.Web.WebView2.Core.dll"),
  path.join(staging, "Microsoft.Web.WebView2.WinForms.dll"),
];
const compiledExe = path.join(temporary, "QQClaw.exe");
const exe = path.join(root, "release", "QQClaw.exe");
const args = [
  "/nologo",
  "/target:winexe",
  "/platform:x64",
  "/optimize+",
  "/utf8output",
  `/out:${compiledExe}`,
  `/win32manifest:${path.join(root, "native", "app.manifest")}`,
  `/win32icon:${path.join(staging, "app.ico")}`,
  `/resource:${archive},payload.zip`,
  ...references.map((r) => `/reference:${r}`),
  path.join(root, "native", "Program.cs"),
];
try {
  const result = await exec(compiler, args, {
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.stdout.trim()) console.log(result.stdout.trim());
} catch (error) {
  throw new Error(error.stdout || error.stderr || error.message);
}
try {
  await fs.copyFile(compiledExe, exe);
} catch (error) {
  if (["EBUSY", "EPERM", "EACCES"].includes(error.code))
    throw new Error("请先关闭 QQClaw，再重新构建。成品始终只有 QQClaw.exe。");
  throw error;
}
const bytes = await fs.readFile(exe);
await fs.rm(temporary, { recursive: true, force: true });
console.log(
  `已构建 ${exe} · ${(bytes.length / 1024 / 1024).toFixed(2)} MB · Windows x64 · 不内置 Node / Codex / WebView2 Runtime`,
);
