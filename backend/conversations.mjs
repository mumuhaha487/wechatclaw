import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomBytes } from "node:crypto";

export const codexHome = (env = process.env) => path.resolve(env.CODEX_HOME || path.join(os.homedir(), ".codex"));

// These are portable transcripts, not fabricated Codex rollout files. Codex
// owns its native history; threadId links a transcript to that real history.
export class ConversationArchive {
  constructor(directory = process.env.QQCLAW_CONVERSATIONS_DIR || path.join(codexHome(), "qqclaw", "conversations")) {
    this.directory = path.resolve(directory);
    this.written = new Map();
    this.lastError = "";
  }
  prepare(sessions) {
    return sessions.filter((s) => s.messages?.length).map((s) => {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(s.id)) throw new Error("对话备份的会话标识无效。");
      const transcript = {
        format: "qqclaw.conversation", version: 1, id: s.id,
        title: s.title, workspace: s.workspace, source: s.source,
        createdAt: s.createdAt, updatedAt: s.updatedAt,
        threadId: s.threadId || null, codexThreadPath: s.codexThreadPath || null,
        codexHome: codexHome(), providerId: s.providerId,
        model: s.model, effort: s.effort,
        messages: s.messages.map((m) => ({
          role: m.role, text: String(m.text || ""), kind: m.kind, at: m.at,
          attachments: (m.attachments || []).map((a) => ({ type: a.type, path: a.path, label: a.label })),
          ...(m.runStats ? { runStats: m.runStats } : {}),
        })),
      };
      const json = JSON.stringify(transcript, null, 2) + "\n";
      return { id: s.id, json, transcript, hash: createHash("sha256").update(json).digest("hex") };
    });
  }
  async sync(prepared) {
    if (!prepared.length) return;
    try {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      for (const entry of prepared) {
        if (this.written.get(entry.id) === entry.hash) continue;
        await this.write(`${entry.id}.json`, entry.json);
        const s = entry.transcript;
        const markdown = `# ${String(s.title || "未命名会话").replace(/[\r\n]/g, " ")}\n\n工作目录：${s.workspace || ""}\n\nCodex 会话：${s.threadId || "尚未创建"}\n\n${s.threadId ? `继续命令：\`codex resume ${s.threadId}\`\n\n` : ""}` +
          s.messages.map((m) => `## ${{ user: "用户", assistant: "Codex", system: "系统" }[m.role] || m.role}${m.kind === "progress" ? " · 过程" : ""}${m.at ? ` · ${m.at}` : ""}\n\n${m.text || ""}${m.attachments.length ? "\n\n" + m.attachments.map((a) => `附件：${a.label || ""} · ${a.path}`).join("\n") : ""}\n`).join("\n");
        await this.write(`${entry.id}.md`, markdown);
        this.written.set(entry.id, entry.hash);
      }
      this.lastError = "";
    } catch {
      this.lastError = "对话备份未能保存，请检查 Codex 对话备份目录的权限和可用空间。应用数据未被清除。";
      throw new Error(this.lastError);
    }
  }
  async write(name, data) {
    const temporary = path.join(this.directory, `.${name}.${randomBytes(6).toString("hex")}.tmp`);
    let handle;
    try {
      handle = await fs.open(temporary, "wx", 0o600);
      await handle.writeFile(data, "utf8");
      await handle.sync();
      await handle.close(); handle = null;
      await fs.rename(temporary, path.join(this.directory, name));
    } finally {
      await handle?.close();
      await fs.rm(temporary, { force: true });
    }
  }
  async read() {
    let entries;
    try { entries = await fs.readdir(this.directory, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
    const sessions = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/^[a-zA-Z0-9_-]{1,100}\.json$/.test(entry.name)) continue;
      const file = path.join(this.directory, entry.name);
      // A corrupt backup must be reported instead of silently disappearing.
      let saved;
      try { saved = JSON.parse(await fs.readFile(file, "utf8")); }
      catch { throw new Error(`对话备份无法读取：${entry.name}。原文件已保留。`); }
      if (saved.format !== "qqclaw.conversation" || saved.version !== 1 || saved.id + ".json" !== entry.name || !Array.isArray(saved.messages) || typeof saved.workspace !== "string" || (saved.threadId && !/^[0-9a-f-]{36}$/i.test(saved.threadId)))
        throw new Error(`对话备份格式无效：${entry.name}。原文件已保留。`);
      if (saved.messages.some((m) => !m || !["user", "assistant", "system"].includes(m.role) || typeof m.text !== "string" || (m.attachments && (!Array.isArray(m.attachments) || m.attachments.some((a) => !a || typeof a.path !== "string")))))
        throw new Error(`对话备份消息格式无效：${entry.name}。原文件已保留。`);
      sessions.push(saved);
    }
    return sessions;
  }
  info() {
    return { codexHome: codexHome(), backupDir: this.directory, backupError: this.lastError };
  }
}
