// Adapted from XavierJiezou/codex-weixin, MIT, Copyright (c) 2026 Xuechao Zou.
// See docs/CODEX-WEIXIN-LICENSE.txt for the upstream license.
function normalizeWeixinMessage(raw) {
  const senderId = raw.from_user_id ?? raw.sender;
  if (!senderId) {
    return void 0;
  }
  const textParts = [];
  if (typeof raw.text === "string") {
    textParts.push(raw.text);
  }
  for (const item of raw.item_list ?? []) {
    const text = extractTextItem(item);
    if (text) {
      textParts.push(text);
    }
  }
  const attachments = extractAttachments(raw.item_list ?? []);
  return {
    id: String(raw.message_id ?? `${senderId}:${Date.now()}`),
    senderId,
    contextToken: raw.context_token,
    text: textParts.join("\n").trim(),
    attachments,
    raw
  };
}
function extractTextItem(item) {
  const direct = item.text;
  if (typeof direct === "string") {
    return direct;
  }
  const textItem = item.text_item;
  if (textItem && typeof textItem === "object" && typeof textItem.text === "string") {
    return textItem.text;
  }
  const voiceItem = item.voice_item;
  return extractVoiceTranscription(voiceItem);
}
function extractAttachments(items) {
  const attachments = [];
  for (const item of items) {
    const type = typeof item.type === "number" ? item.type : void 0;
    if (type === 2 && hasMedia(item.image_item)) {
      attachments.push({ kind: "image", label: "image", item });
      continue;
    }
    if (type === 3 && hasMedia(item.voice_item)) {
      if (!extractVoiceTranscription(item.voice_item)) {
        attachments.push({ kind: "audio", label: "voice.silk", item });
      }
      continue;
    }
    if (type === 4 && hasMedia(item.file_item)) {
      const fileItem = item.file_item;
      const label = typeof fileItem.file_name === "string" && fileItem.file_name.trim() ? fileItem.file_name.trim() : "file";
      attachments.push({ kind: "file", label, item });
      continue;
    }
    if (type === 5 && hasMedia(item.video_item)) {
      attachments.push({ kind: "video", label: "video.mp4", item });
    }
  }
  return attachments;
}
function extractVoiceTranscription(value) {
  if (!value || typeof value !== "object") {
    return void 0;
  }
  const text = value.text;
  if (typeof text !== "string" || !text.trim()) {
    return void 0;
  }
  return text;
}
function hasMedia(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const media = value.media;
  if (!media || typeof media !== "object") {
    return false;
  }
  const candidate = media;
  return typeof candidate.encrypt_query_param === "string" || typeof candidate.full_url === "string";
}
export {
  extractAttachments,
  extractTextItem,
  normalizeWeixinMessage
};
