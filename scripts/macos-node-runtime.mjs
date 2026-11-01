import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const nodeVersion = "24.22.1";
export const nodeArchives = {
  arm64: "89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7",
  x64: "d132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035",
};

export async function cacheMacNode(root) {
  const cache = path.join(root, "runtime/macos");
  await fs.mkdir(cache, { recursive: true });
  return Promise.all(Object.entries(nodeArchives).map(async ([arch, sha256]) => {
    const name = `node-v${nodeVersion}-darwin-${arch}.tar.gz`, archive = path.join(cache, name);
    let bytes = await fs.readFile(archive).catch(error => { if (error.code !== "ENOENT") throw error; });
    if (!bytes) {
      const response = await fetch(`https://nodejs.org/dist/v${nodeVersion}/${name}`, { signal: AbortSignal.timeout(180000) });
      if (!response.ok) throw new Error(`Node.js download failed: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error(`Node.js checksum mismatch: ${name}`);
    await fs.writeFile(archive, bytes);
    return { arch, archive, sha256 };
  }));
}

export async function bundleMacNode(root, resources) {
  const archives = await cacheMacNode(root);
  for (const { arch, archive } of archives) {
    const destination = path.join(resources, "node", arch);
    await fs.mkdir(destination, { recursive: true });
    await exec("/usr/bin/tar", ["-xzf", archive, "-C", destination, "--strip-components=1"], { timeout: 180000 });
    await fs.access(path.join(destination, "bin/node"));
    await fs.access(path.join(destination, "lib/node_modules/npm/bin/npm-cli.js"));
  }
  return archives;
}
