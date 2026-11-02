import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";

// Own the vendor process and forward its original MCP byte stream. macOS's
// native host checks node_repl's real parent, so its parent is the unchanged,
// signed Codex CLI using the official app-server process API.
export async function openMacOfficialRuntime({ cli, nodeRepl, cwd, env, onEvent = () => {} }) {
  if (process.platform !== "darwin") throw new Error("Mac 官方浏览运行库需要 macOS。");
  if (![cli, nodeRepl, cwd, env?.CODEX_HOME].every(value => typeof value === "string" && path.isAbsolute(value)))
    throw new Error("Mac 官方浏览运行库路径不完整。");
  await fs.mkdir(env.CODEX_HOME, { recursive: true });
  const child = spawn(cli, ["app-server"], { cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  const runtime = new EventEmitter(), pending = new Map();
  runtime.stdout = new PassThrough(); runtime.stderr = new PassThrough();
  runtime.serverPid = child.pid;
  const processHandle = "qqclaw-browser-" + randomUUID();
  const decoder = new StringDecoder("utf8");
  let sequence = 0, buffer = "", serverExited = false, ended = false, closing, writes = Promise.resolve();
  const observe = value => { try { onEvent(value); } catch {} };
  let resolveDone, resolveServer;
  runtime.done = new Promise(resolve => { resolveDone = resolve; });
  const serverDone = new Promise(resolve => { resolveServer = resolve; });
  const finish = (code, signal) => {
    if (ended) return;
    ended = true; runtime.stdout.end(); resolveDone({ code, signal }); runtime.emit("exit", code, signal);
  };
  const rpc = (method, params, timeout = 20000) => new Promise((resolve, reject) => {
    if (serverExited) { reject(new Error("官方浏览运行进程已退出。")); return; }
    const id = ++sequence;
    const timer = timeout ? setTimeout(() => { pending.delete(id); reject(new Error("官方浏览进程请求超时：" + method)); }, timeout) : null;
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  const fail = error => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
    if (!runtime.stderr.writableEnded) runtime.stderr.write(error.message + "\n");
    finish(1); child.stdin.end(); child.kill("SIGTERM");
  };
  child.on("error", fail);
  child.stdin.on("error", error => { if (!serverExited) fail(error); });
  child.stderr.on("data", bytes => { if (!runtime.stderr.writableEnded) runtime.stderr.write(bytes); });
  child.stdout.on("data", bytes => {
    buffer += decoder.write(bytes);
    if (buffer.length > 32 * 1024 * 1024) { fail(new Error("官方浏览进程的控制消息过大。")); return; }
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let value;
      try { value = JSON.parse(line); } catch { fail(new Error("官方浏览进程返回了无效控制消息。")); return; }
      const request = pending.get(value.id);
      if (request) {
        clearTimeout(request.timer); pending.delete(value.id);
        value.error ? request.reject(new Error(value.error.message || "官方进程请求失败。")) : request.resolve(value.result);
      } else if (value.method === "process/outputDelta" && value.params?.processHandle === processHandle) {
        const stream = value.params.stream === "stderr" ? runtime.stderr : runtime.stdout;
        const data = Buffer.from(value.params.deltaBase64, "base64");
        observe({ method: value.method, stream: value.params.stream, bytes: data.length });
        if (!stream.writableEnded) stream.write(data);
      } else if (value.method === "process/exited" && value.params?.processHandle === processHandle) {
        observe({ method: value.method, params: value.params }); finish(value.params.exitCode, value.params.signal);
      } else if (value.id !== undefined && value.method) {
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: value.id, error: { code: -32601, message: "This process host does not implement interactive app-server requests" } }) + "\n");
      }
    }
  });
  child.once("exit", (code, signal) => {
    serverExited = true;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("官方浏览进程已退出。")); }
    pending.clear(); observe({ method: "app-server-exited", code, signal });
    finish(code, signal); runtime.stderr.end(); resolveServer({ code, signal });
  });
  runtime.stdin = new Writable({
    write(chunk, encoding, callback) {
      writes = writes.then(() => rpc("process/writeStdin", { processHandle, deltaBase64: chunk.toString("base64") }, 0));
      writes.then(() => callback(), callback);
    },
    final(callback) {
      writes = writes.then(() => rpc("process/writeStdin", { processHandle, closeStdin: true }, 0));
      writes.then(() => callback(), callback);
    },
  });
  runtime.stdin.on("error", error => { if (!ended) fail(error); });
  const waitBriefly = async promise => {
    let timer;
    try { await Promise.race([promise, new Promise(resolve => { timer = setTimeout(resolve, 2000); })]); }
    finally { clearTimeout(timer); }
  };
  runtime.close = () => closing ||= (async () => {
    if (!ended) { runtime.stdin.end(); await waitBriefly(runtime.done); }
    if (!ended && !serverExited) { try { await rpc("process/kill", { processHandle }); } catch {} }
    if (!serverExited) { child.stdin.end(); await waitBriefly(serverDone); }
    if (!serverExited) { child.kill("SIGTERM"); await waitBriefly(serverDone); }
    if (!serverExited) { child.kill("SIGKILL"); await serverDone; }
    // The original CLI may start plugin discovery children. They share this
    // private process group and must stop before its temporary home is removed.
    try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    let timer;
    await new Promise(resolve => { timer = setTimeout(resolve, 100); });
    clearTimeout(timer);
    try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  })();
  try {
    await rpc("initialize", { clientInfo: { name: "qqclaw_browser_runtime", version: "1" }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n");
    const result = await rpc("process/spawn", { command: [nodeRepl], processHandle, cwd, tty: false,
      streamStdin: true, streamStdoutStderr: true, timeoutMs: null, outputBytesCap: null });
    observe({ method: "process/spawn", serverPid: child.pid, processHandle, result });
    if (ended) throw new Error("官方 Node REPL 在初始化前已退出。");
    return runtime;
  } catch (error) { await runtime.close(); throw error; }
}
