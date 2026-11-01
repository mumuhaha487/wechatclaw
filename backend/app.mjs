import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { Store, safeError, workspacePath } from "./store.mjs";
import { CodexClient } from "./codex.mjs";
import { resolveCodex, CODEX_SOURCES } from "./codex-runtime.mjs";
import { WeChatBridge } from "./bridge.mjs";
import { validateBaseUrl } from "./adapter.mjs";
import { parseActionBlocksSafe } from "./wechat-actions.mjs";
import { buildPrompt } from "./wechat-format.mjs";
import { sameWorkspace, workspaceKey } from "../shared/workspace.mjs";
import { BrowserViewer, officialBrowserStatus } from "./browser.mjs";
import { prepareOfficialBrowser } from "./official-browser.mjs";
import { DesktopAttachments, attachmentPreview } from "./desktop-attachments.mjs";
import { Checkpoints } from "./checkpoints.mjs";
import { groupChanges } from "../shared/change-stats.mjs";
import { reviewView } from "../shared/review-view.mjs";
import { viewPreferences } from "../shared/view-preferences.mjs";
import { goalRequest, goalSnapshot } from "../shared/goal.mjs";
import { validDraftKey, draftValue, readDrafts } from "./composer-drafts.mjs";

export const EFFORTS = [
  "",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
];
const UI_CODEX_METHODS = new Set([
  "thread/tokenUsage/updated", "turn/started", "turn/completed", "item/agentMessage/delta", "item/completed", "item/started",
]);
export function normalizeModels(entries) {
  const seen = new Set();
  return entries.flatMap((entry) => {
    const model = String(entry.model || entry.slug || entry.id || "").trim();
    if (
      !model ||
      entry.hidden ||
      entry.visibility === "hide" ||
      seen.has(model)
    )
      return [];
    seen.add(model);
    return [
      {
        id: model,
        model,
        displayName: entry.displayName || entry.display_name || model,
        description: entry.description || "",
        isDefault: Boolean(entry.isDefault || entry.is_default),
        defaultReasoningEffort:
          entry.defaultReasoningEffort || entry.default_reasoning_level || "",
        supportedReasoningEfforts: (
          entry.supportedReasoningEfforts ||
          entry.supported_reasoning_levels ||
          []
        )
          .map((effort) => ({
            reasoningEffort:
              typeof effort === "string"
                ? effort
                : effort.reasoningEffort || effort.effort,
            description: effort.description || "",
          }))
          .filter((effort) => effort.reasoningEffort),
      },
    ];
  });
}
export function connectionOptions(state, options = {}) {
  const providerId = options.providerId ?? state.settings.defaultProvider;
  const provider = state.providers.find((p) => p.id === providerId);
  if (!provider) throw new Error("请选择有效的模型服务。");
  const model = String(options.model ?? state.settings.defaultModel).trim();
  if (provider.type !== "local" && !model)
    throw new Error("请填写要使用的模型 ID。");
  const effort = options.effort ?? state.settings.defaultEffort;
  if (effort && !/^[a-z][a-z0-9_-]{0,31}$/i.test(effort))
    throw new Error("思考等级无效。");
  const permission = options.permission ?? state.settings.defaultPermission;
  if (
    !["read-only", "workspace-write", "ask", "accept-edits", "auto"].includes(
      permission,
    )
  )
    throw new Error("权限无效。");
  return { providerId, model, effort, permission };
}

export class App {
  constructor({
    directory,
    native,
    emit = () => {},
    store,
    clientFactory = (options) => new CodexClient(options),
    runtimeResolver = resolveCodex,
    wechatApi,
    log = () => {},
    idleTimeoutMs = 15 * 60 * 1000,
  } = {}) {
    Object.assign(this, { directory, native, emit, clientFactory, runtimeResolver, log });
    this.store = store || new Store(directory, native);
    this.desktopAttachments = new DesktopAttachments(directory || this.store.directory);
    this.checkpoints = new Checkpoints(directory || this.store.directory, native);
    this.clients = new Map();
    this.workspaces = new Map();
    this.sessionRuns = new Map();
    this.cancelled = new Set();
    this.modelRequests = new Map();
    this.desktopHandoffs = new Map();
    this.fileOperations = new Set();
    this.browserOperations = new Map();
    this.browserOwners = new Set();
    this.removingSessions = new Set();
    this.closing = false;
    this.idleTimeoutMs = idleTimeoutMs;
    this.idleTimer = setInterval(() => this.reapIdleClients(), Math.min(60000, idleTimeoutMs));
    this.idleTimer.unref();
    this.bridge = new WeChatBridge({
      store: this.store,
      run: (...args) => this.enqueue(...args),
      newSession: (options) => this.newSession(options),
      emit,
      stop: (id) => this.stop(id),
      listModels: async (session) => normalizeModels(await this.readModels(this.store.state.providers.find((p) => p.id === session.providerId))),
      runtime: async (session) => (await this.client(session)).runtime(session),
      ...(wechatApi ? { api: wechatApi } : {}),
    });
  }
  async init() {
    await this.store.init();
    for (const session of this.store.state.sessions) for (const message of session.messages) {
      const checkpoint = message.runStats?.checkpoint;
      if (checkpoint?.id && checkpoint.status === "applying") {
        try {
          const status = await this.checkpoints.status(checkpoint.id, session.workspace);
          message.runStats.checkpoint = status;
          if (status.at && status.direction) for (const item of this.store.state.sessions) if (sameWorkspace(item.workspace, session.workspace)) item.fileRestore = {
            at: status.at, direction: status.direction, files: (message.runStats.changes || []).map(c => c.relative || c.path).slice(0, 100),
          };
        } catch (error) { checkpoint.status = "recovery-needed"; checkpoint.reason = safeError(error); }
      }
    }
    await this.bridge.init();
    return this;
  }
  changed() {
    this.emit("state", this.store.snapshot());
  }
  hasPendingRestore(workspace, exceptId) {
    return this.store.state.sessions.some(s => sameWorkspace(s.workspace, workspace) && s.messages.some(m => m.runStats?.checkpoint?.id !== exceptId && ["applying", "recovery-needed"].includes(m.runStats?.checkpoint?.status)));
  }
  getSession(id) {
    if (this.removingSessions.has(id)) throw new Error("会话正在移除，请稍后重试。");
    const session = this.store.state.sessions.find((s) => s.id === id);
    if (!session) throw new Error("会话不存在。");
    return session;
  }
  browserCommand(session, action, args = {}) {
    const operations = this.browserOperations.get(session.id) || new Set();
    this.browserOperations.set(session.id, operations);
    const operation = Promise.resolve().then(() => {
      if (this.getSession(session.id) !== session) throw new Error("会话已变化，请重新打开网页。");
      this.browserOwners.add(session.id);
      return new BrowserViewer({ native: this.native, session }).call(action, args);
    });
    operations.add(operation);
    operation.finally(() => {
      operations.delete(operation);
      if (!operations.size && this.browserOperations.get(session.id) === operations) this.browserOperations.delete(session.id);
    }).catch(() => {});
    return operation;
  }
  newSession(options) {
    const session = {
      id: randomUUID(),
      title: options.title || "新会话",
      workspace: options.workspace,
      ...connectionOptions(this.store.state, options),
      source: options.source || "desktop",
      ...(options.accountId ? { accountId: options.accountId, senderId: options.senderId } : {}),
      messages: [],
      busy: false,
      queued: 0,
      createdAt: new Date().toISOString(),
    };
    this.store.state.sessions.unshift(session);
    return session;
  }
  codexRuntime(refresh = false) {
    const { codexPath, codexSource } = this.store.state.settings;
    return this.runtimeResolver({ configured: codexPath, source: codexSource || (codexPath ? "custom" : "auto"), refresh });
  }
  async client(session) {
    const profile = this.store.state.providers.find(
      (p) => p.id === session.providerId,
    );
    if (!profile) throw new Error("模型服务已被移除，请重新选择。");
    const runtime = await this.codexRuntime();
    const executable = runtime.path;
    const signature = JSON.stringify([
      profile,
      this.store.state.settings.codexPath,
      this.store.state.settings.codexSource,
      executable,
      session.permission,
    ]);
    let entry = this.clients.get(session.id);
    if (entry?.signature !== signature) {
      entry?.client.close();
      entry = {
        signature,
        client: this.clientFactory({ executable, profile, prepareBrowser: () => prepareOfficialBrowser({
          session, executable, directory: this.store.directory, native: this.native,
        }) }),
        lastUsed: Date.now(),
      };
      this.clients.set(session.id, entry);
      entry.client.on?.("approval", (request) => {
        this.emit("approval", { sessionId: session.id, ...request });
        if (entry.taskKey) this.bridge.requestApproval(session.id, entry.taskKey, request,
          (allow, content) => entry.client.respondApproval(request.requestId, allow, content)).catch(error => this.log("ERROR", error));
      });
      entry.client.on?.("approval-ended", ({ requestId }) => {
        this.bridge.dismissApproval(session.id, requestId);
        this.emit("approval-ended", { sessionId: session.id, requestId });
      });
      entry.client.on?.("browser-access", () => {
        if (!session.busy || entry.browserShownAt === session.runStats?.startedAt) return;
        entry.browserShownAt = session.runStats?.startedAt;
        this.emit("browser-automation", { sessionId: session.id });
      });
      entry.client.on?.("browser-status", status => this.emit("browser-status", { sessionId: session.id, ...status }));
      entry.client.on?.("unexpected-close", (error) => this.log("ERROR", error));
      entry.client.on?.("notification", ({ method, params }) => {
        if (params?.threadId !== session.threadId || !["thread/goal/updated", "thread/goal/cleared"].includes(method)) return;
        const previousGoal = session.goal;
        session.goal = method === "thread/goal/cleared" ? null : goalSnapshot(params.goal, session.threadId);
        if (!session.goal || previousGoal?.objective !== session.goal.objective || previousGoal?.createdAt !== session.goal.createdAt) session.goalMessageIndex = undefined;
        if (session.goal && session.busy && session.runStats) session.runStats.goal = structuredClone(session.goal);
        this.changed();
        this.store.save().catch(error => this.log("ERROR", error));
      });
    }
    entry.lastUsed = Date.now();
    return entry.client;
  }
  reapIdleClients() {
    for (const [id, entry] of this.clients) {
      const session = this.store.state?.sessions.find((s) => s.id === id);
      if (session?.busy || session?.queued || entry.client.active || entry.client.approvals?.size) continue;
      if (Date.now() - entry.lastUsed < this.idleTimeoutMs || entry.lastUsed === undefined) continue;
      entry.client.close();
      this.clients.delete(id);
    }
  }
  async run(id, text, taskKey, options = {}) {
    if (this.closing) throw new Error("应用正在退出。");
    text = String(text || "").trim();
    if (!text || text.length > 120000)
      throw new Error("请输入 1 至 120000 字符的任务。");
    const session = this.getSession(id);
    if (session.busy) throw new Error("这个会话已有运行中的任务。");
    session.busy = true;
    session.runStats = undefined;
    this.cancelled.delete(id);
    try {
      session.workspace = await workspacePath(session.workspace);
    } catch (error) {
      session.busy = false;
      this.changed();
      throw error;
    }
    if (!options.hideUserMessage) session.messages.push({
      role: "user",
      text: options.displayText || text,
      ...(options.attachments?.length ? { attachments: options.attachments.map((a) => ({ type: a.kind, path: a.path, label: a.label })) } : {}),
      at: new Date().toISOString(),
      taskKey,
    });
    const goalMessageIndex = options.goal?.messageIndex ?? (!options.hideUserMessage ? session.messages.length - 1 : undefined);
    if (session.title === "新会话")
      session.title = (options.displayText || text).replace(/\s+/g, " ").slice(0, 34);
    session.updatedAt = new Date().toISOString();
    this.changed();
    try {
      await this.store.save();
    } catch (error) {
      session.busy = false;
      this.changed();
      throw error;
    }
    const key = workspaceKey(session.workspace);
    const waiting = this.workspaces.has(key);
    const previous = this.workspaces.get(key) || Promise.resolve();
    let unlock;
    const lock = new Promise((resolve) => {
      unlock = resolve;
    });
    this.workspaces.set(key, lock);
    if (waiting)
      this.emit("activity", { sessionId: id, text: "正在准备工作目录…" });
    await previous.catch(() => {});
    let progressChain = Promise.resolve();
    let checkpointFinished = false;
    const completeCheckpoint = async () => {
      if (checkpointFinished || !session.runStats?.checkpoint) return;
      checkpointFinished = true;
      try {
        const result = await this.checkpoints.finish(session.runStats.checkpoint, session.workspace);
        session.runStats.checkpoint = result.checkpoint;
        const reported = groupChanges(session.runStats.changes);
        session.runStats.changes = result.changes === null ? reported : result.changes.map(change => ({
          ...change, diffs: reported.find(c => workspaceKey(path.resolve(session.workspace, c.path)) === workspaceKey(change.path))?.diffs || [],
        }));
      } catch (error) {
        session.runStats.checkpoint = { status: "unavailable", reason: safeError(error) };
        session.runStats.changes = groupChanges(session.runStats.changes);
      }
      session.runStats.durationMs = Date.now() - session.runStats.startedAt;
    };
    try {
      if (this.cancelled.has(id) || this.closing)
        return await this.finish(session, "任务已停止。", taskKey);
      if (this.hasPendingRestore(session.workspace)) throw new Error("工作目录有尚未完成的文件恢复，请先在更改卡片中恢复操作前状态。");
      const client = await this.client(session);
      const runningEntry = this.clients.get(id);
      if (runningEntry) runningEntry.taskKey = taskKey || null;
      session.runStats = { startedAt: Date.now(), tools: 0, actions: [], changes: [] };
      this.emit("activity", { sessionId: id, text: "正在准备文件更改快照…" });
      try { session.runStats.checkpoint = await this.checkpoints.begin(session.workspace); }
      catch (error) { session.runStats.checkpoint = { status: "unavailable", reason: safeError(error) }; }
      await this.store.save();
      if (this.cancelled.has(id) || this.closing) {
        await completeCheckpoint();
        return await this.finish(session, "任务已停止。", taskKey);
      }
      const progressSeen = new Set();
      const answer = client.answerWithThread ? client.answerWithThread.bind(client) : async (...args) => {
        session.threadId = await client.thread(session); await this.store.save();
        if (this.cancelled.has(id) || this.closing) return "任务已停止。";
        return client.answer(...args);
      };
      const reply = await answer(session, taskKey ? text : buildPrompt(text, options.attachments || [], "Web"), (event) => {
        const item = event.params?.item;
        if (event.method === "thread/goal/updated" && options.goal?.objective === event.params.goal?.objective && Number.isInteger(goalMessageIndex)) {
          session.goalMessageIndex = goalMessageIndex;
          this.store.save().catch(error => this.log("ERROR", error));
        }
        if (
          event.method === "item/started" &&
          [
            "commandExecution",
            "fileChange",
            "mcpToolCall",
            "webSearch",
          ].includes(item?.type)
        ) {
          session.runStats.tools++;
          session.runStats.actions.push(
            String(item.command || item.tool || item.type).slice(0, 1000),
          );
          session.runStats.actions = session.runStats.actions.slice(-100);
        }
        if (event.method === "thread/tokenUsage/updated")
          session.tokenUsage = event.params.tokenUsage;
        if (event.method === "item/completed" && item?.type === "fileChange" && item.status === "completed") {
          for (const change of item.changes || []) {
            const entry = { path: String(change.path || ""), kind: change.kind?.type || "update", diff: String(change.diff || "").slice(0, 200000) };
            if (entry.path) session.runStats.changes.push(entry);
          }
        }
        const progressText = event.method === "qqclaw/goalProgress" ? event.params.text
          : event.method === "item/completed" && item?.type === "agentMessage" && item.phase === "commentary" ? item.text : "";
        if (progressText?.trim()) {
          const progress = progressText.trim();
          const progressKey = event.method === "qqclaw/goalProgress" ? `goal:${event.params.turnId}` : progress;
          if (!progressSeen.has(progressKey)) {
            progressSeen.add(progressKey);
            session.messages.push({ role: "assistant", kind: "progress", text: progress, at: new Date().toISOString(), taskKey,
              ...(event.params.attachments?.length && event.method === "qqclaw/goalProgress" ? { attachments: event.params.attachments.map(attachment => ({ ...attachment, label: path.basename(attachment.path) })) } : {}),
            });
            this.changed();
            progressChain = progressChain.then(async () => {
              await this.store.save();
              if (options.onProgress) await options.onProgress(progress);
            }).catch((error) => {
              this.emit("activity", { sessionId: id, text: `微信进度待重试：${safeError(error)}` });
            });
          }
        }
        if (UI_CODEX_METHODS.has(event.method)) this.emit("codex", { sessionId: id, ...event });
      }, { images: taskKey ? [] : (options.attachments || []).filter(a => a.kind === "image").map(a => a.path), goal: options.goal,
        onThread: async () => { await this.store.save(); if (this.cancelled.has(id) || this.closing) await client.interrupt(); } });
      await progressChain;
      await completeCheckpoint();
      return await this.finish(session, reply, taskKey);
    } catch (error) {
      await progressChain;
      await completeCheckpoint();
      const secrets = this.store.state.providers.map((p) => p.apiKey);
      const message = safeError(error, secrets);
      session.messages.push({
        role: "system",
        text: message,
        at: new Date().toISOString(),
        taskKey,
        ...(session.runStats ? { runStats: structuredClone(session.runStats) } : {}),
      });
      throw new Error(message);
    } finally {
      session.busy = false;
      const entry = this.clients.get(id);
      if (entry) { entry.lastUsed = Date.now(); entry.taskKey = null; }
      this.cancelled.delete(id);
      unlock();
      if (this.workspaces.get(key) === lock) this.workspaces.delete(key);
      await this.store.save();
      this.changed();
    }
  }
  enqueue(id, text, taskKey, ready, options) {
    if (this.closing) return Promise.reject(new Error("应用正在退出。"));
    const session = this.getSession(id);
    text = String(text || "").trim();
    if (!text || text.length > 120000)
      return Promise.reject(new Error("请输入 1 至 120000 字符的任务。"));
    if ((session.queued || 0) >= 50)
      return Promise.reject(new Error("待处理消息较多，请等待当前任务完成。"));
    session.queued = (session.queued || 0) + 1;
    this.changed();
    const previous = this.sessionRuns.get(id) || Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      try { await ready; } finally { session.queued = Math.max(0, session.queued - 1); }
      if (this.closing) throw new Error("应用正在退出。待处理消息未执行。");
      return this.run(id, text, taskKey, options);
    });
    this.sessionRuns.set(id, current);
    const cleanup = () => {
      if (this.sessionRuns.get(id) === current) this.sessionRuns.delete(id);
    };
    current.then(cleanup, cleanup);
    return current;
  }
  async finish(session, text, taskKey) {
    const parsed = parseActionBlocksSafe(text);
    session.messages.push({
      role: "assistant",
      text: parsed.visibleText,
      ...(parsed.actions.send.length ? { attachments: parsed.actions.send.map((a) => ({ ...a, label: path.basename(a.path) })) } : {}),
      at: new Date().toISOString(),
      taskKey,
      ...(session.runStats
        ? { runStats: structuredClone(session.runStats) }
        : {}),
    });
    await this.store.save();
    return text;
  }
  checkpointMessage(p) {
    const session = this.getSession(p.sessionId), index = Number(p.message);
    const message = Number.isInteger(index) && index >= 0 ? session.messages[index] : null;
    if (!message?.runStats?.checkpoint?.id) throw new Error("此消息没有可用的文件快照。");
    if (p.checkpointId && p.checkpointId !== message.runStats.checkpoint.id)
      throw new Error("此消息的文件快照已变化，请重新打开更改卡片。");
    return { session, message, id: message.runStats.checkpoint.id };
  }
  async restoreCheckpoint(p) {
    if (this.closing) throw new Error("应用正在退出。");
    const { session, id } = this.checkpointMessage(p), workspace = await workspacePath(session.workspace), key = workspaceKey(workspace);
    if (this.hasPendingRestore(workspace, id)) throw new Error("请先在原更改卡片中恢复上次未完成的文件操作。");
    if (this.workspaces.has(key) || this.store.state.sessions.some(s => sameWorkspace(s.workspace, workspace) && (s.busy || s.queued))) throw new Error("请等待此工作目录中的任务或文件操作完成。");
    let unlock;
    const lock = new Promise(resolve => { unlock = resolve; });
    this.workspaces.set(key, lock);
    const update = checkpoint => {
      for (const item of this.store.state.sessions) {
        if (item.runStats?.checkpoint?.id === id) item.runStats.checkpoint = structuredClone(checkpoint);
        for (const message of item.messages) if (message.runStats?.checkpoint?.id === id) message.runStats.checkpoint = structuredClone(checkpoint);
      }
    };
    try {
      const status = await this.checkpoints.status(id, workspace);
      update({ ...status, status: "applying" });
      await this.store.save(); this.changed();
      const result = await this.checkpoints.restore(id, workspace, p.direction);
      const review = await this.checkpoints.review(id, workspace);
      for (const item of this.store.state.sessions) if (sameWorkspace(item.workspace, workspace)) item.fileRestore = {
        at: result.at, direction: result.direction, files: review.files.map(c => c.relative).slice(0, 100),
      };
      return result;
    } finally {
      try { update(await this.checkpoints.status(id, workspace)); }
      catch (error) { update({ id, status: "recovery-needed", reason: safeError(error) }); }
      try { await this.store.save(); this.changed(); }
      finally { unlock(); if (this.workspaces.get(key) === lock) this.workspaces.delete(key); }
    }
  }
  async stop(id) {
    this.getSession(id);
    this.cancelled.add(id);
    return (await this.clients.get(id)?.client.interrupt()) || { stopped: true };
  }
  continueDesktop(params = {}) {
    const key = params.sessionId || `new:${workspaceKey(params.workspace || "")}`;
    if (this.desktopHandoffs.has(key)) return this.desktopHandoffs.get(key);
    const operation = this.openDesktopSession(params).finally(() => this.desktopHandoffs.delete(key));
    this.desktopHandoffs.set(key, operation);
    return operation;
  }
  async openDesktopSession({ sessionId, workspace }) {
    if (this.closing) throw new Error("应用正在退出。");
    const session = sessionId ? this.getSession(sessionId) : null;
    const fingerprint = session ? `${session.threadId}:${session.messages.length}:${session.updatedAt || ""}` : "";
    workspace = session?.workspace || workspace;
    if (!workspace) throw new Error("请先选择工作目录。");
    if (this.hasPendingRestore(workspace)) throw new Error("请先恢复此工作目录中未完成的文件操作，再接续 Desktop。");
    const key = workspaceKey(workspace);
    if (this.workspaces.has(key) || this.store.state.sessions.some((s) => sameWorkspace(s.workspace, workspace) && (s.busy || s.queued)))
      throw new Error("请等待该工作目录中的任务完成，再在 Desktop 中继续。");
    let unlock;
    const lock = new Promise((resolve) => { unlock = resolve; });
    this.workspaces.set(key, lock);
    let client;
    try {
      workspace = await workspacePath(workspace);
      const desktop = await this.native("desktop.status", {});
      if (!desktop?.installed) throw new Error("未检测到 Codex Desktop，请到「设置 → 运行环境」安装。QQClaw 仍可使用 CLI。");
      // A deep link has no CODEX_HOME parameter. Never claim an unreadable fork opened.
      const codexHome = this.store.archive.info().codexHome;
      if (session?.threadId && desktop.codexHome && !sameWorkspace(codexHome, desktop.codexHome))
        throw new Error("QQClaw 与 Desktop 的 Codex 用户目录不同，请先使用相同的 CODEX_HOME，再接续历史会话。");
      await this.store.save();
      if (!session?.threadId) {
        if (this.closing) throw new Error("应用正在退出。");
        await this.native("desktop.open", { workspace });
        return { opened: true, copied: false, message: "已请求在 Desktop 中打开此工作目录。请在 Desktop 中发送任务并使用内置浏览器；QQClaw 的草稿仍保留。" };
      }
      const runtime = await this.codexRuntime();
      client = this.clientFactory({ executable: runtime.path, profile: { type: "local" } });
      client.on?.("unexpected-close", (error) => this.log("ERROR", error));
      await client.connect();
      let threadId = session.desktopCopy?.fingerprint === fingerprint ? session.desktopCopy.threadId : null;
      if (threadId) {
        try { await client.request("thread/read", { threadId }); }
        catch (error) {
          if (!/no rollout found|thread.*not found/i.test(error.message)) throw error;
          threadId = null;
        }
      }
      if (!threadId) {
        const { config = {} } = await client.request("config/read", { cwd: workspace, includeLayers: false });
        const defaults = config.model ? null : (await client.models()).find((model) => model.isDefault);
        const model = config.model || defaults?.model || defaults?.id;
        if (!model) throw new Error("无法确定 Desktop 的默认模型，请先在 Desktop 中配置模型，再重试接续。");
        const effort = config.model_reasoning_effort || defaults?.defaultReasoningEffort;
        const result = await client.request("thread/fork", {
          threadId: session.threadId, cwd: workspace, ephemeral: false, excludeTurns: true,
          modelProvider: config.model_provider || "openai",
          model,
          ...(effort ? { config: { model_reasoning_effort: effort } } : {}),
          approvalPolicy: "on-request", sandbox: "workspace-write",
          developerInstructions: "这是从 QQClaw 接续到 Codex Desktop 的独立对话副本。请保留已有对话上下文，按用户在 Desktop 中的新指令继续。浏览器与其他桌面工具由 Desktop 提供。QQClaw 与微信不会自动收到此副本的后续回复；无需自行向微信发送消息。",
        });
        threadId = result.thread.id;
        session.desktopCopy = { threadId, fingerprint, createdAt: new Date().toISOString() };
        await this.store.save();
        this.changed();
      }
      if (this.closing) throw new Error("应用正在退出，对话副本已保存，重新打开后可继续。");
      await this.native("desktop.open", { threadId });
      return { opened: true, copied: true, threadId, message: "已请求在 Desktop 中打开对话副本。请在那里继续发送任务；Desktop 后续回复不会同步回 QQClaw 或微信。" };
    } finally {
      client?.close();
      unlock();
      if (this.workspaces.get(key) === lock) this.workspaces.delete(key);
    }
  }
  readModels(profile) {
    const key = profile.type === "local" ? JSON.stringify([profile.id || "local", this.store.state.settings.codexSource, this.store.state.settings.codexPath]) : `${profile.id || ""}:${createHash("sha256")
      .update(JSON.stringify([profile.baseUrl || "", profile.apiKey || ""]))
      .digest("hex").slice(0, 8)}`;
    if (this.modelRequests.has(key)) return this.modelRequests.get(key);
    const request = this.loadModels(profile).finally(() => {
      if (this.modelRequests.get(key) === request) this.modelRequests.delete(key);
    });
    this.modelRequests.set(key, request);
    return request;
  }
  async loadModels(profile) {
    if (profile.type === "local") {
      const client = this.clientFactory({
        executable: (await this.codexRuntime()).path,
        profile,
      });
      client.on?.("unexpected-close", (error) => this.log("ERROR", error));
      try {
        return await client.models();
      } finally {
        client.close();
      }
    }
    const response = await fetch(`${validateBaseUrl(profile.baseUrl)}/models`, {
      headers: profile.apiKey
        ? { Authorization: `Bearer ${profile.apiKey}` }
        : {},
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        `模型列表接口返回 HTTP ${response.status}。服务未提供 /models 时，可以直接填写模型 ID。`,
      );
    const result = await response.json();
    const models = result.data || result.models;
    if (!Array.isArray(models))
      throw new Error(
        "模型列表格式不是 { data: [{ id: ... }] }，请手动填写模型 ID。",
      );
    return normalizeModels(models);
  }
  async handle(method, p = {}) {
    const state = this.store.state;
    switch (method) {
      case "approval.respond": {
        const client = this.clients.get(p.sessionId)?.client;
        if (!client) throw new Error("此会话已结束。");
        client.respondApproval(p.requestId, p.allow === true, p.content);
        return { ok: true };
      }
      case "snapshot":
        return { ...this.store.snapshot(), wechat: this.bridge.status() };
      case "draft.read":
        return readDrafts(state, this.desktopAttachments);
      case "draft.remember": {
        if (!validDraftKey(p.key, state)) throw new Error("草稿所属的会话或工作目录已不存在。");
        const value = draftValue(p.value);
        state.composerDrafts ||= {};
        if (value.text || value.attachments.length || value.goalMode) state.composerDrafts[p.key] = value;
        else delete state.composerDrafts[p.key];
        await this.store.save();
        return { saved: true };
      }
      case "review.remember":
        state.reviewView = reviewView(p.value, state.sessions);
        await this.store.save();
        return { saved: true };
      case "view.remember":
        state.viewPreferences = viewPreferences(p.value, state);
        await this.store.save();
        return { saved: true };
      case "checkpoint.review": {
        const { session, id } = this.checkpointMessage(p);
        return await this.checkpoints.review(id, session.workspace, String(p.relative || ""));
      }
      case "checkpoint.restore": {
        const operation = this.restoreCheckpoint(p);
        this.fileOperations.add(operation);
        try { return await operation; } finally { this.fileOperations.delete(operation); }
      }
      case "desktop.continue":
        return this.continueDesktop(p);
      case "browser.open": {
        const session = this.getSession(p.sessionId);
        return this.browserCommand(session, "open", { url: p.url || "https://www.google.com/", tabId: String(p.tabId || "") });
      }
      case "browser.command": {
        if (!["back", "forward", "reload", "stop", "newTab", "selectTab", "closeTab", "restoreTab", "state"].includes(p.action)) throw new Error("不支持的浏览器操作。");
        const session = this.getSession(p.sessionId);
        // Native hosts serialize work within its target page. A slow page must
        // not hold selection, closing, or navigation in another page.
        return this.browserCommand(session, p.action, p.action === "restoreTab" ? { url: String(p.url || "") } : { tabId: String(p.tabId || "") });
      }
      case "browser.find": {
        const session = this.getSession(p.sessionId);
        if (!["search", "next", "previous", "clear"].includes(p.operation) || typeof p.query !== "string" || p.query.length > 512)
          throw new Error("网页查找参数无效，最多输入 512 个字符。");
        if (p.navigationRevision !== undefined && (typeof p.navigationRevision !== "string" || !/^(0|[1-9]\d{0,19})$/.test(p.navigationRevision)))
          throw new Error("网页导航状态无效，请重新打开查找。");
        return new BrowserViewer({ native: this.native, session }).call("find", { tabId: String(p.tabId || ""), operation: p.operation, query: p.query,
          ...(p.navigationRevision === undefined ? {} : { navigationRevision: p.navigationRevision }) });
      }
      case "browser.officialStatus": {
        const installed = await officialBrowserStatus();
        const client = this.clients.get(p.sessionId)?.client;
        return { ...installed, ...(client?.browserConfiguration && client?.browserStatus ? client.browserStatus() : {}) };
      }
      case "attachment.import":
        return this.desktopAttachments.import(p);
      case "attachment.preview": {
        const attachment = p.id ? await this.desktopAttachments.resolve(p.id) :
          this.getSession(p.sessionId).messages[Number(p.message)]?.attachments?.[Number(p.attachment)];
        if (!attachment) throw new Error("附件不存在，请重新打开会话。");
        return attachmentPreview(attachment.path);
      }
      case "attachment.reveal": {
        const session = this.getSession(p.sessionId);
        const message = session.messages[Number(p.message)];
        const attachment = message?.attachments?.[Number(p.attachment)];
        if (!attachment) throw new Error("附件不存在，请重新打开会话。");
        const file = await fs.realpath(attachment.path);
        if (!(await fs.stat(file)).isFile()) throw new Error("附件文件已被移动或删除。");
        // Reveal rather than execute a model-generated local file.
        return await this.native("shell.reveal", { path: file });
      }
      case "workspace.list":
      case "workspace.read":
      case "workspace.reveal":
      case "workspace.diff": {
        const root = await workspacePath(p.workspace);
        const known = [
          ...state.projects,
          ...state.sessions,
          ...state.accounts,
        ].some((item) => sameWorkspace(item.workspace, root));
        if (!known) throw new Error("请先添加这个工作目录。");
        if (method === "workspace.diff") {
          try {
            const { stdout } = await promisify(execFile)(
              "git",
              [
                "-C",
                root,
                "diff",
                "HEAD",
                "--no-ext-diff",
                "--no-color",
                "--",
                ".",
              ],
              { windowsHide: true, maxBuffer: 2 * 1024 * 1024, timeout: 15000 },
            );
            return { diff: stdout };
          } catch {
            throw new Error("此目录没有可读取的 Git 历史，或 Git 尚未安装。");
          }
        }
        const target = await fs.realpath(
          path.resolve(root, String(p.file || p.directory || ".")),
        );
        const realRoot = await fs.realpath(root);
        const relative = path.relative(realRoot, target);
        if (
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        )
          throw new Error("只能查看工作目录内的文件。");
        if (method === "workspace.reveal") return await this.native("shell.reveal", { path: target });
        if (method === "workspace.read") {
          const stat = await fs.stat(target);
          if (!stat.isFile() || stat.size > 512 * 1024)
            throw new Error("预览支持 512 KB 以内的文本文件。");
          const buffer = await fs.readFile(target);
          if (buffer.includes(0)) throw new Error("这个文件不是文本文件。");
          return { name: path.basename(target), relative, text: buffer.toString("utf8") };
        }
        const entries = (await fs.readdir(target, { withFileTypes: true }))
          .filter((entry) => !entry.isSymbolicLink())
          .map((entry) => ({
            name: entry.name,
            directory: entry.isDirectory(),
            relative: path.relative(realRoot, path.join(target, entry.name)),
          }))
          .sort(
            (a, b) =>
              Number(b.directory) - Number(a.directory) ||
              a.name.localeCompare(b.name),
          );
        return { directory: relative, entries };
      }
      case "environment": {
        let codexPath = "",
          codexVersion = "",
          error = "";
        let codexSource = "";
        try {
          const runtime = await this.codexRuntime(p.refresh === true);
          codexPath = runtime.path; codexVersion = runtime.version; codexSource = runtime.source;
        } catch (e) {
          codexPath = "";
          error = safeError(e);
        }
        return {
          node: process.version,
          nodePath: process.execPath,
          codexPath,
          codexVersion,
          codexSource,
          desktop: await this.native("desktop.status", {}).catch(() => ({ installed: false })),
          error,
          dataDir: this.directory,
          platform: process.platform,
          ...this.store.archive.info(),
        };
      }
      case "conversations.open": {
        await fs.mkdir(this.store.archive.directory, { recursive: true, mode: 0o700 });
        return this.native("shell.folder", { path: this.store.archive.directory });
      }
      case "conversations.restore": {
        if (state.sessions.some((s) => s.busy || s.queued)) throw new Error("请在任务完成后恢复对话。");
        const saved = await this.store.archive.read();
        let restored = 0, providersMissing = 0;
        for (const entry of saved) {
          if (state.sessions.some((s) => s.id === entry.id)) continue;
          const provider = state.providers.find((p) => p.id === entry.providerId);
          if (!provider) providersMissing++;
          state.sessions.push({
            id: entry.id, title: String(entry.title || "恢复的会话").slice(0, 100), workspace: entry.workspace,
            source: "desktop", providerId: provider?.id || "local", model: provider ? String(entry.model || "") : "",
            effort: provider ? String(entry.effort || "") : "", permission: "ask", busy: false, queued: 0,
            createdAt: entry.createdAt, updatedAt: entry.updatedAt, threadId: entry.threadId || undefined,
            codexThreadPath: entry.codexThreadPath || null,
            goal: goalSnapshot(entry.goal, entry.threadId),
            goalMessageIndex: Number.isInteger(entry.goalMessageIndex) && entry.messages[entry.goalMessageIndex]?.role === "user" ? entry.goalMessageIndex : undefined,
            messages: entry.messages.map((m) => ({ role: m.role, text: m.text, kind: m.kind === "progress" ? "progress" : undefined, at: m.at,
              attachments: (m.attachments || []).map((a) => ({ type: a.type, path: a.path, label: a.label })) })),
          });
          restored++;
        }
        await this.store.save(); this.changed();
        return { restored, providersMissing };
      }
      case "project.add": {
        const workspace = await workspacePath(p.workspace);
        if (
          !state.projects.some(
            (project) =>
              sameWorkspace(project.workspace, workspace),
          )
        )
          state.projects.push({
            id: randomUUID(),
            workspace,
            name: path.basename(workspace) || workspace,
          });
        await this.store.save();
        this.changed();
        return this.store.snapshot();
      }
      case "project.remove": {
        const project = state.projects.find((x) => x.id === p.id);
        if (
          project &&
          state.sessions.some(
            (s) => sameWorkspace(s.workspace, project.workspace) && (s.busy || s.queued),
          )
        )
          throw new Error("项目中还有运行中的任务。");
        if (project && state.accounts.some((account) => sameWorkspace(account.workspace, project.workspace) ||
          [...this.bridge.accountSessionIds(account)].some((id) => sameWorkspace(state.sessions.find((s) => s.id === id)?.workspace, project.workspace))))
          throw new Error("项目正在供微信账户使用，请先更改绑定或断开账户。");
        state.projects = state.projects.filter((x) => x.id !== p.id);
        await this.store.save();
        this.changed();
        return this.store.snapshot();
      }
      case "session.create": {
        const session = this.newSession({
          ...p,
          workspace: await workspacePath(p.workspace),
        });
        await this.store.save();
        this.changed();
        return session;
      }
      case "session.update": {
        const session = this.getSession(p.id);
        if (this.workspaces.has(workspaceKey(session.workspace)) && !session.busy) throw new Error("工作目录正在执行文件操作，请稍后修改会话。");
        if (session.busy || session.queued || this.desktopHandoffs.has(p.id)) throw new Error("任务运行、排队或正在接续 Desktop 时不能修改会话配置。");
        const title = p.title === undefined ? undefined : String(p.title).trim();
        if (title !== undefined && !title) throw new Error("会话名称不能为空。");
        const next = connectionOptions(state, { ...session, ...p });
        const account = state.accounts.find((a) => a.sessionId === session.id);
        if (account && Object.entries(next).some(([key, value]) => session[key] !== value)) {
          if (this.bridge.accountBusy(account) || account.pending.length)
            throw new Error("微信账户还有运行中或待回复的消息，完成后再修改配置。");
          Object.assign(account, next);
          account.senderSessions = {};
        }
        Object.assign(session, next);
        if (title !== undefined) session.title = title.slice(0, 100);
        await this.store.save();
        this.changed();
        return session;
      }
      case "session.remove": {
        const session = this.getSession(p.id);
        if (this.hasPendingRestore(session.workspace)) throw new Error("请先恢复尚未完成的文件操作，再移除此会话。");
        if (this.workspaces.has(workspaceKey(session.workspace))) throw new Error("请等待工作目录中的文件操作完成。");
        if (session.busy || session.queued || this.desktopHandoffs.has(p.id)) throw new Error("请先等待任务或 Desktop 接续完成。");
        if (state.accounts.some((a) => this.bridge.accountSessionIds(a).has(p.id)))
          throw new Error("该会话正在供微信账户使用，请先断开账户。");
        const operation = (async () => {
          this.removingSessions.add(p.id);
          try {
            const browser = new BrowserViewer({ native: this.native, session });
            if (this.browserOwners.has(p.id)) {
              await browser.call("dispose");
              this.browserOwners.delete(p.id);
            }
            await Promise.allSettled([...(this.browserOperations.get(p.id) || [])]);
            this.clients.get(p.id)?.client.close();
            this.clients.delete(p.id);
            state.sessions = state.sessions.filter((s) => s.id !== p.id);
            await this.store.save();
            this.changed();
            return this.store.snapshot();
          } finally { this.removingSessions.delete(p.id); }
        })();
        this.fileOperations.add(operation);
        try { return await operation; } finally { this.fileOperations.delete(operation); }
      }
      case "chat.send": {
        const session = this.getSession(p.sessionId);
        const attachments = await this.desktopAttachments.resolveMany(p.attachments || []);
        const text = String(p.text || "").trim();
        if (text.length > 120000 || (!text && !attachments.length)) throw new Error("请输入任务或添加附件。");
        const goal = p.goal === true ? goalRequest(text, p.tokenBudget) : undefined;
        // Return promptly; completion and errors are delivered through state events.
        this.enqueue(session.id, text || "请查看附件。", undefined, undefined, {
          attachments, displayText: text || "请查看附件。", goal,
        }).catch((error) =>
          this.emit("task-error", {
            sessionId: p.sessionId,
            error: safeError(error),
          }),
        );
        return { accepted: true };
      }
      case "chat.stop":
        return this.stop(p.sessionId);
      case "goal.get": {
        const session = this.getSession(p.sessionId);
        const previousGoal = session.goal;
        session.goal = session.threadId ? await (await this.client(session)).readGoal(session) : null;
        if (!session.goal || previousGoal?.objective !== session.goal.objective || previousGoal?.createdAt !== session.goal.createdAt) session.goalMessageIndex = undefined;
        await this.store.save(); this.changed();
        return session.goal;
      }
      case "goal.fromMessage": {
        const session = this.getSession(p.sessionId), message = session.messages[p.message];
        if (!Number.isInteger(p.message) || message?.role !== "user") throw new Error("请选择一条用户消息作为目标。");
        if (session.busy || session.queued) throw new Error("请先停止或等待当前任务结束，再设置目标。");
        const goal = goalRequest(message.text, p.tokenBudget);
        const attachments = await Promise.all((message.attachments || []).map(async attachment => {
          const stat = await fs.stat(attachment.path);
          if (!stat.isFile() || stat.size > 100 * 1024 * 1024) throw new Error("原消息附件已不可用，请重新添加。");
          return { kind: attachment.type, path: attachment.path, label: attachment.label };
        }));
        this.enqueue(session.id, message.text, undefined, undefined, { hideUserMessage: true, attachments,
          goal: { ...goal, controlOnly: true, messageIndex: p.message } })
          .catch(error => this.emit("task-error", { sessionId: session.id, error: safeError(error) }));
        return { accepted: true };
      }
      case "goal.set": {
        const session = this.getSession(p.sessionId), goal = goalRequest(p.objective, p.tokenBudget);
        if (session.busy || session.queued || this.desktopHandoffs.has(session.id)) throw new Error("请先暂停或等待当前任务结束，再修改目标。");
        this.enqueue(session.id, goal.objective, undefined, undefined, { hideUserMessage: true,
          goal: { ...goal, controlOnly: true, ...(Number.isInteger(session.goalMessageIndex) ? { messageIndex: session.goalMessageIndex } : {}) } })
          .catch(error => this.emit("task-error", { sessionId: session.id, error: safeError(error) }));
        return { accepted: true };
      }
      case "goal.resume": {
        const session = this.getSession(p.sessionId);
        if (session.busy || session.queued || this.desktopHandoffs.has(session.id)) throw new Error("请等待当前任务结束后继续目标。");
        if (!session.threadId) throw new Error("没有可继续的Codex目标。");
        const budget = goalRequest("继续目标", p.tokenBudget).tokenBudget;
        this.enqueue(session.id, "请继续当前目标，直到完成或遇到需要用户处理的实际阻碍。", undefined, undefined, {
          hideUserMessage: true, goal: { resume: true, controlOnly: true, ...(budget !== undefined ? { tokenBudget: budget } : {}) },
        }).catch(error => this.emit("task-error", { sessionId: session.id, error: safeError(error) }));
        return { accepted: true };
      }
      case "goal.clear": {
        const session = this.getSession(p.sessionId);
        if (session.busy || session.queued || this.desktopHandoffs.has(session.id)) throw new Error("请先停止当前任务，再移除目标。");
        if (session.threadId) await (await this.client(session)).clearGoal(session);
        session.goal = null;
        session.goalMessageIndex = undefined;
        await this.store.save(); this.changed();
        return { cleared: true };
      }
      case "settings.save": {
        const connectionChange = ["defaultProvider", "defaultModel", "defaultEffort", "defaultPermission", "codexPath", "codexSource"]
          .some((key) => Object.hasOwn(p, key));
        if (connectionChange && (this.desktopHandoffs.size || state.sessions.some((s) => s.busy || s.queued)))
          throw new Error("请在当前任务完成后保存全局设置。");
        const changes = {};
        if (p.theme !== undefined) {
          if (!["light", "dark", "system"].includes(p.theme))
            throw new Error("主题无效。");
          changes.theme = p.theme;
        }
        if (p.fontSize !== undefined) {
          if (
            !Number.isFinite(p.fontSize) ||
            p.fontSize < 12 ||
            p.fontSize > 20
          )
            throw new Error("字号应为 12–20。");
          changes.fontSize = p.fontSize;
        }
        if (p.showStatus !== undefined)
          changes.showStatus = Boolean(p.showStatus);
        for (const key of ["showCounts", "showActivity", "showTime"])
          if (p[key] !== undefined) changes[key] = Boolean(p[key]);
        if (p.fontFamily !== undefined) {
          if (!["system", "yahei", "consolas"].includes(p.fontFamily))
            throw new Error("字体无效。");
          changes.fontFamily = p.fontFamily;
        }
        if (p.codexSource !== undefined) {
          if (!CODEX_SOURCES.includes(p.codexSource)) throw new Error("Codex 来源无效。");
          changes.codexSource = p.codexSource;
          if (p.codexSource !== "custom") changes.codexPath = "";
        }
        if (p.codexPath !== undefined || p.codexSource === "custom") {
          const configured = String(p.codexPath ?? state.settings.codexPath).trim();
          const source = p.codexSource || (configured ? "custom" : "auto");
          if (source === "custom") await this.runtimeResolver({ configured, source, refresh: true });
          changes.codexPath = source === "custom" ? configured : "";
          changes.codexSource = source;
        }
        if (connectionChange) {
          if (this.desktopHandoffs.size || state.sessions.some((s) => s.busy || s.queued))
            throw new Error("请在当前任务完成后保存全局设置。");
          const options = connectionOptions(state, {
            providerId: p.defaultProvider ?? state.settings.defaultProvider,
            model: p.defaultModel ?? state.settings.defaultModel,
            effort: p.defaultEffort ?? state.settings.defaultEffort,
            permission: p.defaultPermission ?? state.settings.defaultPermission,
          });
          Object.assign(changes, {
            defaultProvider: options.providerId,
            defaultModel: options.model,
            defaultEffort: options.effort,
            defaultPermission: options.permission,
          });
        }
        const runtimeChanged = ["codexSource", "codexPath"].some((key) => Object.hasOwn(changes, key) && changes[key] !== state.settings[key]);
        Object.assign(state.settings, changes);
        if (runtimeChanged) {
          for (const { client } of this.clients.values()) client.close();
          this.clients.clear();
        }
        await this.store.save();
        this.changed();
        return this.store.snapshot();
      }
      case "provider.save": {
        const existing = state.providers.find((x) => x.id === p.id);
        if (existing?.type === "local")
          throw new Error("本机 Codex 使用现有配置。");
        if (
          existing &&
          state.sessions.some((s) => s.providerId === existing.id && (s.busy || s.queued))
        )
          throw new Error("此服务还有正在运行的任务。");
        const name = String(p.name || "").trim();
        if (!name) throw new Error("请输入服务名称。");
        const models = [
          ...new Set(
            (Array.isArray(p.models) ? p.models : [])
              .map(String)
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ];
        if (!["responses", "chat-completions"].includes(p.protocol))
          throw new Error("请选择 API 协议。");
        const provider = {
          id: existing?.id || randomUUID(),
          name,
          type: "custom",
          baseUrl: validateBaseUrl(p.baseUrl),
          protocol: p.protocol,
          apiKey: p.clearKey ? "" : String(p.apiKey || existing?.apiKey || ""),
          models,
          reasoningParameter:
            p.reasoningParameter === "omit" ? "omit" : "effort",
        };
        if (existing) Object.assign(existing, provider);
        else state.providers.push(provider);
        await this.store.save();
        this.changed();
        return { providerId: provider.id, state: this.store.snapshot() };
      }
      case "provider.remove": {
        if (p.id === "local") throw new Error("不能移除本机 Codex。");
        if (
          state.settings.defaultProvider === p.id ||
          state.accounts.some((a) => a.providerId === p.id) ||
          state.sessions.some((s) => s.providerId === p.id)
        )
          throw new Error(
            "服务仍被默认配置、会话或微信账户使用，请先调整它们的模型服务。",
          );
        state.providers = state.providers.filter((x) => x.id !== p.id);
        await this.store.save();
        this.changed();
        return this.store.snapshot();
      }
      case "models.list": {
        const profile = state.providers.find((x) => x.id === p.providerId);
        if (!profile) throw new Error("模型服务不存在。");
        return await this.readModels(profile);
      }
      case "provider.test": {
        const profile = state.providers.find((x) => x.id === p.id);
        if (!profile) throw new Error("请先保存服务。");
        const start = Date.now();
        const models = await this.readModels(profile);
        return {
          models,
          latency: Date.now() - start,
          message: `模型列表连接成功，发现 ${models.length} 个模型。`,
        };
      }
      case "wechat.status":
        return this.bridge.status();
      case "wechat.login":
        return await this.bridge.startLogin({
          ...connectionOptions(state, p),
          workspace: p.workspace,
          name: String(p.name || "").trim(),
        });
      case "wechat.cancel":
        return this.bridge.cancelLogin();
      case "wechat.verify":
        return this.bridge.verify(p.code);
      case "wechat.update":
        return await this.bridge.update(p.id, {
          ...connectionOptions(state, p),
          name:
            String(p.name || "").trim() || this.bridge.getAccount(p.id).name,
          workspace: p.workspace,
          paused: Boolean(p.paused),
          allowedSenders: Array.isArray(p.allowedSenders) ? [...new Set(p.allowedSenders.map(String).map((s) => s.trim()).filter(Boolean))] : this.bridge.getAccount(p.id).allowedSenders || [],
        });
      case "wechat.disconnect":
        return await this.bridge.disconnect(p.id);
      default:
        throw new Error(`未知操作：${method}`);
    }
  }
  async close() {
    this.closing = true;
    clearInterval(this.idleTimer);
    await this.bridge.close();
    await Promise.allSettled([...this.desktopHandoffs.values()]);
    for (const { client } of this.clients.values()) {
      await client.interrupt().catch(() => {});
      client.close();
    }
    await Promise.allSettled([...this.fileOperations]);
    await this.store.save();
  }
}
