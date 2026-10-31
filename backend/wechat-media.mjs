// Adapted from XavierJiezou/codex-weixin, MIT, Copyright (c) 2026 Xuechao Zou.
// See docs/CODEX-WEIXIN-LICENSE.txt for the upstream license.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const DEFAULT_WEIXIN_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const UPLOAD_MEDIA_TYPE = {
  image: 1,
  video: 2,
  file: 3
};
function parseAesKey(raw) {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{32}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length === 16) {
    return decoded;
  }
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString("ascii"))) {
    return Buffer.from(decoded.toString("ascii"), "hex");
  }
  throw new Error(`WeChat media AES key must decode to 16 bytes, got ${decoded.length}`);
}
function encryptAesEcb(plaintext, key) {
  if (key.length !== 16) {
    throw new Error("AES-128-ECB key must be 16 bytes");
  }
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}
function decryptAesEcb(ciphertext, key) {
  if (key.length !== 16) {
    throw new Error("AES-128-ECB key must be 16 bytes");
  }
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
function aesEcbPaddedSize(plainSize) {
  return Math.ceil((plainSize + 1) / 16) * 16;
}
function sanitizeFileName(name) {
  const cleaned = name.normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
  const safe = cleaned.replace(/[. ]+$/g, "").slice(0, 180);
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe) ? `_${safe}` : safe || "attachment";
}
function inferMediaKind(fileName) {
  if (/\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(fileName)) {
    return "image";
  }
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(fileName)) {
    return "video";
  }
  return "file";
}
class InboundMediaTooLargeError extends Error {
  maxBytes;
  actualBytes;
  constructor(maxBytes, actualBytes) {
    super(`Inbound media exceeds max size ${maxBytes} bytes`);
    this.name = "InboundMediaTooLargeError";
    this.maxBytes = maxBytes;
    this.actualBytes = actualBytes;
  }
}
async function downloadInboundAttachments(input) {
  const downloaded = [];
  for (const [index, attachment] of input.attachments.entries()) {
    downloaded.push(await downloadInboundAttachment({
      rootDir: input.rootDir,
      senderId: input.senderId,
      messageId: `${input.messageId}-${index + 1}`,
      attachment,
      maxBytes: input.maxBytes,
      fetch: input.fetch
    }));
  }
  return downloaded;
}
async function downloadInboundAttachment(input) {
  const ref = inboundMediaRef(input.attachment);
  const key = inboundAesKey(ref);
  const encrypted = await downloadMediaBuffer({
    url: ref.fullUrl ?? downloadUrlFromParam(ref.encryptQueryParam),
    maxBytes: key ? aesEcbPaddedSize(input.maxBytes) : input.maxBytes,
    plainMaxBytes: input.maxBytes,
    fetch: input.fetch
  });
  const plaintext = key ? decryptAesEcb(encrypted, key) : encrypted;
  if (plaintext.length > input.maxBytes) {
    throw new InboundMediaTooLargeError(input.maxBytes, plaintext.length);
  }
  const label = labelWithExtension(input.attachment.label, input.attachment.kind, plaintext);
  const targetPath = uniqueInboundPath({
    rootDir: input.rootDir,
    senderId: input.senderId,
    messageId: input.messageId,
    label
  });
  fs.writeFileSync(targetPath, plaintext);
  return { kind: input.attachment.kind, path: targetPath, label };
}
function inboundMediaRef(attachment) {
  const containerName = inboundContainerName(attachment.kind);
  const container = attachment.item[containerName];
  const media = container?.media;
  return {
    encryptQueryParam: typeof media?.encrypt_query_param === "string" ? media.encrypt_query_param : void 0,
    aesKey: typeof media?.aes_key === "string" ? media.aes_key : void 0,
    fullUrl: typeof media?.full_url === "string" ? media.full_url : void 0,
    aeskey: typeof container?.aeskey === "string" ? container.aeskey : void 0
  };
}
function inboundContainerName(kind) {
  return kind === "audio" ? "voice_item" : `${kind}_item`;
}
function inboundAesKey(ref) {
  if (ref.aeskey) {
    return Buffer.from(ref.aeskey, "hex");
  }
  return ref.aesKey ? parseAesKey(ref.aesKey) : void 0;
}
async function downloadMediaBuffer(input) {
  const response = await (input.fetch ?? globalThis.fetch.bind(globalThis))(input.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) {
    throw new Error(`CDN download failed: ${response.status} ${response.statusText}`);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > input.maxBytes) {
    throw new InboundMediaTooLargeError(input.plainMaxBytes, Number(contentLength));
  }
  const chunks = [];
  let size = 0;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > input.maxBytes) {
          await reader.cancel();
          throw new InboundMediaTooLargeError(input.plainMaxBytes, size);
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
  } else chunks.push(Buffer.from(await response.arrayBuffer()));
  const buffer = Buffer.concat(chunks);
  if (buffer.length > input.maxBytes) {
    throw new InboundMediaTooLargeError(input.plainMaxBytes, buffer.length);
  }
  return buffer;
}
function downloadUrlFromParam(encryptQueryParam) {
  if (!encryptQueryParam?.trim()) {
    throw new Error("Inbound media is missing download URL");
  }
  return `${DEFAULT_WEIXIN_CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(encryptQueryParam)}`;
}
function labelWithExtension(label, kind, buffer) {
  const ext = path.extname(label);
  if (ext) {
    return sanitizeFileName(label);
  }
  if (kind === "image") {
    return sanitizeFileName(`${label}${inferImageExtension(buffer)}`);
  }
  if (kind === "video") {
    return sanitizeFileName(`${label}.mp4`);
  }
  if (kind === "audio") {
    return sanitizeFileName(`${label}.silk`);
  }
  return sanitizeFileName(label);
}
function inferImageExtension(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return ".png";
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) {
    return ".jpg";
  }
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return ".gif";
  }
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  return ".bin";
}
function uniqueInboundPath(input) {
  const dir = path.join(input.rootDir, sanitizePathSegment(input.senderId));
  fs.mkdirSync(dir, { recursive: true });
  const parsed = path.parse(input.label);
  const stem = sanitizeFileName(`${sanitizePathSegment(input.messageId)}-${parsed.name}`);
  const ext = parsed.ext || "";
  let candidate = path.join(dir, `${stem}${ext}`);
  for (let index = 1; fs.existsSync(candidate); index += 1) {
    candidate = path.join(dir, `${stem}-${index}${ext}`);
  }
  return candidate;
}
function sanitizePathSegment(value) {
  return sanitizeFileName(value.replace(/[^a-zA-Z0-9._-]+/g, "_")).replace(/^\.+/, "_") || "unknown";
}
async function prepareLocalMedia(input) {
  const stat = await fs.promises.stat(input.filePath);
  if (!stat.isFile()) throw new Error("发送的附件不是文件。");
  if (stat.size > 100 * 1024 * 1024) throw new Error("附件超过 100 MiB 上限，请压缩后发送。");
  const plaintext = fs.readFileSync(input.filePath);
  const rawSize = plaintext.length;
  const rawFileMd5 = crypto.createHash("md5").update(plaintext).digest("hex");
  const cipherSize = aesEcbPaddedSize(rawSize);
  const aesKey = crypto.randomBytes(16);
  const aesKeyHex = aesKey.toString("hex");
  const fileKey = crypto.randomBytes(16).toString("hex");
  const kind = input.kind ?? inferMediaKind(input.filePath);
  const uploadUrl = await input.client.getUploadUrl({
    fileKey,
    mediaType: UPLOAD_MEDIA_TYPE[kind],
    toUserId: input.toUserId,
    rawSize,
    rawFileMd5,
    cipherSize,
    noNeedThumb: true,
    aesKeyHex
  });
  const encryptQueryParam = await uploadBufferToCdn({
    plaintext,
    aesKey,
    fileKey,
    uploadFullUrl: uploadUrl.uploadFullUrl,
    uploadParam: uploadUrl.uploadParam,
    fetch: input.fetch
  });
  const aesKeyBase64 = Buffer.from(aesKeyHex, "utf8").toString("base64");
  return { kind, encryptQueryParam, aesKeyBase64, cipherSize, plainSize: rawSize, fileName: sanitizeFileName(path.basename(input.filePath)) };
}
async function sendLocalMediaFile(input) {
  const receipt = await prepareLocalMedia(input);
  const { kind, encryptQueryParam, aesKeyBase64, cipherSize, plainSize: rawSize } = receipt;
  if (kind === "image") {
    const result2 = await input.client.sendImageMessage({
      toUserId: input.toUserId,
      contextToken: input.contextToken,
      encryptQueryParam,
      aesKeyBase64,
      cipherSize
    });
    return { messageId: result2.messageId, kind };
  }
  if (kind === "video") {
    const result2 = await input.client.sendVideoMessage({
      toUserId: input.toUserId,
      contextToken: input.contextToken,
      encryptQueryParam,
      aesKeyBase64,
      cipherSize
    });
    return { messageId: result2.messageId, kind };
  }
  const result = await input.client.sendFileMessage({
    toUserId: input.toUserId,
    contextToken: input.contextToken,
    fileName: sanitizeFileName(path.basename(input.filePath)),
    encryptQueryParam,
    aesKeyBase64,
    plainSize: rawSize
  });
  return { messageId: result.messageId, kind };
}
async function uploadBufferToCdn(input) {
  const ciphertext = encryptAesEcb(input.plaintext, input.aesKey);
  const response = await (input.fetch ?? globalThis.fetch.bind(globalThis))(resolveUploadUrl(input), {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(ciphertext),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) {
    throw new Error(`CDN upload failed: ${response.status} ${response.statusText}`);
  }
  const encryptedParam = response.headers.get("x-encrypted-query-param") ?? response.headers.get("x-encrypted-param");
  if (!encryptedParam) {
    throw new Error("CDN upload response missing encrypted query param header");
  }
  return encryptedParam;
}
function resolveUploadUrl(input) {
  const fullUrl = input.uploadFullUrl?.trim();
  if (fullUrl) {
    return fullUrl;
  }
  const uploadParam = input.uploadParam?.trim();
  if (!uploadParam) {
    throw new Error("Outbound media upload URL is missing");
  }
  return `${DEFAULT_WEIXIN_CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(input.fileKey)}`;
}
export {
  InboundMediaTooLargeError,
  aesEcbPaddedSize,
  decryptAesEcb,
  downloadInboundAttachments,
  encryptAesEcb,
  inferMediaKind,
  parseAesKey,
  prepareLocalMedia,
  sanitizeFileName,
  sendLocalMediaFile
};
