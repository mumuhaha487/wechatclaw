import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { lineChanges } from "../shared/change-stats.mjs";
import { sameWorkspace } from "../shared/workspace.mjs";

const EXCLUDED = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".next", ".nuxt", ".cache"]);
const MAX_BYTES = 64 * 1024 * 1024, MAX_FILES = 5000, MAX_ENTRIES = 20000;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const inside = (root, target) => { const relative = path.relative(root, target); return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)); };
const sameFile = (a, b) => (!a && !b) || Boolean(a && b && a.hash === b.hash && a.mode === b.mode && a.link === b.link);
const identity = stat => `${stat.dev}:${stat.ino}`;
const entry = (files, relative) => Object.hasOwn(files, relative) ? files[relative] : undefined;
async function readStable(file, limit = MAX_BYTES) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error("文件类型或大小超出快照范围。");
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (identity(await handle.stat()) !== identity(stat)) throw new Error("读取时文件被替换。");
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await fs.lstat(file), opened = await handle.stat();
    if (length !== stat.size || !after.isFile() || identity(stat) !== identity(after) || stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs || stat.mtimeMs !== opened.mtimeMs || stat.ctimeMs !== opened.ctimeMs) throw new Error("读取时文件发生变化，已停止操作。");
    return { bytes: buffer.subarray(0, length), stat };
  } finally { await handle.close(); }
}
const text = bytes => {
  if (!bytes || bytes.length > 256 * 1024 || bytes.includes(0)) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; }
};
function seal(key, bytes) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}
function unseal(key, bytes) {
  const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
}

export class Checkpoints {
  constructor(directory, native, { maxStorageBytes = 512 * 1024 * 1024 } = {}) {
    this.data = directory ? path.resolve(directory) : "";
    this.directory = directory ? path.join(this.data, "checkpoints") : "";
    this.native = native;
    this.maxStorageBytes = maxStorageBytes;
    this.usedBytes = 0;
    this.measuring = null;
  }
  async measure() {
    if (!this.measuring) this.measuring = (async () => {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      for (const item of await fs.readdir(this.directory, { withFileTypes: true })) {
        if (!item.isDirectory() || !/^[a-f0-9-]{36}$/.test(item.name)) continue;
        for (const file of await fs.readdir(path.join(this.directory, item.name), { withFileTypes: true })) {
          if (file.isFile()) this.usedBytes += (await fs.lstat(path.join(this.directory, item.name, file.name))).size;
        }
      }
    })();
    return this.measuring;
  }
  folder(id) {
    if (!this.directory || !/^[a-f0-9-]{36}$/.test(id || "")) throw new Error("文件快照标识无效。");
    return path.join(this.directory, id);
  }
  async save(record) {
    const bytes = seal(record.key, Buffer.from(JSON.stringify(record.manifest)));
    const file = path.join(record.folder, "manifest.json"), temporary = file + "." + randomUUID() + ".tmp";
    try {
      const data = JSON.stringify({ key: record.wrappedKey, data: bytes.toString("base64") });
      const previous = await fs.lstat(file).catch(error => { if (error.code !== "ENOENT") throw error; return { size: 0 }; });
      await fs.writeFile(temporary, data, { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, file);
      this.usedBytes += Buffer.byteLength(data) - previous.size;
    } finally { await fs.rm(temporary, { force: true }); }
  }
  async load(id, workspace) {
    await this.measure();
    const folder = this.folder(id), real = await fs.realpath(folder);
    if ((await fs.lstat(folder)).isSymbolicLink() || path.dirname(real) !== await fs.realpath(this.directory)) throw new Error("文件快照目录无效。");
    const wrapper = JSON.parse((await readStable(path.join(real, "manifest.json"), 16 * 1024 * 1024)).bytes.toString("utf8"));
    const key = Buffer.from(await this.native("vault.decrypt", { value: wrapper.key }), "base64");
    if (key.length !== 32) throw new Error("文件快照密钥无效。");
    const manifest = JSON.parse(unseal(key, Buffer.from(wrapper.data, "base64")).toString("utf8"));
    const root = await fs.realpath(workspace);
    if (manifest.id !== id || !sameWorkspace(manifest.workspace, root)) throw new Error("文件快照不属于当前工作目录。");
    await this.assertRoot(manifest);
    return { key, wrappedKey: wrapper.key, manifest, folder: real };
  }
  async assertRoot(manifest) {
    const stat = await fs.lstat(manifest.workspace);
    if (!stat.isDirectory() || stat.isSymbolicLink() || identity(stat) !== manifest.rootIdentity) throw new Error("工作目录已被替换或移动，已停止操作。");
  }
  async blob(record, bytes) {
    const digest = hash(bytes), file = path.join(record.folder, digest);
    await this.measure();
    const exists = await fs.lstat(file).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
    if (exists) { if (!exists.isFile() || exists.isSymbolicLink()) throw new Error("文件快照内容目录无效。"); return digest; }
    if (this.usedBytes + bytes.length + 28 > this.maxStorageBytes) throw new Error("文件快照总空间已达 512 MiB，本轮撤销不可用；已有快照已保留。");
    this.usedBytes += bytes.length + 28;
    try { await fs.writeFile(file, seal(record.key, bytes), { flag: "wx", mode: 0o600 }); }
    catch (error) { this.usedBytes -= bytes.length + 28; if (error.code !== "EEXIST") throw error; }
    return digest;
  }
  async bytes(record, entry) {
    if (!entry) return null;
    if (!/^[a-f0-9]{64}$/.test(entry.hash)) throw new Error("文件快照内容标识无效。");
    const bytes = unseal(record.key, (await readStable(path.join(record.folder, entry.hash), MAX_BYTES + 28)).bytes);
    if (hash(bytes) !== entry.hash) throw new Error("文件快照内容校验失败。");
    return bytes;
  }
  async scan(record) {
    await this.assertRoot(record.manifest);
    const root = record.manifest.workspace, files = Object.create(null), directories = [], queue = [root];
    let total = 0, count = 0, fileCount = 0;
    for (let index = 0; index < queue.length; index++) {
      const directory = queue[index];
      if (directory !== root) await this.target(root, path.relative(root, directory));
      if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error("建立快照时目录变为链接。");
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (++count > MAX_ENTRIES) throw new Error("目录项超过 20000，未建立完整文件快照。");
        const file = path.join(directory, entry.name), relative = path.relative(root, file);
        if (EXCLUDED.has(process.platform === "win32" ? entry.name.toLowerCase() : entry.name) || (this.data && inside(this.data, file))) continue;
        const stat = await fs.lstat(file);
        if (!stat.isDirectory() && ++fileCount > MAX_FILES) throw new Error("文件快照超过 5000 个文件，本次撤销不可用。");
        if (stat.isSymbolicLink()) { files[relative] = { link: await fs.readlink(file) }; continue; }
        if (stat.isDirectory()) { directories.push(relative); queue.push(file); continue; }
        if (!stat.isFile()) throw new Error("工作区包含不支持的特殊文件，未建立完整快照。");
        if (total + stat.size > MAX_BYTES) throw new Error("文件快照超过 64 MiB，本次撤销不可用。");
        const { bytes, stat: after } = await readStable(file, MAX_BYTES - total);
        if (stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs || identity(stat) !== identity(after)) throw new Error("建立快照时文件发生变化，本次撤销不可用。");
        total += bytes.length;
        files[relative] = { hash: await this.blob(record, bytes), mode: stat.mode & 0o777 };
      }
    }
    await this.assertRoot(record.manifest);
    return { files, directories };
  }
  async begin(workspace) {
    if (!this.directory) return { status: "unavailable", reason: "应用数据目录尚未就绪。" };
    await this.measure();
    if (this.usedBytes >= this.maxStorageBytes) return { status: "unavailable", reason: "文件快照总空间已达 512 MiB，本轮撤销不可用；已有快照已保留。" };
    const root = await fs.realpath(workspace);
    if (inside(this.data, root)) return { status: "unavailable", reason: "工作目录位于应用数据目录内，无法建立独立文件快照。" };
    const id = randomUUID(), folder = this.folder(id), key = randomBytes(32);
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const record = { folder, key, wrappedKey: await this.native("vault.encrypt", { value: key.toString("base64") }), manifest: { id, workspace: root, rootIdentity: identity(await fs.lstat(root)), createdAt: new Date().toISOString(), status: "capturing" } };
    try {
      record.manifest.before = await this.scan(record);
      await this.save(record);
      return { id, status: "capturing" };
    } catch (error) {
      record.manifest.status = "unavailable";
      record.manifest.reason = error.message;
      await this.save(record);
      return { id, status: "unavailable", reason: error.message };
    }
  }
  async finish(checkpoint, workspace) {
    if (!checkpoint?.id || checkpoint.status !== "capturing") return { checkpoint, changes: null };
    const record = await this.load(checkpoint.id, workspace), m = record.manifest;
    try {
      m.after = await this.scan(record);
      m.changes = [];
      for (const relative of new Set([...Object.keys(m.before.files), ...Object.keys(m.after.files)])) {
        const before = entry(m.before.files, relative), after = entry(m.after.files, relative);
        if (sameFile(before, after)) continue;
        if (before?.link || after?.link || m.before.directories.includes(relative) || m.after.directories.includes(relative)) throw new Error("本轮更改涉及链接或文件与目录类型互换，撤销不可用。");
        const oldText = before ? text(await this.bytes(record, before)) : "", newText = after ? text(await this.bytes(record, after)) : "";
        m.changes.push({ relative, path: path.join(m.workspace, relative), kind: !before ? "add" : !after ? "delete" : "update", stats: oldText !== null && newText !== null ? lineChanges(oldText, newText) : null });
      }
      m.status = m.changes.length ? "ready" : "empty";
      await this.save(record);
      return { checkpoint: { id: m.id, status: m.status, files: m.changes.length }, changes: m.changes };
    } catch (error) {
      m.status = "unavailable"; m.reason = error.message; await this.save(record);
      return { checkpoint: { id: m.id, status: "unavailable", reason: error.message }, changes: null };
    }
  }
  async target(root, relative) {
    if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some(p => p === ".." || EXCLUDED.has(process.platform === "win32" ? p.toLowerCase() : p))) throw new Error("文件快照路径无效。");
    const target = path.resolve(root, relative);
    if (!inside(root, target) || target === root || (this.data && inside(this.data, target))) throw new Error("文件快照超出工作目录。");
    let parent = path.dirname(target);
    while (parent !== root) {
      try {
        const stat = await fs.lstat(parent);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("文件路径包含链接或非目录，已停止操作。");
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      parent = path.dirname(parent);
    }
    return target;
  }
  async current(file) {
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error("文件类型发生变化，已停止操作。");
      const { bytes, stat: after } = await readStable(file);
      if (identity(stat) !== identity(after) || stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs) throw new Error("读取时文件发生变化，已停止操作。");
      return { hash: hash(bytes), mode: stat.mode & 0o777 };
    } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  async write(file, entry, bytes) {
    if (!entry) { await fs.unlink(file); return; }
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = path.join(path.dirname(file), ".qqclaw-restore-" + randomUUID() + ".tmp");
    try {
      await fs.writeFile(temporary, bytes, { flag: "wx", mode: entry.mode });
      if (process.platform !== "win32") await fs.chmod(temporary, entry.mode);
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  async restore(id, workspace, direction) {
    const record = await this.load(id, workspace), m = record.manifest;
    if (!["undo", "redo", "recover"].includes(direction)) throw new Error("不支持的文件恢复操作。");
    const recovering = ["applying", "recovery-needed"].includes(m.status);
    if (direction === "recover" ? !recovering : recovering) throw new Error(recovering ? "上次操作未完成，请先恢复操作前状态。" : "当前没有需要恢复的操作。");
    if (!recovering && m.status !== (direction === "undo" ? "ready" : "undone")) throw new Error("当前更改状态不支持此操作。");
    if (recovering && (!m.transaction || !["before", "after"].includes(m.transaction.from) || !["ready", "undone"].includes(m.transaction.previousStatus))) throw new Error("文件恢复记录无效，请保留快照并检查工作目录。");
    const previousStatus = recovering ? m.transaction.previousStatus : m.status;
    const targetSide = recovering ? m.transaction.from : direction === "undo" ? "before" : "after";
    const fromSide = targetSide === "before" ? "after" : "before";
    const operations = [];
    for (const change of m.changes) {
      const file = await this.target(m.workspace, change.relative), current = await this.current(file);
      const target = entry(m[targetSide].files, change.relative), from = entry(m[fromSide].files, change.relative);
      if (!sameFile(current, from) && !(recovering && sameFile(current, target))) throw new Error(`文件在任务后发生变化，已停止操作：${change.relative}`);
      if (!sameFile(current, target)) operations.push({ file, relative: change.relative, current, target, bytes: await this.bytes(record, target), rollback: await this.bytes(record, current) });
    }
    const journal = recovering ? structuredClone(m.transaction) : { previousStatus, from: fromSide, target: targetSide, startedAt: new Date().toISOString() };
    const restoredAt = m.restoredAt, lastDirection = m.lastDirection;
    m.status = "applying";
    m.transaction = journal;
    await this.save(record);
    const applied = [];
    try {
      for (const operation of operations) {
        await this.assertRoot(m);
        await this.target(m.workspace, operation.relative);
        if (!sameFile(await this.current(operation.file), operation.current)) throw new Error(`操作期间文件发生变化：${operation.relative}`);
        applied.push(operation);
        await this.write(operation.file, operation.target, operation.bytes);
      }
      m.status = recovering ? previousStatus : direction === "undo" ? "undone" : "ready";
      m.restoredAt = new Date().toISOString(); delete m.transaction;
      m.lastDirection = direction;
      await this.save(record);
      return { id, status: m.status, files: m.changes.length, at: m.restoredAt, direction };
    } catch (error) {
      let recovered = true;
      for (const operation of applied.reverse()) {
        try {
          await this.assertRoot(m);
          await this.target(m.workspace, operation.relative);
          const current = await this.current(operation.file);
          if (sameFile(current, operation.current)) continue;
          if (!sameFile(current, operation.target)) throw new Error("文件已被其他程序修改。");
          await this.write(operation.file, operation.current, operation.rollback);
        } catch { recovered = false; }
      }
      m.status = recovered && !recovering ? previousStatus : "recovery-needed";
      if (m.status === previousStatus) delete m.transaction;
      else m.transaction = journal;
      if (restoredAt) m.restoredAt = restoredAt; else delete m.restoredAt;
      if (lastDirection) m.lastDirection = lastDirection; else delete m.lastDirection;
      await this.save(record);
      throw new Error(m.status === previousStatus ? `${error.message} 已保留操作前文件。` : `${error.message} 部分文件需恢复，快照已保留，请使用“恢复操作前状态”。`);
    }
  }
  async status(id, workspace) {
    const { manifest: m } = await this.load(id, workspace);
    return { id, status: m.status, files: m.changes?.length || 0, at: m.restoredAt, direction: m.lastDirection, ...(m.reason ? { reason: m.reason } : {}) };
  }
  async review(id, workspace, relative) {
    const record = await this.load(id, workspace), m = record.manifest;
    if (!m.changes) throw new Error(m.reason || "本次任务尚无完整更改快照。");
    const change = m.changes.find(c => c.relative === relative) || m.changes[0];
    if (relative && change?.relative !== relative) throw new Error("此文件不在本次任务快照中。");
    const before = change ? await this.bytes(record, entry(m.before.files, change.relative)) : null;
    const after = change ? await this.bytes(record, entry(m.after.files, change.relative)) : null;
    return { id, status: m.status, files: m.changes, selected: change?.relative || "", before: before ? text(before) : "", after: after ? text(after) : "", beforeExists: Boolean(change && entry(m.before.files, change.relative)), afterExists: Boolean(change && entry(m.after.files, change.relative)) };
  }
}
