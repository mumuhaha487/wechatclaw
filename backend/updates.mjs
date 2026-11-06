import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import manifest from "../package.json" with { type: "json" };

export const updateEndpoint = process.env.QQCLAW_UPDATE_URL || "https://claw.inc.re/api/version";
export function newerVersion(next, current) {
  if (!/^\d+\.\d+\.\d+$/.test(next)) return false;
  const a = next.split(".").map(Number), b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export class AppUpdates {
  constructor({ directory, native, emit, fetchImpl = fetch, endpoint = updateEndpoint, version = manifest.version }) {
    Object.assign(this, { native, emit, fetch: fetchImpl, endpoint, version });
    this.directory = path.join(directory, "updates");
    this.state = { status: "idle", currentVersion: version, page: "https://claw.inc.re" };
  }
  changed(changes) { Object.assign(this.state, changes); this.emit("update-status", this.state); return this.state; }
  check() {
    if (this.checking || this.downloading) return Promise.resolve(this.state);
    this.checking = this.readVersion().catch(error => this.changed({ status: "error", error: error.message })).finally(() => { this.checking = null; });
    return this.checking;
  }
  async readVersion() {
    this.changed({ status: "checking", error: "" });
    const response = await this.fetch(this.endpoint, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`版本检查失败（HTTP ${response.status}）。`);
    const release = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error("更新服务没有返回有效版本。");
    this.release = release;
    this.changed({ latestVersion: release.version, notes: release.notes || "" });
    if (!newerVersion(release.version, this.version)) return this.changed({ status: "current" });
    const location = await this.native("update.location", {});
    this.kind = location.installed ? "installer" : "portable";
    this.asset = release.windows?.[this.kind];
    if (!this.asset?.url || !/^[a-f0-9]{64}$/i.test(this.asset.sha256) || !Number.isSafeInteger(this.asset.size) || this.asset.size <= 0)
      throw new Error("更新包信息不完整。");
    this.changed({ status: "available", totalBytes: this.asset.size, downloadedBytes: 0 });
    void this.download().catch(() => {});
    return this.state;
  }
  download() {
    if (this.downloading) return this.downloading;
    this.downloading = this.downloadFile().catch(error => { this.changed({ status: "error", error: error.message }); throw error; }).finally(() => { this.downloading = null; });
    return this.downloading;
  }
  async downloadFile() {
    await fs.mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, `QQClaw-${this.kind}-${this.release.version}.exe`);
    const pendingFile = path.join(this.directory, "pending.json");
    const saved = await fs.readFile(pendingFile, "utf8").then(JSON.parse).catch(() => null);
    if (saved?.sha256 === this.asset.sha256 && saved.file === file && (await fs.stat(file).catch(() => null))?.size === this.asset.size) {
      this.file = file; return this.changed({ status: "ready", downloadedBytes: this.asset.size });
    }
    this.changed({ status: "downloading" });
    const response = await this.fetch(this.asset.url, { signal: AbortSignal.timeout(20 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`更新包下载失败（HTTP ${response.status}）。`);
    const hash = createHash("sha256"); let size = 0, last = 0;
    await pipeline(Readable.fromWeb(response.body), new Transform({ transform: (chunk, encoding, done) => {
      hash.update(chunk); size += chunk.length;
      if (Date.now() - last > 500) { last = Date.now(); this.changed({ downloadedBytes: size }); }
      done(null, chunk);
    } }), createWriteStream(file + ".download"));
    if (size !== this.asset.size || hash.digest("hex") !== this.asset.sha256) throw new Error("更新包下载不完整，请重新检查更新。");
    await fs.rename(file + ".download", file);
    await fs.writeFile(pendingFile, JSON.stringify({ file, sha256: this.asset.sha256, version: this.release.version }));
    this.file = file;
    return this.changed({ status: "ready", downloadedBytes: size });
  }
  async install() {
    if (this.state.status !== "ready" || !this.file) throw new Error("请等待更新包下载完成。");
    return this.native("update.apply", { file: this.file, kind: this.kind });
  }
}
