import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverOfficialBrowser } from "../backend/official-browser.mjs";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installed = await discoverOfficialBrowser({ runtimeDirectory: "" });
if (!installed.available) throw new Error(installed.reason);
const root = path.join(project, "runtime/windows/official-browser");
await fs.mkdir(root, { recursive: true });
await fs.cp(path.dirname(path.dirname(installed.paths.nodePath)), path.join(root, "node"), { recursive: true, dereference: true });
await fs.cp(path.dirname(path.dirname(installed.paths.browserServicePath)), path.join(root, "plugin"), { recursive: true, dereference: true });
await fs.cp(installed.extension.path, path.join(root, "extension"), { recursive: true, dereference: true });
const npmRoot = path.dirname(process.execPath);
await fs.cp(path.join(npmRoot, "node_modules/npm"), path.join(root, "node/bin/node_modules/npm"), { recursive: true });
for (const file of ["npm", "npm.cmd", "npx", "npx.cmd"])
  await fs.copyFile(path.join(npmRoot, file), path.join(root, "node/bin", file));
// Native-host configuration is generated per installation at run time.
const config = path.join(root, "plugin/extension-host/windows/x64/extension-host-config.json");
await fs.rm(config, { force: true });
await fs.writeFile(path.join(root, "runtime.json"), JSON.stringify({ version: 1, platform: "win32", vendorVersion: installed.version, extensionVersion: installed.extension.version }, null, 2));
console.log("Official runtime and original ChatGPT extension copied to " + root);
