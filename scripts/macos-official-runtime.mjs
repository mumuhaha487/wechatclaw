import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { collectOfficialExtension } from "./official-extension.mjs";

// Inspect the signed original app, never user profiles, credentials or live
// Desktop processes. The recorded resource paths drive the subsequent vendor
// step; an app install is not assumed to contain every optional plugin.
const exec = promisify(execFile);
const option = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
if (process.platform !== "darwin") throw new Error("Official Mac resources must be inspected on macOS.");
if (!option("--output")) throw new Error("Pass --output with a staging directory outside the project.");
const output = path.resolve(option("--output"));
await fs.mkdir(output, { recursive: true });
const sourceUrl = "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg";
const execute = async (command, args) => {
  try { return await exec(command, args, { maxBuffer: 8 * 1024 * 1024 }); }
  catch (error) { throw new Error([error.stdout, error.stderr, error.message].filter(Boolean).join("\n")); }
};
const json = async (name, value) => fs.writeFile(path.join(output, name), JSON.stringify(value, null, 2));
const digest = async file => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
let mounted = false;
let phase = "download";
const mount = path.join(output, "mount");
try {
  let app = option("--app") && path.resolve(option("--app"));
  if (!app) {
    if (!process.argv.includes("--download")) throw new Error("Pass --app or --download.");
    const response = await fetch(sourceUrl);
    if (!response.ok || !response.body) throw new Error(`Official download HTTP ${response.status}`);
    const file = path.join(output, "Codex.dmg"), hash = createHash("sha256");
    let bytes = 0, nextProgress = 100 * 1024 * 1024;
    const counter = new Transform({ transform(chunk, encoding, done) {
      hash.update(chunk); bytes += chunk.length;
      if (bytes >= nextProgress) { console.log(`Downloaded ${Math.floor(bytes / 1024 / 1024)} MiB`); nextProgress += 100 * 1024 * 1024; }
      done(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), counter, createWriteStream(file));
    const expected = Number(response.headers.get("content-length"));
    if (expected && expected !== bytes) throw new Error("Official archive was incomplete");
    await json("download.json", { url: response.url, bytes, sha256: hash.digest("hex"), etag: response.headers.get("etag") });
    phase = "mount";
    await fs.mkdir(mount, { recursive: true });
    const attach = await execute("/usr/bin/hdiutil", ["attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mount, file]);
    mounted = true;
    const rootEntries = await fs.readdir(mount, { withFileTypes: true }), candidates = [];
    async function findApps(directory, depth = 0) {
      for (const item of await fs.readdir(directory, { withFileTypes: true })) if (item.isDirectory()) {
        const file = path.join(directory, item.name);
        if (item.name.endsWith(".app")) candidates.push(file);
        else if (depth < 1 && !item.name.startsWith(".")) await findApps(file, depth + 1);
      }
    }
    await findApps(mount);
    await json("disk-contents.json", { attach: attach.stdout, entries: rootEntries.map(item => item.name), applications: candidates.map(file => path.relative(mount, file)) });
    if (candidates.length !== 1) throw new Error("The official disk image has an unexpected application layout; see disk-contents.json");
    app = candidates[0];
  }
  phase = "signature";
  await execute("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
  const signature = await execute("/usr/bin/codesign", ["-d", "--verbose=4", app]);
  const details = signature.stderr + signature.stdout;
  await fs.writeFile(path.join(output, "app-signature.txt"), details);
  if (!/^Authority=Developer ID Application: OpenAI/m.test(details) || !/^Authority=Apple Root CA/m.test(details))
    throw new Error("The downloaded app does not carry the expected Apple/OpenAI publisher chain");
  const team = details.match(/^TeamIdentifier=(\w+)$/m)?.[1];
  if (!team) throw new Error("Original app publisher team is missing");
  const identifier = (await execute("/usr/bin/plutil", ["-extract", "CFBundleIdentifier", "raw", path.join(app, "Contents/Info.plist")])).stdout.trim();
  const version = (await execute("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", path.join(app, "Contents/Info.plist")])).stdout.trim();
  phase = "inventory";
  const all = [];
  async function visit(directory, relative = "") {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name), name = path.posix.join(relative, item.name);
      if (item.isDirectory()) await visit(file, name);
      else if (item.isFile()) all.push({ path: name, size: (await fs.stat(file)).size });
    }
  }
  await visit(path.join(app, "Contents"));
  const matches = all.filter(item => /extension[-_]?host|browser[-_](?:client|service)|node_repl|chrome|primary[-_]runtime|(?:^|\/)(?:node|codex|codex-cli)$/i.test(item.path));
  const natives = [];
  for (const item of matches.filter(item => /(?:^|\/)(?:node|node_repl|codex|codex-cli)(?:[.-][^/]*)?$|\/extension-host\/macos\/[^/]+\/[^/]+$/.test(item.path))) {
    const file = path.join(app, "Contents", item.path);
    const kind = (await execute("/usr/bin/file", ["-b", file])).stdout.trim();
    if (!kind.includes("Mach-O")) continue;
    const architecture = (await execute("/usr/bin/lipo", ["-archs", file])).stdout.trim();
    const signed = await execute("/usr/bin/codesign", ["-d", "--verbose=2", file]).catch(error => ({ stdout: "", stderr: error.message }));
    natives.push({ ...item, kind, architecture, signature: (signed.stdout + signed.stderr).split(/\r?\n/).filter(line => /^(?:Identifier|Authority|TeamIdentifier|CDHash)=/.test(line)) });
  }
  const inventory = { sourceUrl, identifier, version, fileCount: all.length, matches, natives,
    scope: "Signed original app contents only. No user data, login, installed plugin cache or live Desktop process." };
  await json("resources.json", inventory);
  phase = "asar";
  const asar = path.join(app, "Contents/Resources/app.asar");
  const handle = await fs.open(asar, "r");
  try {
    async function readAt(size, position) {
      const data = Buffer.alloc(size); let offset = 0;
      while (offset < size) { const result = await handle.read(data, offset, size - offset, position + offset); if (!result.bytesRead) throw new Error("ASAR entry ended early"); offset += result.bytesRead; }
      return data;
    }
    const prefix = await readAt(16, 0);
    const headerSize = prefix.readUInt32LE(4), length = prefix.readUInt32LE(12);
    if (length <= 0 || length > 64 * 1024 * 1024 || length > headerSize) throw new Error("ASAR header is invalid");
    const bytes = await readAt(length, 16);
    const header = JSON.parse(bytes.toString("utf8")), entries = new Map();
    function walk(files, directory = "") {
      for (const [name, item] of Object.entries(files || {})) {
        const key = path.posix.join(directory, name);
        if (item.files) walk(item.files, key); else entries.set(key, item);
      }
    }
    walk(header.files);
    async function readEntry(name) {
      const item = entries.get(name); if (!item || item.link) throw new Error("ASAR entry unavailable: " + name);
      if (item.unpacked) return fs.readFile(asar + ".unpacked/" + name);
      if (item.size > 64 * 1024 * 1024) throw new Error("ASAR entry exceeds inspection size: " + name);
      return readAt(item.size, 8 + headerSize + Number(item.offset));
    }
    const pkg = JSON.parse((await readEntry("package.json")).toString("utf8"));
    await json("app-package.json", pkg);
    const main = pkg.main?.replace(/^\.\//, "");
    if (main && entries.has(main)) {
      const bytes = await readEntry(main); await fs.writeFile(path.join(output, "app-main.js"), bytes);
      const text = bytes.toString("utf8"), excerpts = [];
      for (const needle of ["extension-host", "browser-service", "browser-client", "node_repl", "codex-primary-runtime", "chrome-native-hosts"]) {
        let start = 0, count = 0;
        while ((start = text.indexOf(needle, start)) >= 0 && count++ < 6) { excerpts.push({ needle, text: text.slice(Math.max(0, start - 180), start + 300) }); start += needle.length; }
      }
      await json("runtime-excerpts.json", { main, excerpts });
    }
    await json("asar-index.json", { fileCount: entries.size, main,
      matches: [...entries].filter(([name]) => /extension[-_]?host|browser|node_repl|chrome|runtime/i.test(name)).map(([name, item]) => ({ path: name, size: item.size, unpacked: Boolean(item.unpacked) })) });
  } finally { await handle.close(); }
  if (process.argv.includes("--collect")) {
    phase = "collect";
    const runtime = path.join(output, "runtime"), resources = path.join(app, "Contents/Resources");
    const nodeSource = path.join(resources, "cua_node"), pluginSource = path.join(resources, "plugins/openai-bundled/plugins/chrome");
    const hostRelative = `plugin/extension-host/macos/${process.arch}/ChatGPT for Chrome`;
    const nodeInfo = natives.find(item => item.path === "Resources/cua_node/bin/node_repl");
    const expectedArch = process.arch === "x64" ? "x86_64" : process.arch;
    if (!nodeInfo?.architecture.split(" ").includes(expectedArch)) throw new Error("Original Node REPL does not support this build architecture");
    await fs.mkdir(runtime, { recursive: true });
    await fs.cp(nodeSource, path.join(runtime, "node"), { recursive: true, dereference: true });
    await fs.cp(pluginSource, path.join(runtime, "plugin"), { recursive: true, dereference: true });
    const extension = await collectOfficialExtension(output, (file, directory) => execute("/usr/bin/ditto", ["-xk", file, directory]));
    await fs.cp(extension.directory, path.join(runtime, "extension"), { recursive: true });
    const provenance = path.join(runtime, "provenance"); await fs.mkdir(provenance, { recursive: true });
    for (const name of ["plugin.signature.json", "public-key.der"])
      await fs.copyFile(path.join(resources, "plugin-signatures/openai-bundled/chrome", name), path.join(provenance, name));
    await fs.copyFile(path.join(output, "extension-proof.json"), path.join(provenance, "extension-proof.json"));
    const nativeFiles = ["node/bin/node", "node/bin/node_repl", hostRelative], nativeProof = [];
    for (const relative of nativeFiles) {
      const copied = path.join(runtime, relative);
      await execute("/usr/bin/codesign", ["--verify", "--strict", copied]);
      const publisher = await execute("/usr/bin/codesign", ["-d", "--verbose=2", copied]);
      const copiedTeam = (publisher.stdout + publisher.stderr).match(/^TeamIdentifier=(\w+)$/m)?.[1];
      if (copiedTeam !== team) throw new Error("Original native helper publisher differs from the application: " + relative);
      const source = relative.startsWith("node/") ? path.join(nodeSource, relative.slice(5)) : path.join(pluginSource, relative.slice(7));
      const before = await digest(source), after = await digest(copied);
      if (before !== after) throw new Error("Original native runtime changed while copying: " + relative);
      nativeProof.push({ path: relative, sha256: after, copiedUnchanged: true, signed: true, team: copiedTeam });
    }
    const diagnostics = [];
    const evalCode = "let sum=0;for(let i=0;i<1000000;i++)sum+=i;console.log(JSON.stringify({value:42,sum,version:process.version}))";
    for (const [name, executable] of [["source", path.join(nodeSource, "bin/node")], ["copied", path.join(runtime, "node/bin/node")]]) {
      const entitlements = await execute("/usr/bin/codesign", ["-d", "--entitlements", ":-", executable]);
      const linkage = await execute("/usr/bin/otool", ["-L", executable]);
      let execution;
      try { const result = await exec(executable, ["-e", evalCode], { timeout: 10000 }); execution = { code: 0, stdout: result.stdout, stderr: result.stderr }; }
      catch (error) { execution = { code: error.code, signal: error.signal, stdout: error.stdout, stderr: error.stderr }; }
      diagnostics.push({ name, execution, entitlements: entitlements.stdout + entitlements.stderr, linkage: linkage.stdout });
    }
    await json("native-node-diagnostics.json", diagnostics);
    const code = path.join(output, "runtime-code"); await fs.mkdir(code, { recursive: true });
    for (const name of ["installManifest.mjs", "check-native-host-manifest.js", "extension-ids.json"])
      await fs.copyFile(path.join(pluginSource, "scripts", name), path.join(code, name));
    await fs.copyFile(path.join(pluginSource, ".codex-plugin/plugin.json"), path.join(code, "plugin.json"));
    await fs.copyFile(path.join(resources, "plugin-signatures/openai-bundled/chrome/plugin.signature.json"), path.join(code, "plugin.signature.json"));
    const manifest = { version: 1, platform: "darwin", arch: process.arch, vendorVersion: version, extensionVersion: extension.proof.version,
      paths: { nodePath: "node/bin/node", nodeReplPath: "node/bin/node_repl", nodeModuleDirs: ["node/lib/node_modules"], browserServicePath: "plugin/scripts/browser-service.mjs", browserClientPath: "plugin/scripts/browser-client.mjs", host: hostRelative },
      requiresCodexCli: true, source: { url: sourceUrl, identifier, team } };
    await fs.writeFile(path.join(runtime, "runtime.json"), JSON.stringify(manifest, null, 2));
    const proof = { manifest, nativeFiles: nativeProof, extension: extension.proof,
      pluginSignatureIncluded: true, pluginStandaloneSignatureVerified: false,
      scope: "Original signed app resources and verified official CRX. No user data, auth, Codex CLI or Desktop process is included. The caller supplies its installed standalone CLI." };
    await json("runtime-proof.json", proof);
    const archive = path.join(output, `runtime-darwin-${process.arch}.tar.gz`);
    await execute("/usr/bin/tar", ["--no-xattrs", "-czf", archive, "-C", runtime, "."]);
    await json("runtime-archive.json", { file: path.basename(archive), bytes: (await fs.stat(archive)).size, sha256: await digest(archive), arch: process.arch, vendorVersion: version, extensionVersion: extension.proof.version });
  }
  console.log(JSON.stringify({ identifier, version, files: all.length, matches: matches.length, natives: natives.map(item => ({ path: item.path, architecture: item.architecture })) }));
} catch (error) {
  await json("inspection-error.json", { phase, error: error.message });
  throw error;
} finally {
  if (mounted) await execute("/usr/bin/hdiutil", ["detach", mount]);
}
