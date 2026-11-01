import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { BrowserAccessHost } from "../backend/browser-access.mjs";

if (process.platform !== "darwin") throw Error("This check requires native macOS.");
const option = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const output = path.resolve(option("--output"));
const runtime = path.resolve(option("--runtime"));
const cli = path.resolve(option("--cli"));
const build = JSON.parse(await fs.readFile(path.join(path.resolve(option("--build")), "mac-browser-build.json"), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(runtime, "runtime.json"), "utf8"));
const exec = promisify(execFile), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
await fs.mkdir(path.join(output, "codex"), { recursive: true });
const write = (name, value) => fs.writeFile(path.join(output, name), JSON.stringify(value, null, 2));
const profile = path.join(output, "profile"), hostDirectory = path.join(output, "native-host");
await fs.mkdir(path.join(profile, "NativeMessagingHosts"), { recursive: true });
await fs.mkdir(hostDirectory, { recursive: true });
const nativeHost = path.join(hostDirectory, "ChatGPT for Chrome");
await fs.copyFile(path.join(runtime, manifest.paths.host), nativeHost); await fs.chmod(nativeHost, 0o755);
await exec("/usr/bin/codesign", ["--verify", "--strict", nativeHost]);
await fs.writeFile(path.join(hostDirectory, "extension-host-config.json"), JSON.stringify({ schemaVersion: 1, channel: "prod",
  codexCliPath: cli, codexHome: path.join(output, "codex"), nodePath: path.join(runtime, manifest.paths.nodePath),
  nodeReplPath: path.join(runtime, manifest.paths.nodeReplPath), browserClientPath: path.join(runtime, manifest.paths.browserClientPath), proxyHost: "127.0.0.1", proxyPort: 0 }));
await fs.writeFile(path.join(profile, "NativeMessagingHosts/com.openai.codexextension.json"), JSON.stringify({
  name: "com.openai.codexextension", description: "QQClaw isolated original host check", type: "stdio", path: nativeHost,
  allowed_origins: ["chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/"] }));
const observations = [];
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/observed") { observations.push(url.searchParams.get("value")); response.end("ok"); return; }
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end('<!doctype html><meta charset="utf-8"><title>QQClaw official Mac check</title><h1>Official Mac browser integration</h1><label>Verification input<input aria-label="Verification input" oninput="fetch(\'/observed?value=\'+encodeURIComponent(this.value))"></label>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = "http://127.0.0.1:" + server.address().port + "/";
await write("browser-options.json", { profile, extensionPath: path.join(runtime, "extension"), url, diagnostics: true });
const browser = spawn(build.executable, [], { detached: true, env: { ...process.env, RUST_LOG: "debug", CODEX_HOME: path.join(output, "codex"),
  QQCLAW_CHECK_OPTIONS: path.join(output, "browser-options.json"), QQCLAW_CHECK_STOP: path.join(output, "stop") }, stdio: ["ignore", "pipe", "pipe"] });
let browserLog = "", repl, replLog = "", result = { passed: false }, active = true;
const notifications = [], socketSnapshots = [];
const processEvents = [];
browser.stdout.on("data", b => browserLog += b); browser.stderr.on("data", b => browserLog += b);
const browserExit = new Promise(resolve => browser.once("exit", (code, signal) => resolve({ code, signal })));
const task = { sessionId: randomUUID(), turnId: randomUUID() }, accessEvents = [];
const access = await new BrowserAccessHost({ authorize: request => active && request.sessionId === task.sessionId && request.turnId === task.turnId,
  observe: value => accessEvents.push(value) }).start();
async function launchOriginalRuntime(env) {
  // The vendor's nativePipe capability connects from node_repl itself. On
  // macOS its real parent must be an allowed signed process. Use the official
  // app-server process API, as a real Codex-owned MCP startup would do; do not
  // forge metadata, executable identity, signatures or socket responses.
  const server = spawn(cli, ["app-server"], { detached: true, env, stdio: ["pipe", "pipe", "pipe"] });
  const runtimeProcess = new EventEmitter();
  runtimeProcess.stdout = new PassThrough(); runtimeProcess.stderr = new PassThrough();
  runtimeProcess.serverPid = server.pid;
  const processHandle = "qqclaw-original-runtime-" + randomUUID();
  let sequence = 0, buffer = "", writes = Promise.resolve(), serverExited = false; const requests = new Map();
  const rpc = (method, params) => new Promise((resolve, reject) => {
    if (serverExited) { reject(Error("Original app-server has exited")); return; }
    const id = ++sequence, timer = setTimeout(() => { requests.delete(id); reject(Error("App-server timed out: " + method)); }, 20000);
    requests.set(id, { resolve, reject, timer }); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  server.stderr.on("data", bytes => replLog += bytes);
  server.stdout.on("data", bytes => {
    buffer += bytes;
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!line.trim()) continue;
      const value = JSON.parse(line), request = requests.get(value.id);
      if (request) { clearTimeout(request.timer); requests.delete(value.id); value.error ? request.reject(Error(JSON.stringify(value.error))) : request.resolve(value.result); }
      else if (value.method === "process/outputDelta" && value.params?.processHandle === processHandle) {
        processEvents.push({ at: Date.now(), method: value.method, stream: value.params.stream, bytes: Buffer.from(value.params.deltaBase64, "base64").length });
        const stream = value.params.stream === "stderr" ? runtimeProcess.stderr : runtimeProcess.stdout;
        stream.write(Buffer.from(value.params.deltaBase64, "base64"));
      } else if (value.method === "process/exited" && value.params?.processHandle === processHandle) {
        processEvents.push({ at: Date.now(), method: value.method, params: value.params }); runtimeProcess.emit("exit", value.params.exitCode);
      }
      else if (value.id !== undefined && value.method) server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: value.id, error: { code: -32601, message: "No interactive requests are expected in this process integration check" } }) + "\n");
    }
  });
  server.once("exit", (code, signal) => {
    processEvents.push({ at: Date.now(), method: "app-server-exited", code, signal });
    serverExited = true;
    for (const p of requests.values()) { clearTimeout(p.timer); p.reject(Error("Original app-server exited")); } requests.clear();
    runtimeProcess.emit("exit", code, signal);
  });
  server.stdin.on("error", error => { replLog += "App-server stdin: " + error.message + "\n"; });
  runtimeProcess.stdin = new Writable({
    write(chunk, encoding, callback) { writes = writes.then(() => rpc("process/writeStdin", { processHandle, deltaBase64: chunk.toString("base64") })); writes.then(() => callback(), callback); },
    final(callback) { writes = writes.then(() => rpc("process/writeStdin", { processHandle, closeStdin: true })); writes.then(() => callback(), callback); },
  });
  runtimeProcess.stdin.on("error", error => { replLog += "Runtime stdin: " + error.message + "\n"; });
  runtimeProcess.close = async () => {
    try { await rpc("process/kill", { processHandle }); } catch {}
    server.stdin.end(); try { process.kill(-server.pid, "SIGTERM"); } catch {}
  };
  try {
    await rpc("initialize", { clientInfo: { name: "qqclaw_mac_process_integration", version: "1" }, capabilities: { experimentalApi: true } });
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n");
    const spawned = await rpc("process/spawn", { command: [path.join(runtime, manifest.paths.nodeReplPath)], processHandle, cwd: output,
      tty: false, streamStdin: true, streamStdoutStderr: true, timeoutMs: 180000, outputBytesCap: 16 * 1024 * 1024 });
    await write("original-cli-process-spawn.json", { serverPid: server.pid, processHandle, result: spawned, documentation: "https://developers.openai.com/codex/app-server#process-execution" });
    const processes = (await exec("/bin/ps", ["-axo", "pid=,ppid=,comm="])).stdout.split("\n").flatMap(line => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/); return match ? [{ pid: Number(match[1]), parent: Number(match[2]), executable: match[3] }] : [];
    });
    const matches = processes.filter(p => p.parent === server.pid && p.executable === path.join(runtime, manifest.paths.nodeReplPath));
    if (matches.length !== 1) throw Error("The original CLI did not own exactly one Node REPL process");
    runtimeProcess.pid = matches[0].pid; return runtimeProcess;
  } catch (error) { await runtimeProcess.close(); throw error; }
}
try {
  let transport;
  for (let retry = 0; retry < 45; retry++) {
    const processes = (await exec("/bin/ps", ["-axo", "pid=,ppid=,comm="])).stdout.split("\n").flatMap(line => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/); return match ? [{ pid: Number(match[1]), parent: Number(match[2]), command: match[3] }] : [];
    });
    const owned = processes.filter(value => value.command === nativeHost).filter(value => {
      const seen = new Set(); let current = value;
      while (current && !seen.has(current.pid)) { if (current.parent === browser.pid) return true; seen.add(current.pid); current = processes.find(p => p.pid === current.parent); } return false;
    });
    if (owned.length === 1) {
      const sockets = await exec("/usr/sbin/lsof", ["-a", "-p", String(owned[0].pid), "-U", "-Fn"]).catch(() => ({ stdout: "" }));
      const paths = [...new Set(sockets.stdout.split("\n").filter(line => /^n\/(?:private\/)?tmp\/codex-browser-use\/[^/\s]+$/.test(line)).map(line => line.slice(1)))];
      if (paths.length === 1) { transport = { browserPid: browser.pid, hostPid: owned[0].pid, nativeHost, paths, verifiedOwned: true }; break; }
    }
    if (browser.exitCode !== null) throw Error("Native browser exited before official host discovery");
    await delay(500);
  }
  if (!transport) throw Error("The private CEF profile did not launch one owned official host/socket");
  await write("transport.json", transport);
  const modules = manifest.paths.nodeModuleDirs.map(name => path.join(runtime, name));
  const env = { ...process.env, ...access.environment, CODEX_HOME: path.join(output, "codex"), CODEX_CLI_PATH: cli,
    NODE_REPL_TRACE_META: "1",
    NODE_REPL_NODE_PATH: path.join(runtime, manifest.paths.nodePath), NODE_REPL_NODE_MODULE_DIRS: modules.join(":"),
    NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ browser: path.join(runtime, manifest.paths.browserServicePath) }),
    NODE_REPL_TRUSTED_CODE_PATHS: [path.join(runtime, "plugin"), ...modules].join(":"),
    CUA_REPL_ENABLED_SURFACES: "browser", BROWSER_USE_BACKEND_PATHS: transport.paths[0] };
  repl = await launchOriginalRuntime(env);
  let next = 0, buffered = ""; const pending = new Map(), unexpectedRequests = [];
  repl.stderr.on("data", b => replLog += b);
  repl.stdout.on("data", bytes => {
    buffered += bytes;
    while (buffered.includes("\n")) {
      const end = buffered.indexOf("\n"), line = buffered.slice(0, end); buffered = buffered.slice(end + 1); if (!line.trim()) continue;
      const value = JSON.parse(line), request = pending.get(value.id);
      if (request) { clearTimeout(request.timer); pending.delete(value.id); value.error ? request.reject(Error(JSON.stringify(value.error))) : request.resolve(value.result); }
      else if (value.id !== undefined && value.method) {
        unexpectedRequests.push(value); repl.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: value.id, error: { code: -32601, message: "This check has no interactive approval UI" } }) + "\n");
      } else notifications.push(value);
    }
  });
  repl.once("exit", () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error("Original Node REPL exited")); } pending.clear(); });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(Error("Timed out: " + method)); }, 45000);
    pending.set(id, { resolve, reject, timer }); repl.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "qqclaw_mac_official_component_check", version: "1" } });
  repl.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const tools = await request("tools/list", {}); await write("tools.json", tools);
  const call = async (name, code) => {
    const value = await request("tools/call", { name: "js", arguments: { code, timeout_ms: 30000 },
      _meta: { "x-codex-turn-metadata": { session_id: task.sessionId, turn_id: task.turnId, thread_source: "qqclaw_integration_check" } } });
    await write(name + ".json", value);
    const trace = value._meta?.["codex/nodeReplTrace"];
    if (trace?.kind === "file" && typeof trace.path === "string" && trace.path.startsWith(path.join(output, "codex/node_repl/debug/") ))
      await write(name + "-trace.json", JSON.parse(await fs.readFile(trace.path, "utf8")));
    if (value.isError) throw Error("Official runtime: " + JSON.stringify(value)); return value;
  };
  const client = pathToFileURL(path.join(runtime, manifest.paths.browserClientPath)).href;
  await call("browser-bootstrap", `var {setupBrowserRuntime}=await import(${JSON.stringify(client)}); var agent=await setupBrowserRuntime()`);
  const processList = (await exec("/bin/ps", ["-axo", "pid=,ppid=,comm="])).stdout.split("\n").flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/); return match ? [{ pid: Number(match[1]), parent: Number(match[2]), executable: match[3] }] : [];
  });
  const peerProcesses = processList.filter(value => {
    let current = value; const seen = new Set();
    while (current && !seen.has(current.pid)) { if (current.pid === repl.pid) return true; seen.add(current.pid); current = processList.find(p => p.pid === current.parent); } return false;
  });
  for (const value of peerProcesses) {
    const signed = await exec("/usr/bin/codesign", ["-d", "--verbose=2", value.executable]).catch(error => ({ stdout: "", stderr: error.message }));
    value.signature = (signed.stdout + signed.stderr).split(/\r?\n/).filter(line => /^(?:Identifier|Authority|TeamIdentifier|CDHash)=/.test(line));
  }
  await write("actual-runtime-processes.json", peerProcesses);
  let available = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const value = await call("browser-list-" + attempt, 'nodeRepl.write("QQCLAW_BROWSER_LIST="+JSON.stringify(await agent.browsers.list()))');
    for (const item of value.content || []) if (item.type === "text") {
      for (const line of item.text.split(/\r?\n/)) if (line.startsWith("QQCLAW_BROWSER_LIST=")) {
        const data = JSON.parse(line.slice("QQCLAW_BROWSER_LIST=".length)); if (Array.isArray(data)) available = data;
      }
    }
    socketSnapshots.push({ attempt, process: (await exec("/bin/ps", ["-p", String(transport.hostPid), "-o", "pid=,ppid=,comm="]).catch(error => ({ stdout: "exited: " + error.code }))).stdout,
      sockets: (await exec("/usr/sbin/lsof", ["-a", "-p", String(transport.hostPid), "-U", "-Fn"]).catch(() => ({ stdout: "" }))).stdout });
    if (available.length) break;
    await delay(1000);
  }
  const connected = available.filter(value => value.type === "extension");
  if (connected.length !== 1) throw Error("Official discovery did not return exactly one owned extension browser: " + JSON.stringify(available));
  await call("browser-documentation", `var browser=await agent.browsers.get(${JSON.stringify(connected[0].id)}); nodeRepl.write(await browser.documentation())`);
  // Subsequent checks are deliberately added only after reading the actual
  // returned documentation. Discovery alone never marks this check passed.
  result = { passed: false, connected: true, transport, task, accessEvents, unexpectedRequests,
    next: "Read browser-documentation.json before adding actual page operations.",
    scope: "Original official extension/runtime on actual Mac CEF. Owned local integration task, no model or WeChat account." };
} catch (error) { result = { ...result, error: error.stack, accessEvents }; process.exitCode = 1; }
finally {
  active = false;
  if (repl) await repl.close();
  await access.close(); await fs.writeFile(path.join(output, "stop"), "stop");
  let timer; const exit = await Promise.race([browserExit, new Promise(resolve => timer = setTimeout(() => resolve(null), 8000))]); clearTimeout(timer);
  if (!exit) { try { process.kill(-browser.pid, "SIGTERM"); } catch {} }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  const diagnostics = [];
  async function collect(directory, depth = 0) {
    if (depth > 5) return;
    for (const item of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
      if (item.name === ".tmp" || item.name === "skills") continue;
      const file = path.join(directory, item.name);
      if (item.isDirectory()) await collect(file, depth + 1);
      else if (item.isFile()) {
        const stat = await fs.stat(file);
        diagnostics.push({ path: path.relative(output, file), bytes: stat.size,
          ...(/\.log(?:\.\d+)?$|\.jsonl$/.test(item.name) && stat.size < 2 * 1024 * 1024 ? { text: await fs.readFile(file, "utf8") } : {}) });
      }
    }
  }
  await collect(path.join(output, "codex")); await write("runtime-diagnostics.json", diagnostics);
  const sqlite = path.join(output, "codex/logs_2.sqlite");
  const logs = await exec("/usr/bin/sqlite3", [sqlite, ".dump"], { maxBuffer: 2 * 1024 * 1024 }).catch(error => ({ stdout: error.message }));
  await fs.writeFile(path.join(output, "runtime-sqlite.log"), logs.stdout);
  await write("notifications.json", notifications); await write("socket-snapshots.json", socketSnapshots);
  await write("original-cli-process-events.json", processEvents);
  await fs.writeFile(path.join(output, "browser.log"), browserLog); await fs.writeFile(path.join(output, "repl.log"), replLog);
  await write("result.json", { ...result, exit, observations }); console.log(JSON.stringify({ ...result, exit }));
}
