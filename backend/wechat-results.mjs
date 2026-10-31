import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { sanitizeFileName } from "./wechat-media.mjs";

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  for (let bit = 0; bit < 8; bit++) i = (i >>> 1) ^ (i & 1 ? 0xedb88320 : 0);
  return i >>> 0;
});
const zipBytes = (entries) => 22 + entries.reduce((size, entry) =>
  size + entry.size + 76 + 2 * Buffer.byteLength(entry.name), 0);
const resultDirectory = (root, accountId, taskKey) => path.join(root, "outbound",
  createHash("sha256").update(accountId).digest("hex"),
  createHash("sha256").update(taskKey).digest("hex"));

// Standard UTF-8 ZIP (stored entries). Stream files so a result bundle does not
// require buffering every attachment, and keep each upload below Tencent's limit.
async function writeZip(target, entries) {
  const temporary = `${target}.tmp`;
  const output = await fs.open(temporary, "w");
  const central = [];
  let offset = 0;
  const write = async (bytes, position) => {
    let written = 0;
    while (written < bytes.length) {
      const result = await output.write(bytes, written, bytes.length - written, position + written);
      if (!result.bytesWritten) throw new Error("无法写入结果包。");
      written += result.bytesWritten;
    }
  };
  try {
    for (const entry of entries) {
      const name = Buffer.from(entry.name);
      const start = offset;
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0x800, 6);
      header.writeUInt16LE(0x21, 12); // 1980-01-01
      header.writeUInt32LE(entry.size, 18);
      header.writeUInt32LE(entry.size, 22);
      header.writeUInt16LE(name.length, 26);
      await write(header, offset);
      await write(name, offset + 30);
      offset += 30 + name.length;
      let crc = 0xffffffff, size = 0;
      const input = await fs.open(entry.path, "r");
      try {
        const buffer = Buffer.alloc(1024 * 1024);
        for (;;) {
          const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
          if (!bytesRead) break;
          size += bytesRead;
          if (size > entry.size) throw new Error("附件在打包时发生变化，请重试。");
          const bytes = buffer.subarray(0, bytesRead);
          for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
          await write(bytes, offset);
          offset += bytesRead;
        }
      } finally { await input.close(); }
      if (size !== entry.size) throw new Error("附件在打包时发生变化，请重试。");
      crc = (crc ^ 0xffffffff) >>> 0;
      header.writeUInt32LE(crc, 14);
      await write(header, start);
      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50);
      header.copy(record, 6, 4, 30);
      record.writeUInt16LE(20, 4);
      record.writeUInt32LE(start, 42);
      central.push(Buffer.concat([record, name]));
    }
    const centralStart = offset;
    for (const record of central) { await write(record, offset); offset += record.length; }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(offset - centralStart, 12);
    end.writeUInt32LE(centralStart, 16);
    await write(end, offset);
  } finally { await output.close(); }
  await fs.rename(temporary, target);
}

export async function planWeChatResult({ root, accountId, taskKey, chunks, media, slots }) {
  if (chunks.length + media.length <= slots) return { chunks, media };
  const directory = resultDirectory(root, accountId, taskKey);
  await fs.mkdir(directory, { recursive: true });
  const fullText = chunks.join("");
  const entries = [], names = new Set(), errors = [];
  const add = (filePath, size, label) => {
    const original = sanitizeFileName(label);
    let name = original, index = 2;
    const parsed = path.parse(original);
    while (names.has(name.toLowerCase())) name = `${parsed.name} (${index++})${parsed.ext}`;
    names.add(name.toLowerCase());
    entries.push({ path: filePath, size, name });
  };
  // The complete final answer is preserved even when its preview is shortened.
  if (fullText) {
    const textPath = path.join(directory, "任务结果.txt");
    await fs.writeFile(textPath, fullText, "utf8");
    add(textPath, Buffer.byteLength(fullText), "任务结果.txt");
  }
  for (const attachment of media) {
    try {
      const stat = await fs.stat(attachment.path);
      if (!stat.isFile()) throw new Error("不是文件");
      if (stat.size > MAX_FILE_BYTES) throw new Error("超过微信单附件 100 MiB 上限");
      add(attachment.path, stat.size, path.basename(attachment.path));
    } catch (error) {
      if (!["ENOENT", "EACCES", "EISDIR"].includes(error.code) && !/不是文件|100 MiB/.test(error.message)) throw error;
      errors.push(`${path.basename(attachment.path)}：${error.message}`);
    }
  }
  if (errors.length) {
    const text = errors.join("\n"), target = path.join(directory, "附件说明.txt");
    await fs.writeFile(target, text);
    add(target, Buffer.byteLength(text), "附件说明.txt");
  }
  const outgoing = [], groups = [];
  let group = [];
  for (const entry of entries) {
    if (zipBytes([entry]) > MAX_FILE_BYTES) {
      // A valid 100 MiB file can be too large once ZIP headers are added.
      outgoing.push({ type: "file", path: entry.path });
      continue;
    }
    if (zipBytes([...group, entry]) > MAX_FILE_BYTES || group.length >= 65534) {
      groups.push(group); group = [];
    }
    group.push(entry);
  }
  if (group.length) groups.push(group);
  for (const [index, group] of groups.entries()) {
    const target = path.join(directory, groups.length === 1 ? "任务结果.zip" : `任务结果-${index + 1}.zip`);
    await writeZip(target, group);
    outgoing.push({ type: "file", path: target });
  }
  const preview = Array.from(fullText).slice(0, 1200).join("");
  const note = `完整总结${media.length ? "及附件" : ""}已合并到结果包。` +
    (errors.length ? `\n有 ${errors.length} 个附件无法发送，详情见包内的附件说明。` : "") +
    (outgoing.length + 1 > slots ? "\n若附件尚未收齐，请再发一条消息以继续接收。" : "");
  return { chunks: [`${preview}${Array.from(fullText).length > 1200 ? "…" : ""}${preview ? "\n\n" : ""}${note}`],
    media: outgoing, bundled: true };
}

export async function cleanWeChatResult(root, accountId, taskKey) {
  await fs.rm(resultDirectory(root, accountId, taskKey), { recursive: true, force: true });
}
