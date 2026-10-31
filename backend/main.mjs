import { createInterface } from "node:readline";
import { App } from "./app.mjs";
import { safeError } from "./store.mjs";
import { createLogger } from "./log.mjs";

const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const nativePending = new Map();
let next = 0;
const native = (method, params) =>
  new Promise((resolve, reject) => {
    const id = `native-${++next}`;
    const timer = setTimeout(() => {
      nativePending.delete(id);
      reject(new Error("原生窗口响应超时。"));
    }, 30000);
    nativePending.set(id, { resolve, reject, timer });
    send({ kind: "native", id, method, params });
  });
let app;
const log = createLogger(process.env.QQCLAW_DATA_DIR, () => app?.store.state?.providers.map((p) => p.apiKey) || []);
let closing;
let crashing = false;
const close = () => closing ||= Promise.resolve().then(() => app.close());
process.on("unhandledRejection", (error) => log("ERROR", error));
process.on("uncaughtException", (error) => {
  log("FATAL", error);
  if (crashing) return;
  crashing = true;
  const timer = setTimeout(() => process.exit(1), 3000);
  close().catch(() => {}).finally(() => { clearTimeout(timer); process.exit(1); });
});
app = new App({
  directory: process.env.QQCLAW_DATA_DIR,
  native,
  log,
  emit: (event, data) => send({ kind: "event", event, data }),
});
const ready = app.init();
const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  let request;
  try {
    request = JSON.parse(line);
    if (request.kind === "nativeResponse") {
      const pending = nativePending.get(request.id);
      if (!pending) return;
      nativePending.delete(request.id);
      clearTimeout(pending.timer);
      request.error
        ? pending.reject(new Error(request.error))
        : pending.resolve(request.result);
      return;
    }
    await ready;
    if (request.method === "shutdown") {
      await close();
      if (!crashing) log("INFO", "后端正常关闭。");
      send({ id: request.id, result: true });
      process.exit(crashing ? 1 : 0);
    }
    const result = await app.handle(request.method, request.params || {});
    send({ id: request.id, result });
  } catch (error) {
    send({
      id: request?.id,
      error: safeError(
        error,
        app.store.state?.providers.map((p) => p.apiKey),
      ),
    });
  }
});
rl.on("close", () => {
  if (crashing) return;
  close()
    .catch(() => {})
    .finally(() => { if (!crashing) log("INFO", "后端正常关闭。"); process.exit(crashing ? 1 : 0); });
});
ready.then(
  () => { log("INFO", "后端已启动。"); send({ kind: "event", event: "ready", data: true }); },
  (error) => {
    send({ kind: "event", event: "fatal", data: safeError(error) });
  },
);
