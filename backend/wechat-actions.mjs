// Adapted from XavierJiezou/codex-weixin, MIT, Copyright (c) 2026 Xuechao Zou.
// See docs/CODEX-WEIXIN-LICENSE.txt for the upstream license.
import path from "node:path";
import { workspaceKey } from "../shared/workspace.mjs";
import { fileURLToPath } from "node:url";
import { inferMediaKind } from "./wechat-media.mjs";
const ACTION_BLOCK_RE = /```codex-weixin(?:-server)?-actions\s*([\s\S]*?)```/gi;
const MARKDOWN_LINK_RE = /(!)?\[[^\]]*]\((<[^>]+>|(?:[^()]|\([^()]*\))+)\)/g;
function isAbsoluteLocalPath(value) {
  return path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value);
}
function assertAbsolutePath(value, label) {
  if (!isAbsoluteLocalPath(value)) {
    throw new Error(`${label} must be an absolute path: ${value}`);
  }
}
function normalizeSendAction(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("send action must be an object");
  }
  const candidate = raw;
  if (candidate.type !== "image" && candidate.type !== "file" && candidate.type !== "video") {
    throw new Error("send action type must be image, file, or video");
  }
  if (typeof candidate.path !== "string" || !candidate.path.trim()) {
    throw new Error("send action path is required");
  }
  const resolved = normalizeLocalMarkdownTarget(candidate.path);
  if (!resolved) throw new Error("附件路径必须是绝对路径（absolute path）。");
  assertAbsolutePath(resolved, "send action path");
  return { type: candidate.type, path: resolved };
}
function normalizeLocalMarkdownTarget(raw) {
  let target = raw.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1).trim();
  }
  // Some model/providers incorrectly prepend http:// to a Windows drive.
  // Recover the local file instead of passing a fictitious web link to WeChat.
  target = target.replace(/^https?:\/+(?=[a-z]:[\\/])/i, "");
  if (/^file:/i.test(target)) {
    try {
      target = fileURLToPath(target);
    } catch {
      return void 0;
    }
  } else {
    if (/^[a-z][a-z\d+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) return;
    try {
      target = decodeURI(target);
    } catch {
    }
  }
  return isAbsoluteLocalPath(target) ? target : void 0;
}
function appendSendAction(actions, seen, action) {
  const key = workspaceKey(action.path);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  actions.send.push(action);
}
function extractLocalMarkdownLinks(text, actions) {
  const seen = new Set(actions.send.map((action) => workspaceKey(action.path)));
  const keptLines = [];
  for (const line of text.split(/\r?\n/)) {
    let cleaned = line;
    let containsLocalTarget = false;
    for (const match of line.matchAll(MARKDOWN_LINK_RE)) {
      const target = normalizeLocalMarkdownTarget(match[2]);
      if (!target) {
        continue;
      }
      containsLocalTarget = true;
      cleaned = cleaned.replace(match[0], "");
      appendSendAction(actions, seen, {
        type: match[1] === "!" ? "image" : inferMediaKind(target),
        path: target
      });
    }
    // Also repair the user's regression when a bad URL appears as plain text.
    cleaned = cleaned.replace(/https?:\/+[a-z]:[\\/][^\s<>"`]+/gi, (bad) => {
      const target = normalizeLocalMarkdownTarget(bad.replace(/[。，,;；]+$/u, ""));
      if (target) appendSendAction(actions, seen, { type: inferMediaKind(target), path: target });
      return "";
    });
    if (!containsLocalTarget && cleaned.trim()) keptLines.push(cleaned);
  }
  return keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function normalizeControlAction(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("control action must be an object");
  }
  const candidate = raw;
  if (candidate.type === "workspace.set") {
    if (typeof candidate.path !== "string" || !candidate.path.trim()) {
      throw new Error("workspace.set path is required");
    }
    const resolved = candidate.path.trim();
    assertAbsolutePath(resolved, "workspace.set path");
    return { type: "workspace.set", path: resolved };
  }
  if (candidate.type === "workspace.reset") {
    return { type: "workspace.reset" };
  }
  if (candidate.type === "thread.reset") {
    return { type: "thread.reset" };
  }
  throw new Error(`unsupported control action type: ${String(candidate.type)}`);
}
function parseActionBlocks(text) {
  const actions = { send: [], control: [] };
  const visibleTextWithoutBlocks = text.replace(ACTION_BLOCK_RE, (_match, body) => {
    const parsed = JSON.parse(String(body).trim());
    if (Array.isArray(parsed.send)) {
      const seen = new Set(actions.send.map((action) => workspaceKey(action.path)));
      for (const action of parsed.send.map(normalizeSendAction)) {
        appendSendAction(actions, seen, action);
      }
    }
    if (Array.isArray(parsed.control)) {
      actions.control.push(...parsed.control.map(normalizeControlAction));
    }
    return "";
  }).trim();
  return { visibleText: extractLocalMarkdownLinks(visibleTextWithoutBlocks, actions), actions };
}
function parseActionBlocksSafe(text) {
  const actions = { send: [], control: [] };
  const seen = new Set();
  let discarded = 0;
  const visible = String(text || "").replace(ACTION_BLOCK_RE, (_match, body) => {
    let parsed;
    try {
      parsed = JSON.parse(body.trim());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    } catch {
      discarded++;
      return "";
    }
    for (const [key, normalize] of [["send", normalizeSendAction], ["control", normalizeControlAction]]) {
      if (parsed[key] === undefined) continue;
      if (!Array.isArray(parsed[key])) { discarded++; continue; }
      for (const raw of parsed[key]) {
        try {
          const action = normalize(raw);
          if (key === "send") appendSendAction(actions, seen, action);
          else actions.control.push(action);
        } catch { discarded++; }
      }
    }
    return "";
  }).trim();
  return { visibleText: extractLocalMarkdownLinks(visible, actions), actions, discarded };
}
export {
  parseActionBlocks,
  parseActionBlocksSafe
};
