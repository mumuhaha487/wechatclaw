import { workspaceKey } from "../shared/workspace.mjs";

export function validDraftKey(key, state) {
  return typeof key === "string" && (state.sessions.some(s => s.id === key) ||
    key.startsWith("new:") && [...state.projects, ...state.sessions].some(p => `new:${workspaceKey(p.workspace)}` === key));
}

export function draftValue(value) {
  if (!value || typeof value.text !== "string" || value.text.length > 120000 || !Array.isArray(value.attachments) ||
    value.attachments.length > 8 || value.attachments.some(id => typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)))
    throw new Error("草稿内容无效，或超过文字/附件数量限制。");
  return { text: value.text, attachments: [...new Set(value.attachments)], goalMode: value.goalMode === true };
}

export async function readDrafts(state, files) {
  const drafts = {}, warnings = [];
  for (const [key, raw] of Object.entries(state.composerDrafts || {})) {
    if (!validDraftKey(key, state)) continue;
    try {
      const saved = draftValue(raw), attachments = [];
      for (const id of saved.attachments) {
        try { attachments.push(await files.resolve(id)); }
        catch { attachments.push({ id, kind: "file", label: "附件不可用，请移除后重新添加", size: 0 }); warnings.push("部分草稿附件已被移动或删除，原文字和附件记录已保留，请重新添加该附件。"); }
      }
      drafts[key] = { ...saved, attachments, pending: 0 };
    } catch { warnings.push("有一条草稿记录无法读取，原数据已保留。"); }
  }
  return { drafts, warnings: [...new Set(warnings)] };
}
