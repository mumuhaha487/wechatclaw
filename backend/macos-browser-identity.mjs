import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { pathToFileURL } from "node:url";
import { openMacOfficialRuntime } from "./macos-official-runtime.mjs";
import { BrowserAccessHost } from "./browser-access.mjs";
import { macOfficialTransports } from "./macos-browser-transport.mjs";

export async function matchMacBrowserProfile({ installation, identityUrl, sessionId, directory, browserPid, applicationPid, nativeHost, observe = () => {} }) {
  const deadline = Date.now() + 22000;
  do {
    const candidates = await macOfficialTransports({ browserPid, applicationPid, nativeHost, timeoutMs: Math.max(1, deadline - Date.now()) });
    const matches = [];
    for (const transport of candidates) {
      const result = await inspectMacBrowserIdentity({ installation, transport, identityUrl, sessionId, directory });
      observe({ hostPid: transport.hostPid, ...result });
      if (result.matched) matches.push(transport);
    }
    if (matches.length > 1) throw new Error("多个浏览配置包含同一个会话标记，无法确认账号归属。");
    if (matches.length === 1) return { ...matches[0], identityVerified: true };
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error("官方接口未找到本会话的浏览配置。");
}

// Read-only connection discovery through the original official MCP/API. A
// profile is identified by the private marker page created by our native UI.
// This client does not claim tabs, navigate pages or grant site permissions.
export async function inspectMacBrowserIdentity({ installation, transport, identityUrl, sessionId, directory }) {
  if (process.platform !== "darwin" || !/^[a-f0-9-]{36}$/i.test(sessionId || "") ||
      !path.isAbsolute(directory) || !identityUrl || transport.paths?.length !== 1 || transport.verifiedOwned !== true)
    throw new Error("Mac 浏览会话识别参数无效。");
  const { paths } = installation;
  const turnId = randomUUID(), probeHome = path.join(directory, "profile-discovery", turnId);
  let active = true, runtime, buffer = "", sequence = 0, declined = 0;
  const pending = new Map(), decoder = new StringDecoder("utf8");
  const access = await new BrowserAccessHost({ authorize: value => active && value.sessionId === sessionId && value.turnId === turnId }).start();
  const rejectPending = error => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  };
  try {
    const env = { ...process.env, ...access.environment, CODEX_HOME: probeHome, CODEX_CLI_PATH: paths.codexCliPath,
      NODE_REPL_NODE_PATH: paths.nodePath, NODE_REPL_NODE_MODULE_DIRS: paths.nodeModuleDirs.join(":"),
      NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ browser: paths.browserServicePath }),
      NODE_REPL_TRUSTED_CODE_PATHS: [path.resolve(paths.browserServicePath, "../.."), ...paths.nodeModuleDirs].join(":"),
      CUA_REPL_ENABLED_SURFACES: "browser", BROWSER_USE_BACKEND_PATHS: transport.paths[0] };
    delete env.QQCLAW_PROVIDER_API_KEY;
    runtime = await openMacOfficialRuntime({ cli: paths.codexCliPath, nodeRepl: paths.nodeReplPath, cwd: directory, env });
    runtime.stderr.on("data", () => {});
    runtime.stdout.on("data", bytes => {
      buffer += decoder.write(bytes);
      while (buffer.includes("\n")) {
        const index = buffer.indexOf("\n"), line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        let value;
        try { value = JSON.parse(line); } catch { rejectPending(new Error("官方浏览识别响应无效。")); continue; }
        const request = pending.get(value.id);
        if (request) {
          clearTimeout(request.timer); pending.delete(value.id);
          value.error ? request.reject(new Error(value.error.message || "官方浏览识别请求失败。")) : request.resolve(value.result);
        } else if (value.id !== undefined && value.method) {
          declined++;
          runtime.stdin.write(JSON.stringify(value.method === "elicitation/create" ?
            { jsonrpc: "2.0", id: value.id, result: { action: "decline", content: null, _meta: null } } :
            { jsonrpc: "2.0", id: value.id, error: { code: -32601, message: "Profile discovery only; interactive requests are not authorized" } }) + "\n");
        }
      }
    });
    void runtime.done.then(() => rejectPending(new Error("官方浏览识别进程已退出。")));
    const request = (method, params) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("官方浏览会话识别超时。")); }, 20000);
      pending.set(id, { resolve, reject, timer });
      runtime.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
    await request("initialize", { protocolVersion: "2025-06-18", capabilities: { elicitation: { form: {} } }, clientInfo: { name: "qqclaw_profile_discovery", version: "1" } });
    runtime.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const call = async code => {
      const result = await request("tools/call", { name: "js", arguments: { code, timeout_ms: 15000 },
        _meta: { "x-codex-turn-metadata": { session_id: sessionId, turn_id: turnId, thread_source: "qqclaw_profile_discovery" } } });
      if (result.isError) throw new Error("官方浏览接口无法确认会话归属：" + (result.content || []).filter(item => item.type === "text").map(item => item.text).join("\n"));
      return result;
    };
    const clientUrl = pathToFileURL(paths.browserClientPath).href;
    await call(`var {setupBrowserRuntime}=await import(${JSON.stringify(clientUrl)}); var agent=await setupBrowserRuntime()`);
    await call('var owned=[]; for(var attempt=0;attempt<12;attempt++){owned=await agent.browsers.list();if(owned.length) break; await new Promise(resolve=>setTimeout(resolve,250));} if(owned.length!==1 || owned[0].type!=="extension") throw Error("Exactly one bound official extension browser is required: "+JSON.stringify(owned)); var browser=await agent.browsers.get(owned[0].id); nodeRepl.write(await browser.documentation())');
    const result = await call('await browser.nameSession("🔎 QQClaw 连接检测"); var candidates=await browser.user.openTabs(); nodeRepl.write("QQCLAW_PROFILE_IDENTITY="+JSON.stringify({matches:candidates.filter(tab=>tab.url===' + JSON.stringify(identityUrl) + ').length}))');
    const observations = (result.content || []).filter(item => item.type === "text").flatMap(item => item.text.split(/\r?\n/)).filter(line => line.startsWith("QQCLAW_PROFILE_IDENTITY="));
    if (observations.length !== 1) throw new Error("官方接口未返回可核验的会话标记。");
    const observed = JSON.parse(observations[0].slice("QQCLAW_PROFILE_IDENTITY=".length));
    if (!Number.isSafeInteger(observed.matches) || observed.matches < 0 || observed.matches > 1 || declined)
      throw new Error("官方浏览会话标记不唯一或识别需要额外授权。");
    return { matched: observed.matches === 1, declinedRequests: declined, source: "original-official-api" };
  } finally {
    active = false; rejectPending(new Error("浏览会话识别已结束。"));
    if (runtime) await runtime.close();
    await access.close();
    await fs.rm(probeHome, { recursive: true, force: true });
  }
}
