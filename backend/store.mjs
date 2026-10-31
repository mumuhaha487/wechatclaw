import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { parseActionBlocksSafe } from "./wechat-actions.mjs";
import { ConversationArchive } from "./conversations.mjs";
import { workspaceKey } from "../shared/workspace.mjs";
import { reviewView } from "../shared/review-view.mjs";
import { viewPreferences } from "../shared/view-preferences.mjs";

export const defaults = () => ({
  version: 2,
  settings: {
    theme: "dark",
    appearanceVersion: 3,
    fontSize: 14,
    fontFamily: "system",
    showCounts: true,
    showActivity: false,
    showTime: false,
    showStatus: true,
    codexPath: "",
    codexSource: "auto",
    defaultProvider: "local",
    defaultModel: "",
    defaultEffort: "",
    defaultPermission: "auto",
  },
  providers: [{ id: "local", name: "本机 Codex", type: "local", models: [] }],
  projects: [],
  sessions: [],
  accounts: [],
  retainedAccounts: [],
  reviewView: null,
  viewPreferences: null,
});

export class Store {
  constructor(directory, native, { archive = new ConversationArchive() } = {}) {
    this.directory = directory;
    this.native = native;
    this.archive = archive;
    this.saving = false;
    this.saveWaiters = [];
  }
  async init() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const saved = JSON.parse(
        await fs.readFile(path.join(this.directory, "state.json"), "utf8"),
      );
      const data = JSON.parse(
        await this.native("vault.decrypt", { value: saved.protected }),
      );
      this.state = {
        ...defaults(),
        ...data,
        settings: { ...defaults().settings, ...data.settings },
      };
      // Adopt the requested dark monochrome appearance once; later choices persist.
      if ((data.settings?.appearanceVersion || 0) < 3) {
        this.state.settings.theme = "dark";
        this.state.settings.appearanceVersion = 3;
      }
      if (!data.settings?.codexSource && this.state.settings.codexPath) this.state.settings.codexSource = "custom";
    } catch (error) {
      if (error.code !== "ENOENT")
        throw new Error(
          "无法读取本地数据，请使用保存数据的系统账户及原有凭证钥匙启动，或检查数据文件。原数据已保留。",
        );
      this.state = defaults();
    }
    if (this.state.version < 2) {
      if (this.state.settings.fontSize === 15)
        this.state.settings.fontSize = 14;
      if (this.state.settings.defaultPermission === "workspace-write")
        this.state.settings.defaultPermission = "auto";
      for (const item of [...this.state.sessions, ...this.state.accounts])
        if (item.permission === "workspace-write") item.permission = "auto";
      this.state.version = 2;
    }
    // A task in progress at shutdown may already have written files. Do not automatically execute it again.
    for (const session of this.state.sessions) {
      for (const message of session.messages) {
        if (message.role !== "assistant") continue;
        const parsed = parseActionBlocksSafe(message.text);
        message.text = parsed.visibleText;
        const existing = new Set((message.attachments || []).map((a) => workspaceKey(a.path)));
        for (const attachment of parsed.actions.send) {
          if (existing.has(workspaceKey(attachment.path))) continue;
          (message.attachments ||= []).push({ ...attachment, label: path.basename(attachment.path) });
        }
      }
      session.queued = 0;
      if (session.busy) {
        session.busy = false;
        if (session.runStats?.checkpoint) session.runStats.checkpoint = { status: "unavailable", reason: "应用中断时未完成任务结束快照，本轮撤销不可用。" };
        session.messages.push({
          role: "system",
          text: "上次任务随应用关闭而中断。请检查工作目录后决定是否继续。",
          at: new Date().toISOString(),
          ...(session.runStats ? { runStats: structuredClone(session.runStats) } : {}),
        });
      }
    }
    this.state.reviewView = reviewView(this.state.reviewView, this.state.sessions);
    this.state.viewPreferences = viewPreferences(this.state.viewPreferences, this.state);
    return this;
  }
  save() {
    const operation = new Promise((resolve, reject) => this.saveWaiters.push({ resolve, reject }));
    if (!this.saving) {
      this.saving = true;
      this.flushSaves();
    }
    return operation;
  }
  async flushSaves() {
    while (this.saveWaiters.length) {
      // Calls arriving after serialization begins must wait for the next snapshot.
      const waiters = this.saveWaiters;
      this.saveWaiters = [];
      try {
        const data = JSON.stringify(this.state);
        const transcripts = this.archive.prepare(this.state.sessions);
        const protectedData = await this.native("vault.encrypt", {
          value: data,
        });
        const temporary = path.join(
          this.directory,
          `state.${randomBytes(6).toString("hex")}.tmp`,
        );
        try {
          await fs.writeFile(
            temporary,
            JSON.stringify({ version: 1, protected: protectedData }),
            { mode: 0o600 },
          );
          await fs.rename(temporary, path.join(this.directory, "state.json"));
          await this.archive.sync(transcripts);
        } finally {
          await fs.rm(temporary, { force: true });
        }
        for (const waiter of waiters) waiter.resolve();
      } catch (error) {
        for (const waiter of waiters) waiter.reject(error);
      }
    }
    this.saving = false;
  }
  snapshot() {
    const state = structuredClone(this.state);
    state.reviewView = reviewView(state.reviewView, state.sessions);
    state.viewPreferences = viewPreferences(state.viewPreferences, state);
    state.providers = state.providers.map(({ apiKey, ...p }) => ({
      ...p,
      hasKey: Boolean(apiKey),
    }));
    state.accounts = state.accounts.map((a) => ({
      id: a.id,
      user: a.user,
      name: a.name,
      bot: a.bot,
      workspace: a.workspace,
      providerId: a.providerId,
      model: a.model,
      effort: a.effort,
      permission: a.permission,
      sessionId: a.sessionId,
      allowedSenders: a.allowedSenders || [],
      connected: !a.expired && !a.paused,
      paused: Boolean(a.paused),
      expired: Boolean(a.expired),
      pending: a.pending.length,
      error: a.error || "",
      lastReceivedAt: a.lastReceivedAt,
      lastRepliedAt: a.lastRepliedAt,
    }));
    return state;
  }
}

export function safeError(error, secrets = []) {
  let text = String(error?.message || error || "未知错误");
  for (const secret of secrets.filter(Boolean))
    text = text.split(secret).join("[已隐藏]");
  return text
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [已隐藏]")
    .replace(
      /(api[_-]?key|bot_token|context_token|authorization)["'\s:=]+[^\s,}]+/gi,
      "$1=[已隐藏]",
    )
    .slice(0, 1200);
}

export async function workspacePath(directory) {
  if (!directory || !path.isAbsolute(directory))
    throw new Error("请选择绝对路径的工作目录。");
  const real = await fs.realpath(directory);
  if (!(await fs.stat(real)).isDirectory())
    throw new Error("工作目录不是文件夹。");
  return real;
}
