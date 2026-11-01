import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const macBrowserRuntime = {
  arm64: {
    file: "runtime-darwin-arm64.tar.gz", bytes: 226931853,
    sha256: "8f1df2ce75043880693128467d16f5224344cf1d043638bf5281d735fab6fc52",
    vendorVersion: "26.1027.51404", extensionVersion: "1.26.1020.11845",
    natives: {
      "node/bin/node": "2fc4ffc61c2a58c1bb74ea14742ef12009bb318d6220f7b7254cbf9d26838326",
      "node/bin/node_repl": "6c58418faee72abd169e163f8313b2bcfd76137b4d61978c7c29a51701798a18",
      "plugin/extension-host/macos/arm64/ChatGPT for Chrome": "e2c162172f5c9323fc0f4554fca73122a8d52eba6f841330c483f3f9677a07bb",
      "cli/CodexCLI.app/Contents/MacOS/codex": "58a91f6ea19bea477ae3a2ec48d619f0039afe75d3476260747e11d201fa7cea",
    },
  },
};
async function digest(file) {
  const hash = createHash("sha256"); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest("hex");
}

// The same extraction routine is used by the native integration check and
// production packaging. Original signed Mach-O files are never re-signed.
export async function unpackMacBrowserRuntime({ cache, destination, arch = process.arch }) {
  if (process.platform !== "darwin") throw Error("Mac browser runtime packaging requires macOS.");
  const pin = macBrowserRuntime[arch];
  if (!pin) throw Error("尚未取得适用于 Intel Mac 的官方浏览组件。");
  const archive = path.join(cache, pin.file);
  if ((await fs.stat(archive)).size !== pin.bytes || await digest(archive) !== pin.sha256) throw Error("Mac 官方浏览运行库摘要不匹配。");
  await fs.mkdir(destination, { recursive: true });
  await exec("/usr/bin/tar", ["-xzf", archive, "-C", destination], { timeout: 120000 });
  const manifest = JSON.parse(await fs.readFile(path.join(destination, "runtime.json"), "utf8"));
  if (manifest.version !== 1 || manifest.platform !== "darwin" || manifest.arch !== arch ||
      manifest.vendorVersion !== pin.vendorVersion || manifest.extensionVersion !== pin.extensionVersion || manifest.includesBrowserCli !== true ||
      manifest.paths.codexCliPath !== "cli/CodexCLI.app/Contents/MacOS/codex") throw Error("Mac 官方浏览运行库清单不匹配。");
  await exec("/usr/bin/codesign", ["--verify", "--deep", "--strict", path.join(destination, "cli/CodexCLI.app")]);
  for (const [name, sha256] of Object.entries(pin.natives)) {
    const file = path.join(destination, name);
    if (await digest(file) !== sha256) throw Error("原版Mac浏览组件已变更：" + name);
    await exec("/usr/bin/codesign", ["--verify", "--strict", "-R=anchor apple generic and certificate leaf[subject.OU] = \"2DC432GLL2\"", file]);
  }
  return { directory: destination, manifest, archiveSha256: pin.sha256 };
}

export function bundleMacBrowserRuntime(root, resources, arch = process.arch) {
  return unpackMacBrowserRuntime({ cache: path.join(root, "runtime/macos/official-browser"), destination: path.join(resources, "official-browser", arch), arch });
}

export async function bundleMacOfficialMcp(root, resources) {
  const { build } = await import("esbuild");
  const file = path.join(resources, "macos-official-mcp.cjs");
  await fs.mkdir(resources, { recursive: true });
  await build({ entryPoints: [path.join(root, "scripts/macos-official-mcp.mjs")], outfile: file,
    bundle: true, platform: "node", target: "node22", format: "cjs", minify: true, legalComments: "none" });
  return file;
}
