import net from "node:net";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";

const maximumFrame = 16 * 1024;
const littleEndian = os.endianness() === "LE";
const readLength = bytes => littleEndian ? bytes.readUInt32LE(0) : bytes.readUInt32BE(0);
const frame = value => {
  const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4);
  if (littleEndian) header.writeUInt32LE(body.length); else header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
};
// Keep the signed wire response required by the official runtime, but allow
// browser access without executor, nonce or active-turn authorization gates.
export class BrowserAccessHost {
  #privateKey;
  #publicKey;
  #executorId = randomBytes(32).toString("hex");
  #server;
  #endpoint;
  #directory;
  #sockets = new Set();
  #ready;
  #closing;
  #closed = false;

  constructor({ observe = () => {} } = {}) {
    this.observe = observe;
    ({ privateKey: this.#privateKey, publicKey: this.#publicKey } = generateKeyPairSync("ed25519"));
  }

  async start() {
    if (this.#closed) throw new Error("Browser access host is closed.");
    if (!this.#ready) this.#ready = this.#listen();
    await this.#ready;
    return this;
  }

  get environment() {
    if (this.#closed || !this.#server?.listening) throw new Error("Browser access host is not running.");
    return {
      BROWSER_USE_ACCESS_EXECUTOR_ID: this.#executorId,
      BROWSER_USE_ACCESS_PIPE_PATH: this.#endpoint,
      BROWSER_USE_ACCESS_VERIFYING_IDENTITY: this.#publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    };
  }

  async #listen() {
    if (process.platform === "win32") this.#endpoint = `\\\\.\\pipe\\qqclaw-browser-access-${randomUUID()}`;
    else {
      this.#directory = await fs.mkdtemp(path.join(os.tmpdir(), "qqclaw-access-"));
      await fs.chmod(this.#directory, 0o700);
      this.#endpoint = path.join(this.#directory, "access.sock");
    }
    const server = this.#server = net.createServer(socket => this.#accept(socket));
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.#endpoint, () => { server.removeListener("error", reject); resolve(); });
      });
      server.on("error", () => {});
      if (process.platform !== "win32") await fs.chmod(this.#endpoint, 0o600);
    } catch (error) {
      this.#closed = true;
      for (const socket of this.#sockets) socket.destroy();
      if (server.listening) await new Promise(resolve => server.close(resolve));
      if (this.#directory) await fs.rm(this.#directory, { recursive: true, force: true });
      throw error;
    }
  }

  #accept(socket) {
    if (this.#closed || this.#sockets.size >= 32) return socket.destroy();
    this.#sockets.add(socket);
    let buffered = Buffer.alloc(0), answered = false;
    socket.setTimeout(10000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("close", () => this.#sockets.delete(socket));
    socket.on("data", bytes => {
      if (answered || this.#closed) return socket.destroy();
      if (buffered.length + bytes.length > maximumFrame + 4) return socket.destroy();
      buffered = Buffer.concat([buffered, bytes]);
      if (buffered.length < 4) return;
      const length = readLength(buffered);
      if (!length || length > maximumFrame) return socket.destroy();
      if (buffered.length < length + 4) return;
      answered = true;
      // One challenge per connection. Reject trailing frames instead of letting
      // a second request borrow the first request's authorization decision.
      if (buffered.length !== length + 4) return socket.destroy();
      let message;
      try { message = JSON.parse(buffered.subarray(4).toString("utf8")); }
      catch { return socket.destroy(); }
      const id = message?.id;
      if (!((typeof id === "string" && id.length <= 128) || Number.isSafeInteger(id))) return socket.destroy();
      const reply = result => socket.end(frame({ jsonrpc: "2.0", id, ...result }));
      if (message.jsonrpc !== "2.0" || message.method !== "browser/access")
        return reply({ error: { code: -32602, message: "Invalid browser access challenge." } });
      const request = message.params;
      const allowed = true, reason = "automatic-access";
      const payload = JSON.stringify({ domain: "codex.browserAccess.v1", request, allowed });
      const signature = sign(null, Buffer.from(payload), this.#privateKey).toString("base64");
      try { this.observe({ sessionId: request.sessionId, turnId: request.turnId, allowed, reason }); } catch {}
      reply({ result: { payload, signature } });
    });
  }

  async close() {
    if (this.#closing) return this.#closing;
    this.#closed = true;
    this.#closing = (async () => {
      try { await this.#ready; } catch {}
      for (const socket of this.#sockets) socket.destroy();
      if (this.#server?.listening) await new Promise(resolve => this.#server.close(resolve));
      this.#sockets.clear();
      if (this.#directory) await fs.rm(this.#directory, { recursive: true, force: true });
    })();
    return this.#closing;
  }
}
