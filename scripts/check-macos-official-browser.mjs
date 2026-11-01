import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { macOfficialTransport } from "../backend/macos-browser-transport.mjs";
import { inspectMacBrowserIdentity } from "../backend/macos-browser-identity.mjs";
import { BrowserAccessHost } from "../backend/browser-access.mjs";
import { elicitationForm, simpleConsent, validateForm } from "../backend/codex-approvals.mjs";

if (process.platform !== "darwin") throw Error("This check requires native macOS.");
const option = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const output = path.resolve(option("--output"));
const runtime = path.resolve(option("--runtime"));
const cli = path.resolve(option("--cli"));
const tabMode = option("--tab-mode") || "create";
if (!["create", "claim"].includes(tabMode)) throw Error("Unsupported official tab check mode");
const hostProbes = [];
const fixtureOwner = process.argv.includes("--profile-isolation") ? randomUUID() : "";
const fixtureProfile = "68ee7e2f79164e3b914697018ee61b44";
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
const createdUrl = url + "?official-created=" + randomUUID();
await write("browser-options.json", { profile, extensionPath: path.join(runtime, "extension"), url, diagnostics: true, ...(fixtureOwner ? { fixtureOwner, fixtureProfile } : {}) });
const browser = spawn(build.executable, [], { detached: true, env: { ...process.env, RUST_LOG: "debug", CODEX_HOME: path.join(output, "codex"),
  QQCLAW_CHECK_OPTIONS: path.join(output, "browser-options.json"), QQCLAW_CHECK_NATIVE_TABS: path.join(output, "native-tabs.json"), QQCLAW_CHECK_STOP: path.join(output, "stop") }, stdio: ["ignore", "pipe", "pipe"] });
let browserLog = "", repl, replLog = "", result = { passed: false }, active = true;
const notifications = [], socketSnapshots = [], hostRequests = [], fixtureDecisions = [];
const processEvents = [];
browser.stdout.on("data", b => browserLog += b); browser.stderr.on("data", b => browserLog += b);
const browserExit = new Promise(resolve => browser.once("exit", (code, signal) => resolve({ code, signal })));
const task = { sessionId: randomUUID(), turnId: randomUUID() }, accessEvents = [];
const access = await new BrowserAccessHost({ authorize: request => active && request.sessionId === task.sessionId && request.turnId === task.turnId,
  observe: value => accessEvents.push(value) }).start();

try {
  // This base fixture has exactly one private profile and one exact copied
  // host. Multiple-profile checks additionally require profile association.
  const transport = await macOfficialTransport({ browserPid: browser.pid, applicationPid: browser.pid, nativeHost, profileDirectory: fixtureOwner ? path.join(profile, fixtureProfile) : undefined, onProbe: value => { if (!hostProbes.some(old => JSON.stringify(old) === JSON.stringify(value))) hostProbes.push(value); } });
  await write("transport.json", transport);
  const installation = { paths: Object.fromEntries(Object.entries(manifest.paths).map(([key, value]) =>
    [key, Array.isArray(value) ? value.map(item => path.join(runtime, item)) : path.join(runtime, value)])) };
  const identity = await inspectMacBrowserIdentity({ installation, transport, identityUrl: url, sessionId: task.sessionId, directory: output });
  const otherIdentity = await inspectMacBrowserIdentity({ installation, transport, identityUrl: url + "?wrong-profile=" + randomUUID(), sessionId: task.sessionId, directory: output });
  await write("profile-identity-proof.json", { identity, otherIdentity, scope: "Actual official user.openTabs response: own native fixture marker accepted, absent marker rejected; single profile only." });
  if (!identity.matched || otherIdentity.matched) throw Error("The original browser API did not distinguish the actual native marker from an absent marker");
  const modules = manifest.paths.nodeModuleDirs.map(name => path.join(runtime, name));
  const env = { ...process.env, ...access.environment, CODEX_HOME: path.join(output, "codex"), CODEX_CLI_PATH: cli,
    NODE_REPL_TRACE_META: "1",
    NODE_REPL_NODE_PATH: path.join(runtime, manifest.paths.nodePath), NODE_REPL_NODE_MODULE_DIRS: modules.join(":"),
    NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ browser: path.join(runtime, manifest.paths.browserServicePath) }),
    NODE_REPL_TRUSTED_CODE_PATHS: [path.join(runtime, "plugin"), ...modules].join(":"),
    CUA_REPL_ENABLED_SURFACES: "browser", BROWSER_USE_BACKEND_PATHS: transport.paths[0] };
  // Launch the actual product stdio entry, not a check-only implementation.
  repl = spawn(path.join(runtime, manifest.paths.nodePath), [path.resolve(option("--mcp-entry") || path.join(import.meta.dirname, "macos-official-mcp.mjs")), runtime],
    { cwd: output, env, stdio: ["pipe", "pipe", "pipe"] });
  const entryExit = new Promise(resolve => repl.once("exit", (code, signal) => resolve({ code, signal })));
  repl.close = async () => {
    repl.stdin.end();
    let timer;
    const ended = await Promise.race([entryExit, new Promise(resolve => timer = setTimeout(() => resolve(null), 8000))]);
    clearTimeout(timer);
    if (!ended) { repl.kill("SIGTERM"); throw Error("The product MCP entry did not exit after stdin EOF"); }
    if (ended.code !== 0) throw Error("The product MCP entry exited unsuccessfully: " + JSON.stringify(ended));
  };
  let next = 0, buffered = ""; const pending = new Map(), unexpectedRequests = [];
  repl.stderr.on("data", b => replLog += b);
  repl.stdout.on("data", bytes => {
    buffered += bytes;
    while (buffered.includes("\n")) {
      const end = buffered.indexOf("\n"), line = buffered.slice(0, end); buffered = buffered.slice(end + 1); if (!line.trim()) continue;
      const value = JSON.parse(line), request = pending.get(value.id);
      if (request) { clearTimeout(request.timer); pending.delete(value.id); value.error ? request.reject(Error(JSON.stringify(value.error))) : request.resolve(value.result); }
      else if (value.id !== undefined && value.method) {
        hostRequests.push(value);
        const params = value.params || {}, meta = params._meta || params.meta || {};
        const form = elicitationForm({ ...params, mode: params.mode || "form" });
        const content = form ? simpleConsent(form) : null;
        // This automated fixture owns only its newly created loopback page.
        // It is not a human approval and grants no external site, account,
        // history, upload, download, raw-CDP or persistent permission.
        const allowed = value.method === "elicitation/create" && active && meta.connector_id === "browser-use" &&
          meta.tool_name === "access_browser_origin" && meta.origin === new URL(url).origin &&
          meta.tool_params?.origin === meta.origin && content !== null;
        if (allowed) {
          validateForm(form, content); fixtureDecisions.push({ id: value.id, origin: meta.origin, decisionSource: "isolated-fixture-owner", action: "accept" });
          repl.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: value.id, result: { action: "accept", content, _meta: null } }) + "\n");
        } else {
          unexpectedRequests.push(value);
          repl.stdin.write(JSON.stringify(value.method === "elicitation/create" ? { jsonrpc: "2.0", id: value.id, result: { action: "decline", content: null, _meta: null } } :
            { jsonrpc: "2.0", id: value.id, error: { code: -32601, message: "Outside the isolated fixture's authority" } }) + "\n");
        }
      } else notifications.push(value);
    }
  });
  repl.once("exit", () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error("Original Node REPL exited")); } pending.clear(); });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(Error("Timed out: " + method)); }, 45000);
    pending.set(id, { resolve, reject, timer }); repl.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  await request("initialize", { protocolVersion: "2025-06-18", capabilities: { elicitation: { form: {} } }, clientInfo: { name: "qqclaw_mac_official_component_check", version: "1" } });
  repl.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const tools = await request("tools/list", {}); await write("tools.json", tools);
  const call = async (name, code) => {
    const value = await request("tools/call", { name: "js", arguments: { code, timeout_ms: 30000 },
      _meta: { "x-codex-turn-metadata": { session_id: task.sessionId, turn_id: task.turnId, thread_source: "qqclaw_integration_check" } } });
    await write(name + ".json", value);
    for (const [index, item] of (value.content || []).entries()) if (item.type === "image")
      await fs.writeFile(path.join(output, name + "-" + index + (item.mimeType === "image/png" ? ".png" : ".jpg")), Buffer.from(item.data, "base64"));
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
  const rust = peerProcesses.filter(p => p.executable === path.join(runtime, manifest.paths.nodeReplPath));
  if (rust.length !== 1 || !peerProcesses.some(p => p.pid === rust[0].parent && p.executable === cli))
    throw Error("The product MCP entry did not preserve the original CLI as Node REPL's actual parent");
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
  const selectTab = tabMode === "create" ? 'var tab=await browser.tabs.new();' :
    'var openTabs=await browser.user.openTabs(); var fixtureTab=openTabs.find(item=>item.url===' + JSON.stringify(url) + '); if(!fixtureTab) throw Error("The actual embedded fixture tab was not found"); var tab=await browser.user.claimTab(fixtureTab);';
  await call("tab-open", 'await browser.nameSession("🔎 Mac 浏览验证"); ' + selectTab + ' await tab.goto(' + JSON.stringify(createdUrl) + '); nodeRepl.write("QQCLAW_AX_AVAILABLE="+!!tab.ax); if(tab.ax) await tab.ax.write(); else nodeRepl.write(await tab.playwright.domSnapshot()); await nodeRepl.emitImage(await tab.screenshot({fullPage:false}))');
  const entered = "QQClaw Mac 输入验证";
  await call("tab-input", 'var axState=await tab.ax.get("state",{disableDiffing:true}); nodeRepl.write(axState); var inputMatch=axState.match(/^\\s*(\\d+)\\s+text field \\(settable\\) Verification input\\b/m); if(!inputMatch) throw Error("The actual AX state did not expose the fixture input"); await tab.ax.typeText(Number(inputMatch[1]),' + JSON.stringify(entered) + '); await tab.ax.write(); await nodeRepl.emitImage(await tab.screenshot({fullPage:false}))');
  for (let retry = 0; retry < 20 && !observations.includes(entered); retry++) await delay(100);
  if (!observations.includes(entered)) throw Error("The real local page did not receive the expected input event");
  let nativeTabs;
  for (let retry = 0; retry < 20; retry++) {
    nativeTabs = JSON.parse(await fs.readFile(path.join(output, "native-tabs.json"), "utf8"));
    if (nativeTabs.tabs.some(tab => tab.url === createdUrl && tab.attached)) break;
    await delay(100);
  }
  if (!nativeTabs.tabs.some(tab => tab.url === createdUrl && tab.attached)) throw Error("The official new tab is not embedded in the product browser pane: " + JSON.stringify(nativeTabs));
  await call("tab-close", 'var closedTabId=tab.id; await tab.close(); nodeRepl.write("Close requested for "+closedTabId)');
  await call("tab-closed-state", 'var remainingTabs=await browser.tabs.list(); if(remainingTabs.some(item=>item.id===closedTabId)) throw Error("The original extension still lists the closed tab after its close request completed"); nodeRepl.write("QQCLAW_CLOSED="+JSON.stringify({closedTabId,remainingTabs}))');
  const schemaFolder = path.join(output, "api-types");
  try {
    await exec(cli, ["app-server", "generate-ts", "--experimental", "--out", schemaFolder], { env, timeout: 20000, maxBuffer: 1024 * 1024 });
    const schema = [];
    for (const file of await fs.readdir(schemaFolder, { recursive: true })) if (/(?:ProcessSpawnParams|CommandExecParams|McpServerToolCallParams)\.ts$/.test(file))
      schema.push({ file, text: await fs.readFile(path.join(schemaFolder, file), "utf8") });
    await write("original-process-api.json", schema);
  } catch (error) { await write("original-process-api.json", { error: error.message }); }
  result = { passed: true, connected: true, tabMode, tabCreated: tabMode === "create", tabOpened: true, inputObserved: entered, tabClosed: true, embedded: true, nativeTabs, fixtureOwner, transport, task, accessEvents, unexpectedRequests,
    scope: "Actual original official extension on Mac CEF; tabMode=" + tabMode + ": navigate, read AX, type Chinese, observe real input event, screenshot, verify embedding and close. Claim mode does not prove tabs.new embedding. Owned local fixture only; no model, WeChat or full product GUI." };
} catch (error) { result = { ...result, error: error.stack, accessEvents }; process.exitCode = 1; }
finally {
  active = false;
  if (repl) { try { await repl.close(); } catch (error) { result.passed = false; result.error = error.message; process.exitCode = 1; } }
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
  await write("host-process-probes.json", hostProbes);
  await write("host-requests.json", hostRequests); await write("fixture-decisions.json", fixtureDecisions);
  await write("original-cli-process-events.json", processEvents);
  await fs.writeFile(path.join(output, "browser.log"), browserLog); await fs.writeFile(path.join(output, "repl.log"), replLog);
  if (result.passed && exit?.code !== 0) { result.passed = false; result.error = "The native browser did not exit normally"; process.exitCode = 1; }
  await write("result.json", { ...result, exit, observations }); console.log(JSON.stringify({ ...result, exit }));
}
