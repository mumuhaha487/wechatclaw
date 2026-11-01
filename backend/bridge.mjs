import { createHash, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import path from "node:path";
import { normalizeWeixinMessage } from "./wechat-messages.mjs";
import { downloadInboundAttachments, prepareLocalMedia } from "./wechat-media.mjs";
import { parseActionBlocksSafe } from "./wechat-actions.mjs";
import { buildPrompt, buildPromptPreview } from "./wechat-format.mjs";
import { PromptBuffer } from "./wechat-buffer.mjs";
import { commandOf, urgentCommand, handleCommand } from "./wechat-commands.mjs";
import {
  WeChatApi,
  API_BASE,
  splitText,
  trustedApiBase,
} from "./wechat.mjs";
import { safeError, workspacePath } from "./store.mjs";
import { planWeChatResult, cleanWeChatResult } from "./wechat-results.mjs";
import { sameWorkspace, workspaceKey } from "../shared/workspace.mjs";

export const PROGRESS_LIMIT = 6;
export const REPLY_LIMIT = 10;
export const PROGRESS_LIMIT_NOTICE = "后续推送将进行省略。任务完成之后，会将结果汇报。请耐心等待。";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const messageKey = (message) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        message.from_user_id,
        message.message_id || message.client_id || message.seq || message,
      ]),
    )
    .digest("hex");

export class WeChatBridge {
  constructor({ store, run, newSession, emit, stop = async () => {}, listModels = async () => [], runtime = async () => ({}), api = new WeChatApi() }) {
    Object.assign(this, { store, run, newSession, emit, api, stop, listModels, runtime });
    this.running = true;
    this.workers = new Map();
    this.busy = new Set();
    this.typing = new Map();
    this.pollErrors = new Map();
    this.confirmations = new Map();
    this.login = null;
    this.buffers = new PromptBuffer({ maxItems: 50, ttlMs: 10 * 60 * 1000 });
  }
  async init() {
    for (const account of this.store.state.accounts) {
      account.contexts ||= {};
      account.senderSessions ||= {};
      account.allowedSenders ||= [];
      account.allowedWorkspaces ||= [account.workspace];
      for (const [senderId, sessionId] of Object.entries({ ...account.senderSessions, [account.user]: account.sessionId })) {
        const active = this.store.state.sessions.find((s) => s.id === sessionId);
        if (active && (!active.accountId || active.accountId === account.id))
          Object.assign(active, { accountId: account.id, senderId });
      }
      for (const session of this.store.state.sessions) {
        if (session.accountId || session.source !== "wechat" || session.title !== `${account.name} · 微信`) continue;
        const matches = this.store.state.accounts.filter((a) => a.name === account.name && sameWorkspace(a.workspace, session.workspace));
        if (matches.length === 1 && matches[0] === account)
          Object.assign(session, { accountId: account.id, senderId: account.user });
      }
      for (const item of account.pending) {
        if (item.running && !item.chunks) {
          const reply = this.store.state.sessions
            .find((s) => s.id === (item.sessionId || account.sessionId))
            ?.messages.find(
              (m) => m.taskKey === item.key && m.role === "assistant" && m.kind !== "progress",
            );
          item.chunks = splitText(
            reply?.text || (reply?.attachments?.length ? "" :
              "上次任务随应用关闭而中断，可能已修改部分文件。请检查目录后再发送下一步指令。"),
          );
          item.media = (reply?.attachments || []).map((a) => ({ type: a.type, path: a.path }));
        }
      }
      this.startWorker(account);
    }
    await this.store.save();
  }
  changed() {
    this.emit("state", this.store.snapshot());
  }
  status() {
    const login = this.login;
    return {
      login: login
        ? {
            id: login.id,
            status: login.status,
            qr: login.qr,
            error: login.error || "",
            workspace: login.workspace,
          }
        : null,
      busyAccounts: this.store.state.accounts.filter((account) => this.accountBusy(account)).map((account) => account.id),
    };
  }
  async startLogin(options) {
    if (this.creatingLogin) return this.creatingLogin;
    if (
      this.login &&
      ![
        "expired",
        "error",
        "verify_code_blocked",
        "confirmed",
        "cancelled",
      ].includes(this.login.status)
    )
      return this.status();
    this.creatingLogin = this.createLogin(options).finally(() => {
      this.creatingLogin = null;
    });
    return this.creatingLogin;
  }
  async createLogin(options) {
    const workspace = await workspacePath(options.workspace);
    const result = await this.api.qr(
      this.store.state.accounts.filter((a) => !a.expired).map((a) => a.token),
    );
    if (!result.qrcode || !result.qrcode_img_content)
      throw new Error("微信未返回登录二维码，请稍后重试。");
    const qr = await QRCode.toDataURL(result.qrcode_img_content, {
      width: 320,
      margin: 2,
    });
    const login = (this.login = {
      ...options,
      workspace,
      id: randomUUID(),
      qrcode: result.qrcode,
      qr,
      status: "wait",
      created: Date.now(),
      base: API_BASE,
    });
    this.emit("wechat", this.status());
    this.loginLoop(login).catch((error) => {
      if (this.login !== login) return;
      login.status = "error";
      login.error = safeError(error);
      this.emit("wechat", this.status());
    });
    return this.status();
  }
  cancelLogin() {
    this.login = null;
    this.emit("wechat", this.status());
    return this.status();
  }
  verify(code) {
    if (this.login?.status !== "need_verifycode")
      throw new Error("当前不需要验证码。");
    if (!/^\d{4,12}$/.test(code))
      throw new Error("请输入微信显示的数字验证码。");
    this.login.verifyCode = code;
    return { ok: true };
  }
  async loginLoop(login) {
    while (
      this.running &&
      this.login === login &&
      Date.now() - login.created < 300000
    ) {
      if (login.status === "need_verifycode" && !login.verifyCode) {
        await wait(400);
        continue;
      }
      let result;
      try {
        result = await this.api.qrStatus(
          login.qrcode,
          login.base,
          login.verifyCode,
        );
      } catch (error) {
        login.error = safeError(error);
        this.emit("wechat", this.status());
        await wait(2000);
        continue;
      }
      if (this.login !== login || !this.running) return;
      login.error = "";
      login.status = result.status;
      if (result.status === "scaned_but_redirect" && result.redirect_host)
        login.base = trustedApiBase(result.redirect_host);
      if (result.status === "need_verifycode") login.verifyCode = null;
      this.emit("wechat", this.status());
      if (["expired", "verify_code_blocked"].includes(result.status)) return;
      if (result.status === "binded_redirect")
        throw new Error("此连接已绑定其他实例，请在微信解除后重试。");
      if (result.status === "confirmed") {
        if (!result.bot_token || !result.ilink_user_id || !result.ilink_bot_id)
          throw new Error("微信未返回完整账号信息。");
        const existing = this.store.state.accounts.find(
          (a) =>
            a.bot === result.ilink_bot_id || a.user === result.ilink_user_id,
        );
        if (existing && this.accountBusy(existing))
          throw new Error("此账户仍有运行中的任务，请完成后重新连接。");
        const sameConfiguration =
          existing &&
          ["workspace", "providerId", "model", "effort", "permission"].every(
            (key) => key === "workspace" ? sameWorkspace(existing[key], login[key]) : (existing[key] || "") === (login[key] || ""),
          );
        if (existing?.pending.length && !sameConfiguration)
          throw new Error(
            "此账户有待回复消息，请使用原目录与模型重新连接，或先断开以清除队列。",
          );
        const retained = (this.store.state.retainedAccounts || []).find((a) => a.user === result.ilink_user_id);
        const account = existing || {
          id: retained?.id || randomUUID(),
          pending: [],
          seen: [],
          cursor: "",
        };
        if (!existing) this.store.state.accounts.push(account);
        this.store.state.retainedAccounts = (this.store.state.retainedAccounts || []).filter((a) => a.id !== account.id);
        Object.assign(account, {
          token: result.bot_token,
          user: result.ilink_user_id,
          bot: result.ilink_bot_id,
          base: trustedApiBase(result.baseurl || login.base),
          name:
            login.name ||
            existing?.name ||
            `微信账户 ${this.store.state.accounts.length}`,
          workspace: login.workspace,
          providerId: login.providerId,
          model: login.model || "",
          effort: login.effort || "",
          permission: login.permission || "workspace-write",
          paused: false,
          expired: false,
          error: "",
        });
        account.allowedSenders ||= [];
        account.contexts ||= {};
        account.senderSessions ||= {};
        account.allowedWorkspaces ||= [account.workspace];
        if (!sameConfiguration) account.senderSessions = {};
        if (!sameConfiguration || !account.sessionId)
          this.createSession(account, account.user, account);
        else this.sessionFor(account, account.user);
        await this.store.save();
        this.startWorker(account);
        this.login = null;
        this.changed();
        this.emit("wechat", this.status());
        return;
      }
      await wait(800);
    }
    if (this.login === login) {
      login.status = "expired";
      this.emit("wechat", this.status());
    }
  }
  getAccount(id) {
    const account = this.store.state.accounts.find((a) => a.id === id);
    if (!account) throw new Error("微信账户不存在。");
    return account;
  }
  accountSessionIds(account) {
    return new Set([account.sessionId, ...Object.values(account.senderSessions || {}),
      ...(account.pending || []).map((item) => item.sessionId)].filter(Boolean));
  }
  accountBusy(account) {
    if (this.busy.has(account.id)) return true;
    const ids = this.accountSessionIds(account);
    return this.store.state.sessions.some((session) =>
      (session.accountId === account.id || ids.has(session.id)) && (session.busy || session.queued));
  }
  sessionFor(account, sender) {
    const id = sender === account.user ? account.sessionId : account.senderSessions?.[sender];
    const session = this.store.state.sessions.find((s) => s.id === id);
    if (session && (!session.accountId || session.accountId === account.id) && (!session.senderId || session.senderId === sender)) {
      Object.assign(session, { accountId: account.id, senderId: sender });
      return session;
    }
    return this.createSession(account, sender, account);
  }
  createSession(account, sender, options) {
    const session = this.newSession({ ...options, accountId: account.id, senderId: sender,
      source: "wechat", title: `${account.name} · 微信` });
    Object.assign(session, { accountId: account.id, senderId: sender });
    this.activateSession(account, sender, session);
    return session;
  }
  activateSession(account, sender, session) {
    account.senderSessions ||= {};
    if (sender === account.user) {
      account.sessionId = session.id;
      account.workspace = session.workspace;
    } else account.senderSessions[sender] = session.id;
  }
  context(account, message) {
    return account.contexts?.[message.from_user_id] || message.context_token;
  }
  replyBudget(account, message) {
    account.replyBudgets ||= {};
    const sender = message.from_user_id, context = this.context(account, message);
    let budget = account.replyBudgets[sender];
    if (!budget || budget.context !== context)
      budget = account.replyBudgets[sender] = { context, ids: [] };
    return budget;
  }
  replySlots(account, message) {
    return Math.max(0, REPLY_LIMIT - this.replyBudget(account, message).ids.length);
  }
  waitingForContext(account, item) {
    return item.waitingForContext && item.waitingForContext === this.context(account, item.message);
  }
  async sendReply(account, item, clientId, content, media = false) {
    const budget = this.replyBudget(account, item.message);
    if (!budget.ids.includes(clientId)) {
      if (budget.ids.length >= REPLY_LIMIT) {
        item.waitingForContext = budget.context;
        account.error = "微信推送额度已用完，请在微信再发一条消息，剩余结果和附件将继续发送。";
        this.pollErrors.delete(account.id);
        await this.store.save();
        this.changed();
        return false;
      }
      // Reserve before the network call, including ambiguous failures. Retrying
      // the same client ID reuses this slot, also after a restart.
      budget.ids.push(clientId);
      await this.store.save();
    }
    await this.api[media ? "sendMedia" : "send"](account, item.message.from_user_id,
      budget.context, content, clientId);
    delete item.waitingForContext;
    return true;
  }
  async update(id, changes) {
    const account = this.getAccount(id);
    if (this.accountBusy(account) || account.pending.length)
      throw new Error("账户还有运行中或待回复的消息，完成后再修改。");
    const previous = [
      workspaceKey(account.workspace),
      account.providerId,
      account.model,
      account.effort,
      account.permission,
    ].join("|");
    const workspace = await workspacePath(
      changes.workspace || account.workspace,
    );
    Object.assign(account, changes, { workspace });
    const next = [
      workspaceKey(account.workspace),
      account.providerId,
      account.model,
      account.effort,
      account.permission,
    ].join("|");
    if (previous !== next) {
      account.senderSessions = {};
      this.createSession(account, account.user, account);
    }
    account.allowedWorkspaces = [...new Set([...(account.allowedWorkspaces || []), workspace])];
    await this.store.save();
    this.changed();
    return this.store.snapshot();
  }
  async disconnect(id) {
    const account = this.getAccount(id);
    if (this.accountBusy(account))
      throw new Error("账户仍有运行中的任务，请完成后再断开。");
    this.store.state.accounts = this.store.state.accounts.filter(
      (a) => a !== account,
    );
    // Keep only the stable identity, never the login token or reply contexts.
    this.store.state.retainedAccounts ||= [];
    this.store.state.retainedAccounts = this.store.state.retainedAccounts.filter((a) => a.user !== account.user);
    this.store.state.retainedAccounts.push({ id: account.id, user: account.user });
    await this.store.save();
    this.changed();
    return this.store.snapshot();
  }
  async ingest(account, response) {
    if (
      !this.store.state.accounts.includes(account) ||
      account.paused ||
      account.expired
    )
      return;
    const known = new Set([
      ...account.seen,
      ...account.pending.map((m) => m.key),
    ]);
    account.contexts ||= {};
    const messages = response.msgs ?? response.message_list ?? response.messages ?? [];
    if (!Array.isArray(messages)) throw new Error("微信消息列表格式无效。");
    for (const raw of messages) {
      const normalized = normalizeWeixinMessage(raw);
      if (!normalized) continue;
      const message = { ...raw, from_user_id: normalized.senderId };
      if (
        (message.message_type != null && message.message_type !== 1) ||
        (message.from_user_id !== account.user && !account.allowedSenders?.includes(message.from_user_id)) ||
        message.group_id ||
        !message.context_token
      )
        continue;
      const key = messageKey(message);
      if (known.has(key)) continue;
      known.add(key);
      account.contexts[message.from_user_id] = message.context_token;
      account.pending.push({ key, message, sent: 0 });
      account.lastReceivedAt = new Date().toISOString();
    }
    const cursor = response.get_updates_buf ?? response.next_sync_key ?? response.sync_key;
    if (typeof cursor === "string") account.cursor = cursor;
    await this.store.save();
    this.changed();
  }
  async promptItems(account, item) {
    if (item.promptItems) return item.promptItems;
    const message = normalizeWeixinMessage(item.message);
    const items = message.text ? [{ kind: "text", text: message.text }] : [];
    if (message.attachments.length) {
      const downloaded = await downloadInboundAttachments({
        rootDir: path.join(this.store.directory, "inbound", account.id),
        senderId: message.senderId, messageId: item.key,
        attachments: message.attachments, maxBytes: 100 * 1024 * 1024,
        fetch: this.api.fetch,
      });
      items.push(...downloaded);
    }
    item.promptItems = items;
    await this.store.save();
    return items;
  }
  async progress(account, item, text) {
    const session = this.store.state.sessions.find((s) => s.id === item.sessionId);
    text = String(text || "").trim();
    if (!this.running || session?.streamReplies === false || !text) return;
    if (item.progressSuppressed) return this.flushProgress(account, item);
    const parsed = parseActionBlocksSafe(text);
    if (parsed.discarded) parsed.visibleText += `${parsed.visibleText ? "\n" : ""}（附件指令无法解析，相关文件未发送。）`;
    if (!parsed.visibleText) return;
    item.progressReports ||= [];
    const key = createHash("sha256").update(parsed.visibleText).digest("hex");
    const queued = item.progressReports.reduce((count, report) => count + report.chunks.length, 0);
    if (queued < PROGRESS_LIMIT && !item.progressReports.some((report) => report.key === key))
      item.progressReports.push({ key, chunks: splitText(parsed.visibleText, 1700).slice(0, PROGRESS_LIMIT - queued), sent: 0 });
    await this.store.save();
    await this.flushProgress(account, item);
  }
  async requestApproval(sessionId, taskKey, request, respond) {
    const account = this.store.state.accounts.find(value => value.pending.some(item => item.key === taskKey && item.sessionId === sessionId && item.running));
    const item = account?.pending.find(value => value.key === taskKey && value.sessionId === sessionId && value.running);
    if (!account || !item || !this.running || this.confirmations.has(`${sessionId}:${request.requestId}`)) return;
    const code = randomUUID().replaceAll("-", "").slice(0, 8);
    const record = { sessionId, requestId: request.requestId, accountId: account.id, senderId: item.message.from_user_id,
      code, consent: request.consent ?? null, kind: request.kind, respond,
      summary: [request.params.reason, request.params.command].filter(Boolean).join("\n").slice(0, 1000) };
    this.confirmations.set(`${sessionId}:${request.requestId}`, record);
    const simple = request.kind !== "form" || record.consent !== null;
    const notice = ["【需要确认】", String(request.params.reason || "Codex 请求确认操作。").slice(0, 900),
      request.params.command ? String(request.params.command).slice(0, 500) : "",
      simple ? `允许本次：/allow ${code}\n拒绝：/deny ${code}` : `此确认需要填写表单，请在 QQClaw 中填写。\n拒绝：/deny ${code}`].filter(Boolean).join("\n");
    // A consent request is a real reply, too. Preserve two result slots and
    // bundle the final answer/files when needed. /status can show the pending
    // consent using a fresh user-message context if the old context is full.
    if (this.replySlots(account, item.message) <= 2) return;
    await this.sendReply(account, item, `qc-a-${item.key.slice(0, 16)}-${code}`, notice);
    await this.store.save();
  }
  dismissApproval(sessionId, requestId) {
    this.confirmations.delete(`${sessionId}:${requestId}`);
  }
  pendingApprovals(accountId, senderId) {
    return [...this.confirmations.values()].filter(value => value.accountId === accountId && value.senderId === senderId);
  }
  async respondApproval(account, senderId, code, allow) {
    const record = this.pendingApprovals(account.id, senderId).find(value => value.code === String(code).toLowerCase());
    if (!record) return "确认编号无效或已结束，请发送 /status 查看当前状态。";
    if (allow && record.kind === "form" && record.consent === null) return "这项确认需要填写内容，请在 QQClaw 中完成；微信可以使用 /deny 拒绝。";
    try { await record.respond(allow, allow ? record.consent ?? undefined : undefined); }
    catch (error) { this.confirmations.delete(`${record.sessionId}:${record.requestId}`); throw error; }
    this.confirmations.delete(`${record.sessionId}:${record.requestId}`);
    return allow ? "已允许本次操作，任务将继续。" : "已拒绝本次操作。";
  }
  async flushProgress(account, item) {
    const session = this.store.state.sessions.find((s) => s.id === item.sessionId);
    if (session?.streamReplies === false) return;
    let count = (item.progressReports || []).reduce((total, report) => total + report.sent, 0);
    const noticeId = `qc-p-limit-${item.key.slice(0, 32)}`;
    const notifyLimit = async () => {
      if (!this.running || item.progressNoticeSent) return;
      // Always leave three slots for the result. Other urgent command replies
      // may already have consumed slots in the latest sender context.
      if (this.replySlots(account, item.message) <= 3 && !this.replyBudget(account, item.message).ids.includes(noticeId)) return;
      if (await this.sendReply(account, item, noticeId, PROGRESS_LIMIT_NOTICE)) {
        item.progressNoticeSent = true;
        await this.store.save();
      }
    };
    if (count >= PROGRESS_LIMIT || item.progressSuppressed) {
      item.progressSuppressed = true;
      await notifyLimit();
      return;
    }
    for (const report of item.progressReports || []) {
      while (this.running && report.sent < report.chunks.length) {
        const id = `qc-p-${item.key.slice(0, 20)}-${report.key.slice(0, 12)}-${report.sent}`;
        if (count >= PROGRESS_LIMIT || (this.replySlots(account, item.message) <= 4 && !this.replyBudget(account, item.message).ids.includes(id))) {
          item.progressSuppressed = true;
          await this.store.save();
          await notifyLimit();
          return;
        }
        if (!await this.sendReply(account, item, id, `【进度】${report.chunks[report.sent]}`)) return;
        report.sent++;
        count++;
        if (count >= PROGRESS_LIMIT) item.progressSuppressed = true;
        await this.store.save();
        if (item.progressSuppressed) { await notifyLimit(); return; }
      }
    }
  }
  async processNext(account, item = account.pending[0], urgent = false) {
    if (!item) return;
    if (!urgent) { this.busy.add(account.id); this.emit("wechat", this.status()); }
    const stopTyping = urgent ? async () => {} : this.startTyping(account, item.message);
    try {
      if (!item.chunks) {
        let reply;
        try {
          const command = commandOf(item.message);
          if (command && !item.promptItems) reply = await handleCommand(this, account, item, command);
          else reply = null;
          if (reply === null) {
            const normalized = normalizeWeixinMessage(item.message);
            if (!item.promptItems && !normalized.attachments.length)
              item.promptItems = normalized.text ? [{ kind: "text", text: normalized.text }] : [];
            const inputs = item.promptItems || await this.promptItems(account, item);
            const bufferKey = `${account.id}:${item.message.from_user_id}`;
            if (!command && this.buffers.isActive(bufferKey)) {
              for (const input of inputs) this.buffers.append(bufferKey, input);
              reply = "已加入合并内容，发送 /prompt done 提交。";
            } else if (!inputs.length) reply = "这条消息没有可处理的内容，请发送文字、图片、视频或文件。";
            else {
              const session = this.sessionFor(account, item.message.from_user_id);
              item.sessionId = session.id;
              item.running = true;
              const saved = this.store.save();
              reply = await this.run(session.id, buildPrompt("", inputs), item.key, saved, {
                displayText: buildPromptPreview("", inputs, 120000) || "附件",
                attachments: inputs.filter((input) => input.kind !== "text"),
                onProgress: (text) => this.progress(account, item, text),
              });
            }
          }
          const parsed = parseActionBlocksSafe(String(reply || ""));
          if (parsed.discarded) parsed.visibleText += `${parsed.visibleText ? "\n" : ""}（附件指令无法解析，相关文件未发送。）`;
          item.chunks = splitText(parsed.visibleText);
          item.media = parsed.actions.send;
        } catch (error) {
          item.chunks = splitText(`处理未完成：${safeError(error, [account.token, ...this.store.state.providers.map((p) => p.apiKey)])}`);
          item.media = [];
        }
        await this.store.save();
        this.changed();
      }
      // Delivery failures retry this outbox without executing the Codex turn again.
      await this.flushProgress(account, item);
      if (!item.resultPrepared) {
        // Do not alter an outbox that an older version has already partially sent.
        if (!item.sent && !(item.media || []).some((media) => media.sent || media.receipt)) {
          const plan = await planWeChatResult({ root: this.store.directory, accountId: account.id,
            taskKey: item.key, chunks: item.chunks, media: item.media || [],
            slots: Math.max(1, this.replySlots(account, item.message)) });
          Object.assign(item, plan);
        }
        item.resultPrepared = true;
        await this.store.save();
      }
      while (this.running && item.sent < item.chunks.length) {
        if (!await this.sendReply(account, item, `qc-${item.key.slice(0, 32)}-${item.sent}`, item.chunks[item.sent])) return;
        item.sent++;
        await this.store.save();
      }
      for (const [index, media] of (item.media || []).entries()) {
        if (!this.running) return;
        if (media.sent) continue;
        const clientId = `qc-m-${item.key.slice(0, 30)}-${index}`;
        if (!this.replySlots(account, item.message) && !this.replyBudget(account, item.message).ids.includes(clientId)) {
          await this.sendReply(account, item, clientId, "");
          return;
        }
        if (!media.receipt && !media.error) {
          try {
            media.receipt = await prepareLocalMedia({
              client: { getUploadUrl: (input) => this.api.upload(account, input) },
              toUserId: item.message.from_user_id, filePath: media.path, kind: media.type,
              fetch: this.api.fetch,
            });
          } catch (error) {
            if (!["ENOENT", "EACCES", "EISDIR"].includes(error.code) && !/不是文件|100 MiB/.test(error.message)) throw error;
            media.error = `附件发送失败：${path.basename(media.path)}；${safeError(error)}`;
          }
          await this.store.save();
        }
        if (!await this.sendReply(account, item, clientId, media.error || media.receipt, !media.error)) return;
        media.sent = true;
        await this.store.save();
      }
      if (!this.running) return;
      account.pending = account.pending.filter((pending) => pending !== item);
      account.seen = [...account.seen, item.key].slice(-2000);
      account.lastRepliedAt = new Date().toISOString();
      account.error = "";
      this.pollErrors.delete(account.id);
      await this.store.save();
      this.changed();
      if (item.bundled) await cleanWeChatResult(this.store.directory, account.id, item.key).catch(() => {});
    } finally {
      await stopTyping();
      if (!urgent) { this.busy.delete(account.id); this.emit("wechat", this.status()); }
    }
  }
  startTyping(account, message) {
    let stopped = false, ticket = "", inFlight;
    const user = message.from_user_id;
    const pulse = () => {
      if (stopped || inFlight || !this.running) return;
      inFlight = (async () => {
        try {
          ticket = (await this.api.config(account, user, this.context(account, message))).typing_ticket || "";
          if (ticket && !stopped && this.running)
            await this.api.typing(account, user, ticket, 1);
        } catch {
          // Typing is optional: a failed status request must never lose a reply.
          ticket = "";
        }
      })().finally(() => { inFlight = null; });
    };
    const timer = setInterval(pulse, 5000);
    timer.unref?.();
    let stopping;
    const stop = () => stopping ||= (async () => {
      stopped = true;
      clearInterval(timer);
      await inFlight;
      if (ticket) await this.api.typing(account, user, ticket, 2).catch(() => {});
      if (this.typing.get(account.id) === stop) this.typing.delete(account.id);
    })();
    this.typing.set(account.id, stop);
    pulse();
    return stop;
  }
  startWorker(account) {
    if (this.workers.has(account.id)) return;
    const worker = Promise.all([this.pollLoop(account), this.deliveryLoop(account)]).finally(() => {
      this.workers.delete(account.id);
      const current = this.store.state.accounts.find(
        (a) => a.id === account.id,
      );
      if (this.running && current && current !== account)
        this.startWorker(current);
    });
    this.workers.set(account.id, worker);
  }
  async pollLoop(account) {
    let failures = 0;
    while (this.running && this.store.state.accounts.includes(account)) {
      if (account.paused || account.expired) {
        await wait(1000);
        continue;
      }
      let polling = true;
      try {
        const result = await this.api.updates(account, account.cursor);
        polling = false;
        if (!this.running) return;
        if (this.pollErrors.get(account.id) === account.error && account.error) {
          account.error = "";
          this.pollErrors.delete(account.id);
          await this.store.save();
          this.changed();
        }
        await this.ingest(account, result);
        // Keep receiving while Codex runs so /stop and progress controls work.
        for (const item of account.pending.filter((item) => urgentCommand(item.message) && !this.waitingForContext(account, item)))
          await this.processNext(account, item, true);
        if (!(result.msgs ?? result.messages ?? result.message_list)?.length) await wait(300);
        failures = 0;
      } catch (error) {
        account.error = safeError(error, [account.token]);
        if (polling) this.pollErrors.set(account.id, account.error);
        else this.pollErrors.delete(account.id);
        if (error.code === -14) account.expired = true;
        await this.store.save();
        this.changed();
        await wait(Math.min(30000, 1000 * 2 ** Math.min(++failures, 5)));
      }
    }
  }
  async deliveryLoop(account) {
    let failures = 0;
    while (this.running && this.store.state.accounts.includes(account)) {
      if (account.paused || account.expired) { await wait(500); continue; }
      const item = account.pending.find((item) => !urgentCommand(item.message) && !this.waitingForContext(account, item));
      if (!item) { await wait(200); continue; }
      try {
        await this.processNext(account, item);
        failures = 0;
      } catch (error) {
        this.pollErrors.delete(account.id);
        account.error = error.ret === -2 || error.code === -2
          ? "微信回复上下文已过期，请在微信发送一条新消息，待回复内容会继续投递。"
          : safeError(error, [account.token]);
        if (error.code === -14) account.expired = true;
        await this.store.save();
        this.changed();
        await wait(Math.min(30000, 1000 * 2 ** Math.min(++failures, 5)));
      }
    }
  }
  close() {
    this.running = false;
    this.login = null;
    this.confirmations.clear();
    return Promise.all([...this.typing.values()].map((stop) => stop()));
  }
}
