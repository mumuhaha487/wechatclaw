import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const root = path.resolve(import.meta.dirname, "..");
const option = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
if (process.platform !== "win32") throw new Error("Windows 安装包需要在 Windows 上构建。");
const executable = path.resolve(option("--executable") || path.join(root, "release/QQClaw.exe"));
const output = path.resolve(option("--output") || path.join(root, "release/QQClaw-Setup.exe"));
const candidates = [option("--compiler"), process.env.ISCC_PATH,
  path.join(process.env.LOCALAPPDATA || os.homedir(), "Programs/Inno Setup 6/ISCC.exe"),
  path.join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Inno Setup 6/ISCC.exe")].filter(Boolean);
let compiler;
for (const file of candidates) if ((await fs.stat(file).catch(() => null))?.isFile()) { compiler = file; break; }
if (!compiler) throw new Error("请安装 Inno Setup 6，或使用 --compiler 指定 ISCC.exe。");
await fs.access(executable);
await fs.mkdir(path.dirname(output), { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const result = await promisify(execFile)(compiler, [
  `/DAppVersion=${manifest.version}`, `/DAppExecutable=${executable}`,
  `/DInstallerOutput=${path.dirname(output)}`, `/DInstallerName=${path.basename(output, ".exe")}`,
  path.join(root, "native/installer.iss"),
], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
if (result.stdout.trim()) console.log(result.stdout.trim());
console.log(`已构建 ${output} · 安装向导、目录选择、快捷方式与卸载入口`);
