// Commands follow codex-weixin's BridgeService (MIT); see CODEX-WEIXIN-LICENSE.
import path from "node:path";
import { workspacePath } from "./store.mjs";
import { normalizeWeixinMessage } from "./wechat-messages.mjs";

export const helpText = [
  "QQClaw 微信命令：",
  "/help 或 /h · 查看帮助",
  "/status 或 /where · 当前目录、会话与模型",
  "/bind <绝对路径> · 绑定电脑上的工作目录",
  "/new · 新建会话",
  "/resume [R编号] · 查看或继续历史会话",
  "/model [序号|模型ID|default] · 查看或切换模型",
  "/effort [序号|等级|default] · 查看或切换思考等级",
  "/stream [on|off|default] · 过程进度开关（默认开）",
  "/prompt start · 合并接下来的多条文字、图片与附件",
  "/prompt done · 提交合并内容",
  "/prompt cancel · 取消合并",
  "/stop · 停止当前会话任务",
  "/allow <确认编号> · 允许本次网站访问或操作",
  "/deny <确认编号> · 拒绝本次确认",
  "支持图片、视频、文件及语音转写；生成的本地文件以微信附件发送。",
].join("\n");

export function commandOf(raw) {
  const text = normalizeWeixinMessage(raw)?.text || "";
  const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match && { name: match[1].toLowerCase(), arg: (match[2] || "").trim() };
}
export const urgentCommand = (raw) => Boolean(commandOf(raw));

export async function handleCommand(bridge, account, item, command) {
  const sender = item.message.from_user_id;
  const session = bridge.sessionFor(account, sender);
  const { name, arg } = command;
  const bufferKey = `${account.id}:${sender}`;
  const state = bridge.store.state;
  switch (name) {
    case "help": case "h": return helpText;
    case "status": case "where": {
      const runtime = await bridge.runtime(session).catch(() => ({}));
      return ["QQClaw 已连接", `用户：${sender}`, `会话：${session.title}`,
        `工作目录：${session.workspace}`, `模型：${session.model || runtime.model || "本机默认"}`,
        `思考等级：${session.effort || runtime.effort || "默认"}`,
        `权限：${session.permission === "read-only" ? "只读" : session.permission === "ask" ? "按需确认（可在微信处理）" : "自动执行"}`,
        `过程进度：${session.streamReplies !== false ? "开启" : "关闭"}`,
        `状态：${session.busy ? "运行中" : session.queued ? "排队中" : "空闲"}`,
        ...(bridge.pendingApprovals?.(account.id, sender) || []).map(record => `等待确认：${record.summary}\n/allow ${record.code} 允许，/deny ${record.code} 拒绝。`),
        "/help 查看命令"].join("\n");
    }
    case "allow": case "deny":
      if (!/^[a-f0-9]{8}$/i.test(arg)) return `用法：/${name} <8位确认编号>`;
      return bridge.respondApproval(account, sender, arg, name === "allow");
    case "stop":
      await bridge.stop(session.id);
      return "已请求停止当前会话任务。";
    case "new": {
      const next = bridge.createSession(account, sender, session);
      return `已开始新的 Codex 会话。\n工作目录：${next.workspace}`;
    }
    case "bind": {
      const value = arg.replace(/^(["'])(.*)\1$/, "$2");
      if (!path.isAbsolute(value)) return "用法：/bind <绝对工作目录路径>";
      const workspace = await workspacePath(value);
      account.defaultWorkspace ||= account.workspace;
      bridge.createSession(account, sender, { ...session, workspace });
      if (sender === account.user) account.workspace = workspace;
      return `已绑定工作目录并开始新会话：\n${workspace}`;
    }
    case "resume": {
      const sessions = state.sessions.filter((s) => s.accountId === account.id && s.senderId === sender)
        .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
      if (!arg) {
        account.resumeLists ||= {};
        account.resumeLists[sender] = sessions.map((s) => s.id);
        return ["历史会话（最近更新优先）：", ...sessions.map((s, i) => {
          const preview = [...s.messages].reverse().find((m) => m.role === "user")?.text?.replace(/\s+/g, " ").slice(0, 100) || "尚未开始对话";
          return `[R${i + 1}] ${s.id === session.id ? "【当前】" : ""}${s.title}\n   最近内容：${preview}`;
        }), "发送 /resume R1 继续相应会话。"].join("\n");
      }
      const match = /^r([1-9]\d*)$/i.exec(arg);
      if (!match) return "请使用 R 开头的切换编号，例如 /resume R1；/resume 查看列表。";
      const ids = account.resumeLists?.[sender] || sessions.map((s) => s.id);
      const selected = sessions.find((s) => s.id === ids[Number(match[1]) - 1]);
      if (!selected) return "没有这个切换编号，请发送 /resume 查看列表。";
      bridge.activateSession(account, sender, selected);
      return `已切换到：${selected.title}\n工作目录：${selected.workspace}\n下一条消息将继续该会话。`;
    }
    case "stream": {
      if (!arg) return `当前过程进度：${session.streamReplies !== false ? "开启" : "关闭"}。\n/stream on、off 或 default 切换。`;
      if (!["on", "off", "default"].includes(arg.toLowerCase())) return "用法：/stream on、/stream off 或 /stream default";
      if (arg.toLowerCase() === "default") delete session.streamReplies;
      else session.streamReplies = arg.toLowerCase() === "on";
      return `本会话过程进度已${session.streamReplies !== false ? "开启" : "关闭"}。`;
    }
    case "model": case "effort": {
      const models = !arg || /^\d+$/.test(arg) ? await bridge.listModels(session).catch(() => []) : [];
      const current = models.find((m) => m.model === session.model) || models.find((m) => m.isDefault);
      const advertised = current?.supportedReasoningEfforts?.map((e) => e.reasoningEffort) || [];
      const efforts = advertised.length ? advertised : ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
      if (!arg) return name === "model"
        ? [`当前模型：${session.model || current?.model || "本机默认"}`, ...models.map((m, i) => `${i + 1}. ${m.displayName || m.model}（${m.model}）`), "/model <序号或完整模型ID> 切换；/model default 恢复账户默认。"].join("\n")
        : [`当前思考等级：${session.effort || "默认"}`, ...efforts.map((e, i) => `${i + 1}. ${e}`), "/effort <序号或等级> 切换；/effort default 恢复账户默认。"].join("\n");
      if (arg.toLowerCase() === "default") {
        session[name] = account[name] || "";
        return `已恢复账户默认${name === "model" ? "模型" : "思考等级"}：${session[name] || "本机默认"}`;
      }
      if (name === "model") {
        const selected = /^\d+$/.test(arg) ? models[Number(arg) - 1] : models.find((m) => m.model === arg);
        // Third-party IDs remain usable even when a provider's /models omits them.
        const model = selected?.model || (!/^\d+$/.test(arg) && /^[a-z\d][a-z\d._:/@+-]*$/i.test(arg) ? arg : "");
        if (!model) return "模型序号无效，请发送 /model 查看列表。";
        session.model = model;
        const supported = selected?.supportedReasoningEfforts?.map((e) => e.reasoningEffort) || [];
        if (session.effort && supported.length && !supported.includes(session.effort))
          session.effort = selected.defaultReasoningEffort || supported[0];
        return `本会话模型已切换为：${model}\n思考等级：${session.effort || "默认"}\n下一条消息生效。`;
      }
      const effort = /^\d+$/.test(arg) ? efforts[Number(arg) - 1] : arg.toLowerCase();
      if (!effort || !/^[a-z][a-z\d_-]{0,31}$/i.test(effort) || (advertised.length && !efforts.includes(effort)))
        return "该模型不支持这个思考等级，请发送 /effort 查看选项。";
      session.effort = effort;
      return `本会话思考等级已切换为：${effort}\n下一条消息生效。`;
    }
    case "prompt": {
      switch (arg.toLowerCase()) {
        case "start":
          return bridge.buffers.start(bufferKey).status === "started" ? "已开始合并消息。发送文字、图片或文件后，用 /prompt done 提交。" : "正在合并消息，用 /prompt done 提交。";
        case "cancel": bridge.buffers.cancel(bufferKey); return "已取消合并消息。";
        case "done": {
          const result = bridge.buffers.done(bufferKey);
          if (!result.items.length) return "合并内容为空，请先 /prompt start。";
          item.promptItems = result.items;
          return null;
        }
        default: return "用法：/prompt start、/prompt done 或 /prompt cancel";
      }
    }
    default: return `未知命令：/${name}，发送 /help 查看帮助。`;
  }
}
