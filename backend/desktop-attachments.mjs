import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 8;
export const MAX_ATTACHMENTS_BYTES = 40 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;
const validId = (id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);
function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ["image/png", ".png"];
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return ["image/jpeg", ".jpg"];
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii"))) return ["image/gif", ".gif"];
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return ["image/webp", ".webp"];
  return null;
}
export async function attachmentPreview(file) {
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_PREVIEW_BYTES) return null;
    const bytes = await handle.readFile();
    const image = imageType(bytes);
    return image ? `data:${image[0]};base64,${bytes.toString("base64")}` : null;
  } finally { await handle.close(); }
}

// Only imported IDs cross chat.send. Paths from messages are never accepted as
// upload IDs, and the saved copy survives changes to the user's original file.
export class DesktopAttachments {
  constructor(directory) { this.directory = directory ? path.resolve(directory, "attachments", "desktop") : null; }
  async import({ path: source, data, name }) {
    if (!this.directory) throw new Error("应用数据目录尚未就绪。");
    let bytes;
    if (source) {
      const handle = await fs.open(String(source), "r");
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) throw new Error("请选择文件，不能添加目录。");
        if (stat.size > MAX_ATTACHMENT_BYTES) throw new Error("单个附件不能超过 20 MiB。");
        bytes = await handle.readFile();
      } finally { await handle.close(); }
      name = path.basename(source);
    } else {
      if (typeof data !== "string" || data.length % 4 || data.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
        throw new Error("附件内容无效或超过 20 MiB。");
      bytes = Buffer.from(data, "base64");
    }
    if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) throw new Error("附件为空或超过 20 MiB。");
    const label = String(name || "附件").split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, "").slice(0, 180) || "附件";
    const image = imageType(bytes), id = randomUUID();
    const directory = path.join(this.directory, id);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    // Preserve the extension for code tools while preventing executable markup
    // from being rendered as an image. File contents are always untrusted data.
    const extension = image?.[1] || (/^\.[a-zA-Z0-9]{1,12}$/.test(path.extname(label)) ? path.extname(label) : ".bin");
    const saved = path.join(directory, "content" + extension);
    await fs.writeFile(saved, bytes, { flag: "wx", mode: 0o600 });
    const attachment = { id, kind: image ? "image" : "file", label, path: saved, size: bytes.length };
    await fs.writeFile(path.join(directory, "metadata.json"), JSON.stringify(attachment), { flag: "wx", mode: 0o600 });
    return attachment;
  }
  async resolve(id) {
    if (!this.directory || !validId(id)) throw new Error("附件标识无效，请重新添加。");
    const directory = path.join(this.directory, id);
    const realDirectory = await fs.realpath(directory);
    if (path.dirname(realDirectory) !== await fs.realpath(this.directory)) throw new Error("附件目录无效。");
    const attachment = JSON.parse(await fs.readFile(path.join(realDirectory, "metadata.json"), "utf8"));
    if (attachment.id !== id || path.dirname(attachment.path) !== directory) throw new Error("附件记录无效。");
    const realFile = await fs.realpath(attachment.path), stat = await fs.stat(realFile);
    if (path.dirname(realFile) !== realDirectory || !stat.isFile() || stat.size > MAX_ATTACHMENT_BYTES || stat.size !== attachment.size)
      throw new Error("附件已被修改或移动，请重新添加。");
    return { ...attachment, path: realFile };
  }
  async resolveMany(ids = []) {
    if (!Array.isArray(ids) || ids.length > MAX_ATTACHMENT_COUNT) throw new Error("每条消息最多添加 8 个附件。");
    if (new Set(ids).size !== ids.length) throw new Error("请移除重复附件。");
    const attachments = await Promise.all(ids.map(id => this.resolve(id)));
    if (attachments.reduce((n, a) => n + a.size, 0) > MAX_ATTACHMENTS_BYTES) throw new Error("每条消息的附件总大小不能超过 40 MiB。");
    return attachments;
  }
}
