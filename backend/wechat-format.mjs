// Adapted from XavierJiezou/codex-weixin, MIT, Copyright (c) 2026 Xuechao Zou.
// See docs/CODEX-WEIXIN-LICENSE.txt for the upstream license.
const BRIDGE_ACTION_INSTRUCTIONS = [
  "WeChat bridge rule: when you need to send a local image, video, or file to the user, do not use Markdown local file links.",
  "When a WeChat attachment line includes a local path, inspect the saved local attachment with available tools before answering.",
  "Use a fenced codex-weixin-actions JSON block instead, for example:",
  "```codex-weixin-actions",
  '{"send":[{"type":"image","path":"C:/absolute/path/image.png"},{"type":"video","path":"C:/absolute/path/video.mp4"}]}',
  "```"
].join("\n");
const LEGACY_BRIDGE_ACTION_INSTRUCTIONS = BRIDGE_ACTION_INSTRUCTIONS.replaceAll("codex-weixin-actions", "codex-weixin-server-actions");
function buildPrompt(text, attachments = [], attachmentSource = "WeChat") {
  const lines = [BRIDGE_ACTION_INSTRUCTIONS];
  if (text.trim()) {
    lines.push(text.trim());
  }
  for (const attachment of attachments) {
    if (attachment.kind === "text") {
      lines.push(attachment.text);
    } else {
      lines.push(`[${attachmentSource} ${attachment.kind}: ${attachment.label} saved to ${attachment.path}]
Inspect the saved local attachment before answering.`);
    }
  }
  return lines.join("\n\n").trim();
}
function buildPromptPreview(text, attachments = [], limit = 120) {
  const labels = {
    file: "\u6587\u4EF6",
    image: "\u56FE\u7247",
    video: "\u89C6\u9891",
    audio: "\u97F3\u9891"
  };
  const parts = [text, ...attachments.map(
    (attachment) => attachment.kind === "text" ? attachment.text : `${labels[attachment.kind]}\uFF1A${attachment.label}`
  )];
  const preview = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!preview) return void 0;
  return preview.length > limit ? `${preview.slice(0, Math.max(1, limit - 1))}\u2026` : preview;
}
function parsePrompt(text) {
  let normalized = text.trim();
  for (const instructions of [BRIDGE_ACTION_INSTRUCTIONS, LEGACY_BRIDGE_ACTION_INSTRUCTIONS]) {
    if (normalized.startsWith(instructions)) {
      normalized = normalized.slice(instructions.length).trim();
      break;
    }
  }
  const attachments = [];
  const visibleText = normalized.replace(
    /^\[(WeChat|Web) (file|image|video|audio): (.+) saved to (.+)]\nInspect the saved local attachment before answering\.$/gm,
    (_match, source, kind, label, filePath) => {
      attachments.push({ source, kind, label, path: filePath });
      return "";
    }
  ).replace(/\n{3,}/g, "\n\n").trim();
  return { text: visibleText, attachments };
}
function stripBridgeInstructions(text) {
  return parsePrompt(text).text;
}
function chunkText(text, limit = 1800) {
  const normalized = text || "(empty reply)";
  if (normalized.length <= limit) {
    return [normalized];
  }
  const chunks = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    let end = Math.min(cursor + limit, normalized.length);
    const newline = normalized.lastIndexOf("\n", end);
    if (newline > cursor + Math.floor(limit * 0.5)) {
      end = newline;
    }
    chunks.push(normalized.slice(cursor, end).trim());
    cursor = end;
  }
  return chunks.filter(Boolean);
}
export {
  buildPrompt,
  buildPromptPreview,
  chunkText,
  parsePrompt,
  stripBridgeInstructions
};
