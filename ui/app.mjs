import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { icon } from "./icons.mjs";
import {
  enhancePickers,
  refreshPickers,
  closePicker,
  configurePickers,
} from "./controls.mjs";
import { ModelCatalog } from "./model-catalog.mjs";
import { sameWorkspace, workspaceKey } from "../shared/workspace.mjs";

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const md = new MarkdownIt({ html: false, breaks: true, linkify: true });
// The renderer and sanitizer configuration is fixed; only the text affects HTML.
const renderMarkdown = (value) => DOMPurify.sanitize(md.render(value), {
  FORBID_TAGS: ["img", "iframe", "form", "style"],
  FORBID_ATTR: ["style"],
});
const markdownCache = new Map();
const maximumMarkdownCharacters = 6000000;
let markdownCharacters = 0;
const evictMarkdown = (value) => {
  markdownCharacters -= value.length + markdownCache.get(value).length;
  markdownCache.delete(value);
};
const markdown = (value) => {
  if (markdownCache.has(value)) {
    const html = markdownCache.get(value);
    markdownCache.delete(value);
    markdownCache.set(value, html);
    return html;
  }
  const html = renderMarkdown(value);
  const characters = value.length + html.length;
  // A single oversized reply must not flush the entire history cache.
  if (characters > maximumMarkdownCharacters) return html;
  markdownCache.set(value, html);
  markdownCharacters += characters;
  if (markdownCache.size > 500) evictMarkdown(markdownCache.keys().next().value);
  while (markdownCharacters > maximumMarkdownCharacters) {
    // Prefer the largest entry in the oldest 10%, preserving recent history.
    let victim, largest = -1, remaining = Math.ceil(markdownCache.size / 10);
    for (const [text, rendered] of markdownCache) {
      const size = text.length + rendered.length;
      if (size > largest) { victim = text; largest = size; }
      if (--remaining === 0) break;
    }
    evictMarkdown(victim);
  }
  return html;
};
let sequence = 0;
const pending = new Map();
const isMac = window.qqclaw?.platform === "darwin" || /Macintosh|Mac OS X/.test(navigator.userAgent);
const nativeBridge = window.qqclaw?.bridge || window.chrome?.webview;
document.documentElement.dataset.platform = isMac ? "darwin" : "win32";
const copyText = (text) => isMac ? rpc("clipboard.write", { text }) : navigator.clipboard.writeText(text);
// Some embedded WebKit origins disable browser storage. Only view preferences
// use this cache; conversations and settings always live in the backend Store.
const viewStorage = {
  getItem(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
  setItem(key, value) { try { window.localStorage.setItem(key, value); } catch {} },
  removeItem(key) { try { window.localStorage.removeItem(key); } catch {} },
};
function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!nativeBridge) {
      reject(new Error("请使用 QQClaw 桌面应用打开。"));
      return;
    }
    const id = `ui-${++sequence}`;
    const timer = method.startsWith("dialog.") ? null : setTimeout(
      () => {
        pending.delete(id);
        reject(new Error("操作超时，请检查运行环境或网络。"));
      },
      method === "system.installCodex" ? 300000 : 100000,
    );
    pending.set(id, { resolve, reject, timer });
    nativeBridge.postMessage({ id, method, params });
  });
}
let state = {
  settings: {
    theme: "light",
    fontSize: 14,
    showStatus: true,
    defaultProvider: "local",
    defaultModel: "",
    defaultEffort: "",
    defaultPermission: "auto",
  },
  providers: [{ id: "local", name: "本机 Codex", type: "local", models: [] }],
  projects: [],
  sessions: [],
  accounts: [],
};
const ui = {
  active: viewStorage.getItem("active-session") || "",
  project: "",
  page: "",
  panel: true,
  sidebar: true,
  expanded: new Set(),
  draft: "",
  overlay: "",
  connectionDraft: null,
  editingAccount: "",
  bindingProject: "",
  bindingAccount: "",
  providerDraft: null,
  models: new Map(),
  streams: new Map(),
  activities: new Map(),
  logs: new Map(),
  login: null,
  busyAccounts: [],
  environment: null,
  runtime: null,
  startupError: "",
  environmentChecked: false,
  checkingEnvironment: false,
  installingCodex: false,
  codexSourceDraft: null,
  codexPathDraft: null,
  savingCodexSource: false,
  desktopHandoff: false,
  search: "",
  loading: false,
  approvals: new Map(),
  agentPermissions: new Map(),
  notifications: [],
  panelPage: "",
  panelData: null,
  panelSeq: 0,
};
const efforts = [
  ["", "默认"],
  ["none", "none"],
  ["minimal", "minimal"],
  ["low", "low"],
  ["medium", "medium"],
  ["high", "high"],
  ["xhigh", "xhigh"],
  ["max", "max"],
  ["ultra", "ultra"],
];
const pages = [
  { id: "general", label: "常规", icon: "sliders", group: "偏好" },
  { id: "models", label: "模型与 API", icon: "spark", group: "智能体" },
  { id: "projects", label: "项目", icon: "folder", group: "工作区" },
  { id: "runtime", label: "运行环境", icon: "monitor", group: "系统" },
  { id: "about", label: "关于", icon: "info", group: "" },
];
const session = () => state.sessions.find((s) => s.id === ui.active);
const environmentReady = () => Boolean(ui.environmentChecked && ui.runtime?.nodeReady && ui.environment?.codexPath);
let environmentRefresh = null;
const project = () => {
  const workspace = session()?.workspace || ui.project;
  return (
    state.projects.find((p) => sameWorkspace(p.workspace, workspace)) ||
    (workspace
      ? {
          workspace,
          name: workspace.split(/[\\/]/).filter(Boolean).at(-1) || workspace,
        }
      : state.projects[0])
  );
};
const profile = (id) =>
  state.providers.find((p) => p.id === id) || state.providers[0];
const accountBusy = (account) => ui.busyAccounts.includes(account.id) ||
  state.sessions.some((s) => (s.accountId === account.id || s.id === account.sessionId) && (s.busy || s.queued));
const button = (action, label, ico = "", cls = "", attrs = "") =>
  `<button class="btn ${cls}" data-action="${action}" ${attrs}>${ico ? icon(ico) : ""}${esc(label)}</button>`;
const ib = (action, title, ico, attrs = "", cls = "") =>
  `<button class="icon-button ${cls}" title="${esc(title)}" aria-label="${esc(title)}" data-action="${action}" ${attrs}>${icon(ico)}</button>`;
const option = (value, label, selected) =>
  `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;
const providerOptions = (selected) =>
  state.providers.map((p) => option(p.id, p.name, selected)).join("");
function modelOptions(providerId, selected = "") {
  const p = profile(providerId);
  const models =
    ui.models.get(providerId) ||
    p.models.map((id) => ({ id, model: id, displayName: id }));
  const defaultName = models.find((m) => m.isDefault)?.displayName;
  return `${p.type === "local" ? option("", defaultName || "本机默认模型", selected) : option("", "选择模型", selected)}${selected && !models.some((m) => (m.model || m.id) === selected) ? option(selected, selected, selected) : ""}${models.map((m) => option(m.model || m.id, m.displayName || m.model || m.id, selected)).join("")}`;
}
function effortOptions(providerId, model, selected = "") {
  const metadata = ui.models
    .get(providerId)
    ?.find((m) => (model ? (m.model || m.id) === model : m.isDefault));
  const supported = metadata?.supportedReasoningEfforts?.map(
    (e) => e.reasoningEffort,
  );
  const allowed = supported?.length
    ? [
        ["", "默认"],
        ...supported.map((value) => [value, value]),
        ...(!supported.includes(selected) && selected
          ? [[selected, selected]]
          : []),
      ]
    : efforts;
  return allowed
    .map(([value, label]) => option(value, label, selected))
    .join("");
}
const catalog = new ModelCatalog(
  (providerId) => rpc("models.list", { providerId }),
  syncModels,
);
ui.models = catalog.entries;
function syncModels(providerId) {
  for (const control of document.querySelectorAll("[data-model-provider]")) {
    if (control.dataset.modelProvider !== providerId) continue;
    if (control.tagName === "SELECT") {
      const selected = control.value;
      control.innerHTML = modelOptions(providerId, selected);
      control.value = selected;
    }
  }
  const active = session();
  const config = active || {
    providerId: state.settings.defaultProvider,
    model: state.settings.defaultModel,
    effort: state.settings.defaultEffort,
  };
  if ($("effort-select") && config.providerId === providerId)
    $("effort-select").innerHTML = effortOptions(
      providerId,
      config.model,
      config.effort,
    );
  if ($("default-effort") && $("default-provider")?.value === providerId)
    $("default-effort").innerHTML = effortOptions(
      providerId,
      $("default-model").value,
      $("default-effort").value,
    );
  for (const prefix of ["login", "account"])
    if ($(`${prefix}-effort`) && ui.connectionDraft?.providerId === providerId)
      $(`${prefix}-effort`).innerHTML = effortOptions(
        providerId,
        ui.connectionDraft.model,
        ui.connectionDraft.effort,
      );
  refreshPickers();
}
configurePickers({
  onOpen: (providerId) => catalog.refresh(providerId, true),
  modelData: (providerId) => ({
    models:
      ui.models.get(providerId) ||
      profile(providerId)?.models.map((model) => ({ model })) ||
      [],
    status: catalog.status.get(providerId),
  }),
});
const permissionOptions = (selected) =>
  [
    ["ask", "每次询问"],
    ["accept-edits", "允许编辑"],
    ["auto", "全自动"],
    ...(selected === "read-only" ? [["read-only", "只读"]] : []),
    ...(selected === "workspace-write"
      ? [["workspace-write", "允许编辑（工作区）"]]
      : []),
  ]
    .map(([value, label]) => option(value, label, selected))
    .join("");
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => $("toast").classList.remove("show"), 4200);
}
function applyTheme() {
  const theme = state.settings.theme;
  document.documentElement.dataset.theme =
    theme === "system"
      ? matchMedia("(prefers-color-scheme:dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.style.setProperty(
    "--font-size",
    `${state.settings.fontSize || 14}px`,
  );
  document.documentElement.style.setProperty(
    "--font-scale",
    String((state.settings.fontSize || 14) / 14),
  );
  document.documentElement.style.fontFamily = {
    system: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
    yahei: '"Microsoft YaHei UI",sans-serif',
    consolas: 'Consolas,"Microsoft YaHei UI",monospace',
  }[state.settings.fontFamily || "system"];
  document.documentElement.dataset.activity = String(
    Boolean(state.settings.showActivity),
  );
}
const windowButtons = () =>
  isMac ? "" : `<div class="window-buttons"><button class="window-button" data-action="window.minimize" aria-label="最小化">${icon("minus")}</button><button class="window-button" data-action="window.maximize" aria-label="最大化或还原">${icon("maximize")}</button><button class="window-button" data-action="window.close" aria-label="关闭">${icon("close")}</button></div>`;
const resizeEdges = () =>
  Object.entries(isMac ? {} : { w: 1, e: 2, n: 3, nw: 4, ne: 5, s: 6, sw: 7, se: 8 })
    .map(
      ([key, value]) =>
        `<div class="resize-edge ${key}" data-resize="${value}"></div>`,
    )
    .join("");
function sidebar() {
  const sessionRow = (item, nested = false) =>
    '<div class="session-row' +
    (nested ? " nested" : "") +
    (item.id === ui.active ? " active" : "") +
    '" data-action="select-session" data-id="' +
    item.id +
    '" title="' +
    esc(item.title) +
    '">' +
    (item.busy
      ? '<span class="dot pulse"></span>'
      : icon(item.source === "wechat" ? "wechat" : "circle")) +
    '<span class="ellipsis grow">' +
    esc(item.title) +
    "</span>" +
    (state.settings.showTime
      ? '<span class="session-time">' +
        esc(
          new Date(item.updatedAt || item.createdAt).toLocaleDateString(
            "zh-CN",
            { month: "numeric", day: "numeric" },
          ),
        ) +
        "</span>"
      : "") +
    ib(
      "session-menu",
      "会话菜单",
      "more",
      'data-id="' + item.id + '"',
      "row-more",
    ) +
    "</div>";
  const general = state.sessions.filter(
    (s) => !state.projects.some((p) => sameWorkspace(p.workspace, s.workspace)),
  );
  return (
    '<aside class="sidebar' +
    (ui.sidebar ? "" : " collapsed") +
    '"><div class="brand" data-drag><button class="brand-home" data-action="home"><span class="brand-mark">' +
    icon("logo") +
    "</span><strong>QQClaw</strong></button>" +
    ib("toggle-sidebar", "收起侧栏", "sidebar") +
    '</div><div class="side-body"><div class="section-heading">会话<div class="section-tools">' +
    ib("new-session", "新建会话", "new") +
    ib("search", "搜索会话", "search") +
    "</div></div>" +
    general
      .slice(0, 6)
      .map((s) => sessionRow(s))
      .join("") +
    '<div class="section-heading projects-heading">项目<div class="section-tools">' +
    ib("add-project", "添加项目", "plus") +
    "</div></div>" +
    (state.projects.length
      ? state.projects
          .map((p) => {
            const open = ui.expanded.has(p.id),
              children = state.sessions.filter(
                (s) => sameWorkspace(s.workspace, p.workspace),
              );
            return (
              '<div class="project-row' +
              (open ? " open" : "") +
              '" data-action="project-toggle" data-id="' +
              p.id +
              '" title="' +
              esc(p.workspace) +
              '">' +
              icon("chevron", "chevron") +
              icon("folder") +
              '<strong class="ellipsis grow">' +
              esc(p.name) +
              "</strong>" +
              (state.settings.showCounts && children.length
                ? '<span class="project-count">' + children.length + "</span>"
                : "") +
              (state.settings.showStatus && children.some((s) => s.busy)
                ? '<span class="dot pulse"></span>'
                : "") +
              '<div class="project-tools">' +
              ib(
                "project-chat",
                "在项目中新建会话",
                "plus",
                'data-id="' + p.id + '"',
              ) +
              ib("project-menu", "项目菜单", "more", 'data-id="' + p.id + '"') +
              "</div></div>" +
              (open
                ? children
                    .slice(0, 20)
                    .map((s) => sessionRow(s, true))
                    .join("")
                : "")
            );
          })
          .join("")
      : '<button class="project-row open-project" data-action="add-project">' +
        icon("folder") +
        "打开项目</button>") +
    '</div><div class="side-footer">' +
    ib("settings", "设置", "settings") +
    ib(
      "wechat",
      "连接到微信",
      "wechat",
      "",
      "wechat-trigger" +
        (state.accounts.some((a) => a.connected) ? " connected" : ""),
    ) +
    ib("history", "会话历史", "clock") +
    ib("notifications", "通知", "bell") +
    '<button class="version" data-action="about">v0.3.10</button></div><div class="sidebar-splitter" role="separator" aria-label="调整侧栏宽度" tabindex="0"></div></aside>'
  );
}
function messages() {
  const s = session();
  if (!s || !s.messages.length) {
    const current = project();
    return `<div class="welcome"><h1>新任务</h1><p class="welcome-description">描述需求，或先了解一下项目。</p>
      <button class="welcome-workspace" data-action="${current ? "project-switch" : "add-project"}" title="${esc(current?.workspace || "选择项目工作目录")}">${icon("folder")}<span class="grow"><strong>${esc(current?.name || "选择工作目录")}</strong><span class="welcome-path">${esc(current?.workspace || "任务将在所选目录中执行")}</span></span>${icon("chevron")}</button>
      <div class="welcome-starters" aria-label="任务起点"><button data-action="suggest" data-text="梳理这个项目的结构和启动方式，先不要修改文件。">${icon("folder")}<span>了解项目结构</span></button><button data-action="suggest" data-text="检查当前项目中可能存在的错误，先列出问题和依据，不要直接修改。">${icon("review")}<span>检查代码中的问题</span></button></div></div>`;
  }
  const stream = ui.streams.get(s.id) || "";
  return `${s.messages.map((m, index) => `<article class="message ${m.role}${m.kind === "progress" ? " progress-message" : ""}">${m.kind === "progress" ? '<div class="progress-label">过程进度</div>' : m.role === "assistant" && m.runStats ? runSummary(m.runStats) : ""}<div class="message-content">${m.role === "assistant" ? markdown(m.text) : esc(m.text)}</div>${(m.attachments || []).map((a, attachment) => `<button class="message-attachment" data-action="reveal-attachment" data-message="${index}" data-attachment="${attachment}" title="在文件夹中显示">${icon("file")}<span>${esc(a.label || a.path.split(/[\\/]/).pop())}<small>在文件夹中显示</small></span>${icon("external")}</button>`).join("")}${m.role === "assistant" && m.kind !== "progress" ? `<div class="message-actions">${ib("copy-message", "复制回复", "copy", `data-index="${index}"`)}<span>Codex${s.model ? ` · ${esc(s.model)}` : ""}</span></div>` : ""}</article>`).join("")}
    ${s.busy ? `<div class="activity-row"><span class="spinner"></span>${esc(ui.activities.get(s.id) || "Codex 正在处理…")}</div>${ui.logs.get(s.id)?.length ? `<details class="activity-detail"><summary>查看工具活动 · ${ui.logs.get(s.id).length}</summary>${esc(ui.logs.get(s.id).slice(-12).join("\n"))}</details>` : ""}${stream ? `<article class="message assistant"><div class="message-content">${renderMarkdown(stream)}</div></article>` : ""}` : ""}`;
}
function composer() {
  const s = session(),
    config = s || {
      providerId: state.settings.defaultProvider,
      model: state.settings.defaultModel,
      effort: state.settings.defaultEffort,
      permission: state.settings.defaultPermission,
    };
  const busy = s?.busy,
    blocked = busy || s?.queued ? "disabled" : "",
    stopping = busy && !ui.draft.trim();
  const approval = [...ui.approvals.values()].find(
    (a) => a.sessionId === s?.id,
  );
  return (
    '<div class="composer-wrap">' +
    (s?.messages.length
      ? ib("scroll-bottom", "滚动到底部", "down", "", "scroll-bottom")
      : "") +
    (approval
      ? '<div class="approval-card"><div class="row">' +
        icon("shield") +
        "<strong>等待你的确认</strong></div><p>" +
        esc(approval.params.reason || "Codex 请求执行以下操作。") +
        "</p><pre>" +
        esc(
          approval.params.command ||
            JSON.stringify(
              approval.params.changes || approval.params.commandActions || [],
              null,
              2,
            ),
        ) +
        '</pre><div class="row">' +
        button(
          "approval-deny",
          "拒绝",
          "",
          "outline",
          'data-id="' + approval.key + '"',
        ) +
        button(
          "approval-allow",
          "允许本次",
          "check",
          "primary",
          'data-id="' + approval.key + '"',
        ) +
        "</div></div>"
      : "") +
    (s?.queued ? '<div class="composer-queue">' + s.queued + ' 条消息等待处理</div>' : "") +
    '<div class="composer"><textarea id="composer-input" aria-label="编程任务" placeholder="' +
    (busy ? "可以继续输入，发送后将依次处理" : "描述任务，或说明需要修改的地方…") +
    '">' +
    esc(ui.draft) +
    '</textarea><div class="composer-bottom"><div class="composer-left">' +
    ib("composer-add", "添加文件或工作目录", "plus") +
    '<span class="composer-control agent-control">' +
    icon("shield") +
    '<select id="agent-select" aria-label="工作模式" ' +
    blocked +
    ">" +
    option(
      "agent",
      "智能体",
      config.permission === "read-only" ? "read" : "agent",
    ) +
    option(
      "read",
      "只读",
      config.permission === "read-only" ? "read" : "agent",
    ) +
    '</select></span><span class="composer-control permission-control"><select id="permission-select" aria-label="执行权限" ' +
    blocked +
    ">" +
    permissionOptions(config.permission) +
    '</select></span></div><div class="composer-right">' +
    contextUsage(s) +
    (state.providers.length > 1
      ? '<span class="composer-control provider-control"><select id="provider-select" aria-label="模型服务" ' +
        blocked +
        ">" +
        providerOptions(config.providerId) +
        "</select></span>"
      : "") +
    '<span class="composer-control model-control"><select id="model-select" data-model-provider="' +
    esc(config.providerId) +
    '" aria-label="模型" ' +
    blocked +
    ">" +
    modelOptions(config.providerId, config.model) +
    '</select></span><span class="composer-control effort-control"><select id="effort-select" aria-label="思考等级" ' +
    blocked +
    ">" +
    effortOptions(config.providerId, config.model, config.effort) +
    '</select></span><button class="send-button' +
    (!ui.draft.trim() && !busy ? " empty" : "") +
    '" data-action="' +
    (stopping ? "stop" : "send") +
    '" title="' +
    (stopping ? "停止任务" : "发送任务") +
    '" aria-label="' +
    (stopping ? "停止任务" : "发送任务") +
    '">' +
    icon(stopping ? "stop" : "arrow") +
    "</button></div></div></div></div>"
  );
}
function workspace() {
  const s = session(),
    p = project(),
    missing = ui.startupError || (ui.environment && !ui.environment.codexPath);
  return (
    '<div class="workspace"><header class="topbar" data-drag>' +
    (!ui.sidebar ? ib("toggle-sidebar", "显示侧栏", "sidebar") : "") +
    '<div class="breadcrumb"><span class="project-crumb">' +
    icon("folder") +
    '<span class="ellipsis">' +
    esc(p?.name || "本地工作区") +
    '</span></span><span class="divider">/</span>' +
    (s?.messages.length ? '<h1 class="conversation-heading">' : '<span class="conversation-heading">') +
    '<button class="conversation-title ellipsis" data-action="session-menu" data-id="' +
    esc(s?.id || "") +
    '">' +
    esc(s?.title || "新会话") +
    '</button>' +
    (s?.messages.length ? '</h1>' : '</span>') +
    '</div><div class="top-actions">' +
    button("open-browser-window", "内置浏览器", "browser", "outline desktop-continue", `title="打开当前会话的内置浏览器" aria-label="打开内置浏览器"`) +
    '<div class="top-capsule">' +
    ib("new-session", "新建会话", "new") +
    ib("search", "搜索会话", "search") +
    "</div>" +
    ib("panel-new", "新建面板", "plus") +
    ib("maximize-panel", "展开工作面板", "expand") +
    ib("toggle-panel", "显示或隐藏工作面板", "panel") +
    "</div>" +
    windowButtons() +
    "</header>" +
    (missing
      ? '<div class="setup-banner">' +
        icon("info") +
        '<span class="grow ellipsis">' +
        esc(ui.startupError || "未检测到 Codex CLI，请完成环境设置。") +
        "</span>" +
        button("runtime", "配置环境", "", "outline") +
        "</div>"
      : "") +
    (s?.desktopCopy ? '<div class="setup-banner desktop-handoff-note">' + icon("info") + '<span>已保存 Desktop 对话副本。Desktop 的后续回复不会同步回此会话或微信。</span></div>' : "") +
    '<div class="content-area"><main class="chat-column"><div class="chat-scroll" id="chat-scroll">' +
    messages() +
    "</div>" +
    composer() +
    "</main>" +
    (ui.panel ? workPanel() : "") +
    "</div></div>"
  );
}
const browserStates = new Map();
let browserViewFrame = 0, browserViewSignature = "", observedBrowserViewport;
const browserResizeObserver = new ResizeObserver(() => scheduleBrowserView());
function scheduleBrowserView() {
  if (browserViewFrame) return;
  browserViewFrame = requestAnimationFrame(() => {
    browserViewFrame = 0;
    const viewport = $("browser-viewport");
    if (viewport !== observedBrowserViewport) {
      browserResizeObserver.disconnect();
      if (viewport) browserResizeObserver.observe(viewport);
      observedBrowserViewport = viewport;
    }
    const rect = viewport?.getBoundingClientRect();
    const data = browserStates.get(session()?.id);
    const blocked = !!document.querySelector(".overlay-backdrop,.picker-menu,.context-menu");
    const value = { owner: session()?.id || "", visible: !!(rect?.width && rect?.height && !blocked && !ui.page && data?.url),
      x: rect?.x || 0, y: rect?.y || 0, width: rect?.width || 0, height: rect?.height || 0,
      viewportWidth: innerWidth, viewportHeight: innerHeight };
    const signature = JSON.stringify(value);
    if (signature === browserViewSignature) return;
    browserViewSignature = signature;
    rpc("browser.view", value).catch(() => { browserViewSignature = ""; });
  });
}
function browserPanel() {
  const b = browserStates.get(session()?.id) || {}, tabs = b.tabs || [];
  return `<aside class="work-panel browser-panel${ui.panelMax ? " maximized" : ""}">
    <div class="browser-tabs-bar"><div class="browser-tabs" role="tablist" aria-label="浏览器标签页">${tabs.length ? tabs.map(t => `<div class="browser-tab${t.id === b.activeTab ? " active" : ""}"><button role="tab" aria-selected="${t.id === b.activeTab}" data-action="browser-selectTab" data-id="${esc(t.id)}" title="${esc(t.title)}">${icon(t.loading ? "refresh" : "browser", t.loading ? "spinning" : "")}<span class="ellipsis">${esc(t.title || "新标签页")}</span></button>${ib("browser-closeTab", "关闭标签页", "close", `data-id="${esc(t.id)}"`)}</div>`).join("") : '<span class="browser-idle-tab">' + icon("browser") + '浏览器</span>'}</div>
    ${ib("browser-newTab", "新建标签页", "plus")}${ib("maximize-panel", ui.panelMax ? "还原面板" : "展开面板", "expand")}${ib("toggle-panel", "收起浏览器", "panel")}</div>
    <div class="browser-toolbar"><div class="browser-navigation">${ib("browser-back", "后退", "back", b.canGoBack ? "" : "disabled")}${ib("browser-forward", "前进", "chevron", b.canGoForward ? "" : "disabled")}${ib(b.loading ? "browser-stop" : "browser-reload", b.loading ? "停止加载" : "刷新网页", b.loading ? "close" : "refresh", b.url ? "" : "disabled")}</div>
    <form id="browser-form" class="browser-address">${icon(b.url?.startsWith("https:") ? "shield" : "search")}<input id="browser-address" name="url" aria-label="网页地址或搜索" placeholder="搜索或输入网址" autocomplete="off" spellcheck="false" value="${esc(b.url || "")}"></form>
    ${ib("browser-external", "在系统浏览器打开", "external", b.url ? "" : "disabled")}</div>
    ${b.error ? `<div class="browser-error" role="status">${icon("info")}<span>${esc(b.error)}</span></div>` : ""}
    <div id="browser-viewport" class="browser-viewport">${!b.url ? `<div class="browser-start">${icon("browser")}<strong>从这里打开网页</strong><span>输入网址或搜索内容，也可以直接让 Codex 浏览。</span><button class="outline" data-action="browser-google">${icon("search")}Google 搜索</button></div>` : ""}</div>
    ${b.loading ? '<div class="browser-loading-line"></div>' : ""}</aside>`;
}
function refreshBrowserPanel() {
  const panel = document.querySelector(".browser-panel");
  if (panel) {
    const focus = document.activeElement?.id === "browser-address";
    const value = focus ? $("browser-address").value : "";
    const start = focus ? $("browser-address").selectionStart : 0;
    panel.outerHTML = browserPanel();
    if (focus) { $("browser-address").value = value; $("browser-address").focus(); $("browser-address").setSelectionRange(start, start); }
  }
  scheduleBrowserView();
}
function workPanel() {
  if (ui.panelPage === "browser") return browserPanel();
  const header = ui.panelPage
    ? '<div class="panel-header">' +
      ib("panel-new", "返回新建面板", "back") +
      "<strong>" +
      ({ files: "文件管理器", review: "审阅", browser: "浏览器" }[
        ui.panelPage
      ] || "工作区") +
      "</strong>" +
      ib("panel-refresh", "刷新", "refresh") +
      "</div>"
    : "<h3>新建</h3>";
  let body = "";
  if (!ui.panelPage)
    body =
      '<button class="panel-action" data-action="panel-review">' +
      icon("review") +
      '审阅</button><button class="panel-action" data-action="panel-browser">' +
      icon("browser") +
      '浏览器</button><button class="panel-action" data-action="panel-files">' +
      icon("folder") +
      "文件管理器</button>";
  else if (ui.panelLoading) body = '<div class="panel-empty">正在读取…</div>';
  else if (ui.panelError)
    body = '<div class="panel-empty">' + esc(ui.panelError) + "</div>";
  else if (ui.panelPage === "files")
    body =
      '<div class="file-path">' +
      esc(ui.panelData?.directory || ".") +
      "</div>" +
      (ui.panelData?.directory
        ? '<button class="file-row" data-action="file-parent">' +
          icon("back") +
          "上一级</button>"
        : "") +
      (ui.panelData?.entries || [])
        .map(
          (f) =>
            '<button class="file-row" data-action="file-open" data-file="' +
            esc(f.relative) +
            '" data-directory="' +
            f.directory +
            '">' +
            icon(f.directory ? "folder" : "file") +
            '<span class="ellipsis">' +
            esc(f.name) +
            "</span></button>",
        )
        .join("") +
      (ui.filePreview
        ? '<div class="file-preview"><div class="row"><strong class="ellipsis grow">' +
          esc(ui.filePreview.name) +
          "</strong>" +
          ib("close-file", "关闭预览", "close") +
          "</div><pre>" +
          esc(ui.filePreview.text) +
          "</pre></div>"
        : "");
  else
    body =
      '<div class="review-note">工作目录中的未提交更改</div><pre class="diff-preview">' +
      esc(ui.panelData?.diff || "当前没有未提交的更改。") +
      "</pre>";
  return (
    '<aside class="work-panel' +
    (ui.panelMax ? " maximized" : "") +
    '">' +
    header +
    body +
    "</aside>"
  );
}
function generalSettings() {
  return `<h1>常规</h1><h2>外观</h2><div class="settings-card"><div class="setting-row"><div class="setting-title">主题</div><select id="theme-setting" aria-label="主题">${[
    ["light", "亮色"],
    ["dark", "暗色"],
    ["system", "跟随系统"],
  ]
    .map(([v, l]) => option(v, l, state.settings.theme))
    .join("")}</select></div></div>
    <div class="settings-card"><div class="setting-row"><div class="setting-title">字体</div><select id="font-family-setting" aria-label="字体">${[
      ["system", "跟随系统"],
      ["yahei", "微软雅黑"],
      ["consolas", "Consolas"],
    ]
      .map(([v, l]) => option(v, l, state.settings.fontFamily || "system"))
      .join("")}</select></div></div>
    <div class="settings-card"><div class="setting-row"><div class="setting-title">字体大小</div><div class="font-controls"><div class="font-segments">${[
      [12, "小"],
      [14, "标准"],
      [16, "大"],
      [18, "特大"],
    ]
      .map(
        ([v, l]) =>
          `<button class="${state.settings.fontSize === v ? "active" : ""}" data-action="set-font-size" data-size="${v}">${l}</button>`,
      )
      .join(
        "",
      )}</div><div class="row"><input id="font-setting" type="range" min="12" max="20" value="${state.settings.fontSize}" aria-label="字体大小"><span class="small muted">${Math.round((state.settings.fontSize / 14) * 100)}%</span></div></div></div></div>
    <h2>侧边栏</h2><div class="settings-card"><div class="setting-row"><div><div class="setting-title">在项目上显示运行状态</div><p class="setting-description">任务运行时，在项目和会话旁显示活动指示。</p></div><button class="switch${state.settings.showStatus ? " on" : ""}" role="switch" aria-checked="${state.settings.showStatus}" aria-label="显示运行状态" data-action="toggle-status"></button></div></div>
    ${[
      ["showCounts", "数量徽标"],
      ["showActivity", "活动流光"],
      ["showTime", "会话时间"],
    ]
      .map(
        ([key, label]) =>
          `<div class="settings-card"><div class="setting-row"><div class="setting-title">${label}</div><button class="switch${state.settings[key] ? " on" : ""}" role="switch" aria-checked="${!!state.settings[key]}" aria-label="${label}" data-action="toggle-preference" data-key="${key}"></button></div></div>`,
      )
      .join("")}
    <h2>快捷键</h2><div class="settings-card"><div class="setting-row"><span class="setting-title">新建会话</span><span class="keyboard-key">${isMac ? "⌘" : "Ctrl"} + N</span></div></div><div class="settings-card"><div class="setting-row"><span class="setting-title">搜索会话</span><span class="keyboard-key">${isMac ? "⌘" : "Ctrl"} + K</span></div></div>`;
}
function connectionFields(draft, prefix) {
  return `<div class="fields-two"><label class="field"><span class="field-label">模型服务</span><select id="${prefix}-provider" data-draft="providerId">${providerOptions(draft.providerId)}</select></label><label class="field"><span class="field-label">模型 ID</span><input id="${prefix}-model" data-draft="model" data-model-provider="${esc(draft.providerId)}" list="${prefix}-model-list" value="${esc(draft.model)}" placeholder="${profile(draft.providerId).type === "local" ? "留空使用本机默认" : "填写模型 ID"}"><datalist id="${prefix}-model-list">${modelOptions(draft.providerId, draft.model)}</datalist></label>
    <label class="field"><span class="field-label">思考等级</span><select id="${prefix}-effort" data-draft="effort">${effortOptions(draft.providerId, draft.model, draft.effort)}</select></label><label class="field"><span class="field-label">执行权限</span><select id="${prefix}-permission" data-draft="permission">${permissionOptions(draft.permission)}</select></label></div>`;
}
function modelSettings() {
  const d = ui.providerDraft;
  return `<h1>模型与 API</h1><p class="modal-description">使用本机 Codex 配置，或添加自己的 API 服务。桌面与微信账户都能选择这些服务。</p>
    <h2>模型服务</h2>${state.providers.map((p) => `<div class="provider-card"><div class="provider-symbol">${icon(p.type === "local" ? "logo" : "model")}</div><div class="grow"><strong>${esc(p.name)}</strong><p>${p.type === "local" ? "沿用本机登录、Provider 和模型配置" : esc(p.baseUrl)}</p>${p.type !== "local" ? `<div class="model-chips">${p.models.map((m) => `<span class="pill">${esc(m)}</span>`).join("")}</div>` : ""}</div>${ib("test-provider", "读取模型并测试连接", "refresh", `data-id="${p.id}"`)}${p.type !== "local" ? ib("edit-provider", "编辑服务", "sliders", `data-id="${p.id}"`) : ""}</div>`).join("")}
    ${button("add-provider", "添加 API 服务", "plus", "outline")}
    ${
      d
        ? `<form class="provider-form" id="provider-form"><div class="row spread"><h3>${d.id ? "编辑 API 服务" : "添加 API 服务"}</h3>${ib("cancel-provider", "关闭编辑", "close")}</div>
    <label class="field"><span class="field-label">服务名称</span><input name="name" value="${esc(d.name)}" placeholder="例如：我的 API" required></label><label class="field"><span class="field-label">API 地址</span><input name="baseUrl" value="${esc(d.baseUrl)}" placeholder="https://api.example.com/v1" required><small>填写 API 基础地址；系统会追加 /responses 或 /chat/completions。</small></label>
    <div class="fields-two"><label class="field"><span class="field-label">API 协议</span><select name="protocol">${option("responses", "Responses", d.protocol)}${option("chat-completions", "Chat Completions（兼容适配）", d.protocol)}</select></label><label class="field"><span class="field-label">思考参数</span><select name="reasoningParameter">${option("effort", "发送 reasoning_effort", d.reasoningParameter)}${option("omit", "不发送（服务不支持时选择）", d.reasoningParameter)}</select></label></div>
    <label class="field"><span class="field-label">API Key ${d.hasKey ? "· 已保存" : ""}</span><input type="password" name="apiKey" autocomplete="new-password" value="${esc(d.apiKey || "")}" placeholder="${d.hasKey ? "留空保留原 Key" : "填写 API Key；无鉴权服务可留空"}"><small>${isMac ? "使用 macOS 钥匙串保护的密钥" : "由 Windows 账户"}加密保存。不会写入项目或全局 Codex 配置。</small></label>${d.hasKey ? '<label class="row small muted" style="margin-bottom:17px"><input type="checkbox" name="clearKey">清除已保存的 Key（用于本机无鉴权服务）</label>' : ""}
    <label class="field"><span class="field-label">模型 ID</span><textarea name="models" rows="3" placeholder="可留空自动读取；也可每行填写一个自定义模型 ID">${esc(d.models.join("\n"))}</textarea><small>模型需要支持工具调用。Chat Completions 通过本地兼容层使用 Codex 的工具能力。</small></label><div class="row">${button("save-provider", "保存服务", "check", "primary")}${d.id ? button("remove-provider", "移除服务", "trash", "danger", `data-id="${d.id}"`) : ""}</div></form>`
        : ""
    }
    <h2>新会话默认值</h2><div class="settings-card"><div class="fields-two"><label class="field"><span class="field-label">模型服务</span><select id="default-provider">${providerOptions(state.settings.defaultProvider)}</select></label><label class="field"><span class="field-label">模型 ID</span><input id="default-model" data-model-provider="${esc(state.settings.defaultProvider)}" value="${esc(state.settings.defaultModel)}" list="default-model-list" placeholder="搜索或填写模型 ID"><datalist id="default-model-list">${modelOptions(state.settings.defaultProvider, state.settings.defaultModel)}</datalist></label><label class="field"><span class="field-label">思考等级</span><select id="default-effort">${effortOptions(state.settings.defaultProvider, state.settings.defaultModel, state.settings.defaultEffort)}</select></label><label class="field"><span class="field-label">执行权限</span><select id="default-permission">${permissionOptions(state.settings.defaultPermission)}</select></label></div>${button("save-defaults", "保存默认值", "check", "primary")}</div>`;
}
function projectSettings() {
  return `<h1>项目</h1><p class="modal-description">选择本地目录供 Codex 工作。微信账户的目录可在左下角「连接到微信」中单独设置。</p>${state.projects.map((p) => `<div class="provider-card"><div class="provider-symbol">${icon("folder")}</div><div class="grow"><strong>${esc(p.name)}</strong><p>${esc(p.workspace)}</p></div>${ib("open-project-folder", "打开目录", "external", `data-id="${p.id}"`)}${ib("remove-project", "从列表移除", "trash", `data-id="${p.id}"`)}</div>`).join("") || '<div class="settings-card empty-note">还没有项目。添加目录后，即可开始编程。</div>'}${button("add-project", "添加项目", "plus", "outline")}`;
}
function runtimeSettings() {
  const e = ui.environment;
  const r = ui.runtime;
  const installing = ui.installingCodex;
  const source = ui.codexSourceDraft ?? state.settings.codexSource ?? (state.settings.codexPath ? "custom" : "auto");
  const sourceName = { desktop: "Desktop 附带的运行程序", cli: "独立 Codex CLI", custom: "手动指定的程序" }[e?.codexSource] || "等待检测";
  const desktop = e?.desktop || r?.desktop;
  const notice = installing ? "正在安装 Codex，请稍候。安装成功后会自动重启。" :
    environmentReady() ? "Codex 环境配置成功，可以开始使用。" :
    r?.nodeReady ? "NodeJS 环境配置成功，Codex 未检测到配置" :
    r?.nodePath ? "NodeJS 版本不符合要求，请安装 Node.js 22.13 或更新版本。" : "请先安装 NodeJS，再安装 Codex。";
  return `<h1>运行环境</h1><p class="modal-description">QQClaw 使用系统${isMac ? " WebKit" : " WebView2"}，不内置 Node.js 与 Codex。安装一次后，桌面编程和微信连接共用本机环境。</p>
    <div class="runtime-setup-status" role="status">${icon(environmentReady() ? "check" : "info")}<span>${notice}</span></div>
    <h2>1. NodeJS</h2><div class="settings-card"><div class="setting-row"><div class="grow"><div class="setting-title">${r?.nodeReady ? `已检测到 Node.js ${esc(r.nodeVersion)}` : "尚未配置可用的 NodeJS"}</div><p class="setting-description">${esc(r?.nodeError || r?.nodePath || "需要 Node.js 22.13 或更新版本，包含 npm。下载安装后会自动检测。")}</p></div>${button("install-node", "前往官网下载", "external", "outline", installing ? "disabled" : "")}${ib("choose-node", isMac ? "手动选择 node" : "手动选择 node.exe", "folder", installing ? "disabled" : "")}</div></div>
    <h2>2. Codex</h2><div class="settings-card"><div class="setting-row"><div class="grow"><div class="setting-title">${e?.codexPath ? `Codex 已就绪 · ${sourceName}` : "尚未检测到 Codex"}</div><p class="setting-description">${esc(e?.codexPath || e?.error || (r?.nodeReady ? "可以使用 Desktop 附带的程序，也可以一键安装独立 CLI。" : "请先完成 NodeJS 安装，然后配置 Codex。"))}</p></div>${button("install-codex", installing ? "正在安装…" : "一键安装 CLI", "plus", "primary", !r?.nodeReady || installing ? "disabled" : "")}</div><div style="margin-top:19px" class="code-command">npm install -g @openai/codex</div><div class="row" style="margin-top:15px">${button("login-codex", "登录 Codex", "external", "outline", !e?.codexPath || installing ? "disabled" : "")}${button("codex-docs", "安装说明", "info", "outline")}</div></div>
    <div class="settings-card"><label class="field"><span class="field-label">Codex 来源</span><select id="codex-source" ${!r?.nodeReady || installing || ui.savingCodexSource ? "disabled" : ""}>${[["auto", "自动检测（Desktop 优先，CLI 回退）"], ["desktop", "Desktop 附带的运行程序"], ["cli", "独立 Codex CLI"], ["custom", "手动指定程序"]].map(([value, label]) => `<option value="${value}" ${source === value ? "selected" : ""}>${label}</option>`).join("")}</select><small>内置浏览器由 QQClaw 提供，可直接从微信调用，无需 Desktop 或浏览器扩展。</small></label>${source === "custom" ? `<label class="field"><span class="field-label">Codex 程序路径</span><div class="field-row"><input id="codex-path" value="${esc(ui.codexPathDraft ?? state.settings.codexPath ?? "")}" placeholder="选择可用的 Codex 程序" ${installing || ui.savingCodexSource ? "disabled" : ""}>${button("choose-codex", "选择", "folder", "outline", installing || ui.savingCodexSource ? "disabled" : "")}</div></label>` : ""}${button("save-codex-source", ui.savingCodexSource ? "正在保存…" : "保存来源", "check", "outline", !r?.nodeReady || installing || ui.savingCodexSource ? "disabled" : "")}</div>
    <div class="settings-card"><div class="setting-row"><div class="grow"><div class="setting-title">Codex Desktop · ${desktop?.installed ? "已检测到" : "未安装或未注册"}</div><p class="setting-description">可选：将对话副本接续到 Desktop。QQClaw 自带浏览器，无需安装 Desktop；副本后续回复不会同步回微信。</p></div>${button("open-desktop", "打开 Desktop", "external", "outline", !desktop?.installed ? "disabled" : "")}${button("install-desktop", "安装入口", "external", "outline")}</div></div>
    <div class="settings-actions">${button("refresh-environment", ui.checkingEnvironment ? "正在检测…" : "重新检测", "refresh", "outline", ui.checkingEnvironment || installing ? "disabled" : "")}</div>
    <h2>本地数据</h2><div class="settings-card"><div class="setting-row"><div><div class="setting-title">账户、设置与会话</div><p class="setting-description">${esc(e?.dataDir || r?.dataDir || (isMac ? "~/Library/Application Support/QQClaw" : "%LOCALAPPDATA%\\QQClaw"))}<br>${isMac ? "使用 macOS 钥匙串保护的密钥加密保存" : "使用 Windows 账户加密保存"}；关闭应用会停止微信接收。删除程序不会清除此目录。</p></div>${button("open-data", "打开目录", "folder", "outline")}</div></div>${isMac ? "" : `<div class="settings-card"><div class="setting-row"><div><div class="setting-title">WebView2 Runtime</div><p class="setting-description">${esc(r?.webview || "使用 Windows 系统组件")}</p></div>${button("install-webview", "安装入口", "external", "outline")}</div></div>`}
    <h2>对话保存与恢复</h2><div class="settings-card"><p class="setting-title">Codex 原生历史</p><p class="setting-description">${esc(e?.codexHome || "启动后台后显示")}<br>已执行的会话由 Codex 持久化，可使用 codex resume 会话ID 继续；首次发送消息后才产生原生历史。是否显示在其他客户端的列表中由该客户端决定。</p></div>
    <div class="settings-card"><p class="setting-title">独立对话备份</p><p class="setting-description">${esc(e?.backupDir || "启动后台后显示")}<br>每次保存同步写入 JSON 和 Markdown，移除应用中的会话时仍保留。备份为可读文本，不包含账户凭证或 API 配置；附件保存路径，不复制文件本体。请将此目录和 Codex 用户目录一起纳入个人备份。</p>${e?.backupError ? `<p role="alert">${esc(e.backupError)}</p>` : ""}<div class="row" style="margin-top:15px">${button("open-conversations", "打开备份目录", "folder", "outline", !e ? "disabled" : "")}${button("restore-conversations", "恢复缺失对话", "refresh", "outline", !e ? "disabled" : "")}</div></div>`;
}
function setupGate() {
  return `<div class="setup-screen"><header data-drag>${windowButtons()}</header><main class="setup-gate" role="dialog" aria-modal="true" aria-label="环境配置提醒"><span class="setup-mark">${icon("logo")}</span><h1>${ui.environmentChecked ? "先配置运行环境" : "正在检测运行环境…"}</h1><p>当前环境未配置 Codex 环境，请在设置中进行配置</p>${button("runtime", "前往配置", "", "primary", ui.environmentChecked ? "" : "disabled")}</main></div>`;
}
function aboutSettings() {
  return `<h1>关于</h1><div class="about-mark"><span class="brand-mark">${icon("logo")}</span><div><h2>QQClaw</h2><p>v0.3.10 · ${isMac ? "macOS" : "Windows"} 桌面工作台</p></div></div><div class="settings-card"><p class="setting-title">在电脑上编程，从微信里继续。</p><p class="setting-description">腾讯 iLink / ClawBot 连接 · 本机 Codex App Server<br>独立微信账户与工作目录 · 自定义 API、模型和思考等级</p></div><h2>项目来源</h2><div class="settings-card"><p class="setting-description">微信协议实现来自 codex-wechat，并集成 codex-weixin 的附件与消息处理（MIT）。界面按 PI-Desktop 的布局与交互重新实现。</p><div class="row" style="margin-top:15px">${button("source-wechat", "codex-weixin", "external", "outline")}${button("source-ui", "UI 参考", "external", "outline")}</div></div><p class="empty-note">QQClaw 是独立项目，非腾讯或 OpenAI 官方客户端。</p>`;
}
function settings() {
  if (!environmentReady())
    return `<div class="settings-shell"><aside class="settings-nav setup-nav"><h2>配置运行环境</h2><p>按顺序完成以下两步</p><div class="settings-nav-item ${ui.runtime?.nodeReady ? "" : "active"}">${icon("check")}安装 NodeJS</div><div class="settings-nav-item ${ui.runtime?.nodeReady ? "active" : ""}">${icon("monitor")}安装 Codex</div></aside><div class="settings-main"><div class="settings-titlebar" data-drag>${windowButtons()}</div><main class="settings-content"><div class="settings-inner">${runtimeSettings()}</div></main></div></div>`;
  let group = "";
  return `<div class="settings-shell"><aside class="settings-nav"><div class="settings-search">${icon("search")}<input id="settings-search" placeholder="搜索设置…" value="${esc(ui.search)}" aria-label="搜索设置"></div>${pages
    .filter(
      (p) =>
        !ui.search ||
        `${p.label} ${p.id}`.toLowerCase().includes(ui.search.toLowerCase()),
    )
    .map((p) => {
      const label =
        p.group && p.group !== group
          ? `<div class="nav-group">${p.group}</div>`
          : "";
      group = p.group;
      return `${label}<button class="settings-nav-item${p.id === ui.page ? " active" : ""}" data-action="settings-page" data-page="${p.id}">${icon(p.icon)}${p.label}</button>`;
    })
    .join(
      "",
    )}<button class="settings-back" data-action="return">${icon("back")}返回应用</button></aside><div class="settings-main"><div class="settings-titlebar" data-drag>${windowButtons()}</div><main class="settings-content"><div class="settings-inner">${({ general: generalSettings, models: modelSettings, projects: projectSettings, runtime: runtimeSettings, about: aboutSettings }[ui.page] || generalSettings)()}</div></main></div></div>`;
}
function render() {
  const active = document.activeElement;
  const focusId = active?.id;
  const start = active?.selectionStart,
    end = active?.selectionEnd;
  const scroll = $("chat-scroll");
  const atBottom =
    !scroll ||
    scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 90;
  const oldScroll = scroll?.scrollTop || 0;
  const settingsScroll =
    ui.lastSettingsPage === ui.page
      ? document.querySelector(".settings-content")?.scrollTop || 0
      : 0;
  ui.lastSettingsPage = ui.page;
  closePicker();
  $("app").innerHTML =
    (!environmentReady() && ui.page !== "runtime" ? setupGate() : ui.page
      ? settings()
      : `<div class="app-shell">${sidebar()}${workspace()}</div>`) +
    resizeEdges();
  applyTheme();
  enhancePickers($("app"));
  if (focusId && $(focusId)) {
    $(focusId).focus({ preventScroll: true });
    if (
      typeof start === "number" &&
      $(focusId).setSelectionRange &&
      !["number", "range"].includes($(focusId).type)
    )
      try {
        $(focusId).setSelectionRange(start, end);
      } catch {}
  }
  if ($("chat-scroll"))
    $("chat-scroll").scrollTop = atBottom
      ? $("chat-scroll").scrollHeight
      : oldScroll;
  if (document.querySelector(".settings-content"))
    document.querySelector(".settings-content").scrollTop = settingsScroll;
}
function defaultConnection() {
  return {
    name: "",
    workspace: session()?.workspace || project()?.workspace || "",
    providerId: state.settings.defaultProvider,
    model: state.settings.defaultModel,
    effort: state.settings.defaultEffort,
    permission: state.settings.defaultPermission,
  };
}
function accountCard(a) {
  const editing = ui.editingAccount === a.id;
  const d = ui.connectionDraft;
  const busy = accountBusy(a);
  return `<div class="account-card"><div class="row"><div class="account-avatar">${icon("wechat")}</div><div class="grow"><div class="account-title">${esc(a.name)}</div><div class="account-meta">${esc(a.user)}</div></div><span class="pill"><span class="dot ${a.connected ? "green" : ""}"></span>${busy ? "正在处理" : a.expired ? "登录过期" : a.paused ? "已暂停" : "已连接"}</span></div>
    <div class="account-workspace">${icon("folder")}<span class="grow">${esc(a.workspace)}</span></div><div class="account-meta">${esc(profile(a.providerId).name)} · ${esc(a.model || "本机默认模型")} · ${esc(a.effort || "默认思考")} · ${a.permission === "read-only" ? "只读" : "工作区读写"}</div>
    ${a.error ? `<p class="small error" style="margin-top:10px">${esc(a.error)}</p>` : ""}${a.pending ? `<p class="small muted">${a.pending} 条待处理 / 待回复消息；断开连接会清除这些消息。</p>` : ""}
    <div class="account-actions" style="margin-top:13px">${a.expired ? button("reconnect-account", "重新扫码", "refresh", "outline", `data-id="${a.id}"`) : ""}${button("edit-account", "配置账户", "sliders", "outline", `data-id="${a.id}" ${busy || a.pending ? "disabled" : ""}`)}${button("account-session", "查看会话", "new", "outline", `data-id="${a.id}"`)}${button("pause-account", a.paused ? "恢复接收" : "暂停接收", a.paused ? "refresh" : "stop", "outline", `data-id="${a.id}" ${busy || a.pending ? "disabled" : ""}`)}${button("disconnect-account", "断开连接", "close", "danger", `data-id="${a.id}" ${busy ? "disabled" : ""}`)}</div>
    ${editing && d ? `<div class="account-form">${accountForm(d, "account")}<div class="row">${button("save-account", "保存账户", "check", "primary", `data-id="${a.id}"`)}${button("cancel-account-edit", "取消")}</div><p class="setting-description">更换目录、服务或模型设置会创建新的微信会话，历史会话仍保留。</p></div>` : ""}</div>`;
}
function workspaceBinding() {
  const p = state.projects.find((p) => p.id === ui.bindingProject);
  if (!p) return "";
  const accounts = state.accounts.map((a) => {
    const bound = sameWorkspace(a.workspace, p.workspace);
    const busy = accountBusy(a) || a.pending;
    const label = ui.bindingAccount === a.id ? "正在绑定…" :
      busy ? "处理中" : bound ? "已绑定" : "绑定";
    return `<div class="workspace-binding-account"><div class="account-avatar">${icon("wechat")}</div><div class="grow"><div class="account-title">${esc(a.name)}</div><div class="account-meta">${esc(a.user)}</div><div class="account-meta binding-account-path" title="${esc(a.workspace)}">${esc(a.workspace)}</div></div>${button("bind-workspace-account", label, bound && !busy ? "check" : "", bound ? "outline" : "primary", `data-id="${esc(a.id)}" ${busy || bound || ui.bindingAccount ? "disabled" : ""}`)}</div>`;
  }).join("");
  return `<div class="overlay-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-label="绑定微信账号"><div class="modal-header">${icon("wechat", "wechat-color")}<h2>绑定微信账号</h2><span class="grow"></span>${ib("close-overlay", "关闭", "close")}</div><div class="modal-body"><div class="binding-workspace">${icon("folder")}<div class="grow"><strong>${esc(p.name)}</strong><span>${esc(p.workspace)}</span></div></div><p class="modal-description">选择账号后，该账号的微信任务将使用此工作区。</p>${accounts ? `<div class="workspace-binding-accounts">${accounts}</div>` : '<p class="empty-note">还没有微信账号，请先扫码连接。</p>'}<div class="modal-actions">${button("wechat", "连接新账号", "plus", "outline", `data-project-id="${esc(p.id)}"`)}</div></div></section></div>`;
}
function accountForm(d, prefix) {
  return `<label class="field"><span class="field-label">账户备注</span><input id="${prefix}-name" data-draft="name" value="${esc(d.name)}" placeholder="例如：工作微信"></label><label class="field"><span class="field-label">工作目录</span><div class="field-row"><input id="${prefix}-workspace" data-draft="workspace" value="${esc(d.workspace)}" placeholder="为这个微信账户分配一个目录">${button("connection-folder", "选择目录", "folder", "outline")}</div></label>${connectionFields(d, prefix)}${d.id ? `<details class="wechat-advanced"><summary>其他授权用户</summary><label class="field"><span class="field-label">允许使用此连接的微信用户 ID（每行一个）</span><textarea id="${prefix}-senders" data-draft="allowedSenders" placeholder="默认仅允许扫码账户本人">${esc((d.allowedSenders || []).join("\n"))}</textarea></label><p class="setting-description">各用户分别保存会话与上下文，默认使用此账户的工作区。</p></details>` : ""}`;
}
function renderOverlay() {
  closePicker();
  if (!ui.overlay || !environmentReady()) {
    $("overlay").innerHTML = "";
    return;
  }
  if (ui.overlay === "wechat-bind") {
    $("overlay").innerHTML = workspaceBinding();
    return;
  }
  if (ui.overlay === "rename") {
    const s = state.sessions.find((s) => s.id === ui.renameSession);
    $("overlay").innerHTML =
      '<div class="overlay-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-label="重命名会话"><div class="modal-header"><h2>重命名会话</h2><span class="grow"></span>' +
      ib("close-overlay", "关闭", "close") +
      '</div><div class="modal-body"><input id="session-name" aria-label="会话名称" value="' +
      esc(s?.title) +
      '"><div class="modal-actions">' +
      button("close-overlay", "取消", "", "outline") +
      button("save-session-name", "保存", "", "primary") +
      "</div></div></section></div>";
    return;
  }
  if (ui.overlay === "notifications") {
    $("overlay").innerHTML =
      '<div class="overlay-backdrop notification-backdrop"><section class="modal compact-modal notification-modal" role="dialog" aria-modal="true" aria-label="通知"><div class="modal-header"><h2>通知</h2><span class="grow"></span>' +
      ib("clear-notifications", "清空通知", "trash") +
      ib("close-overlay", "关闭", "close") +
      '</div><div class="modal-body">' +
      (ui.notifications.length
        ? ui.notifications
            .map(
              (n) =>
                '<button class="notification-row" data-action="select-session" data-id="' +
                esc(n.sessionId) +
                '">' +
                icon("check") +
                '<span class="grow">' +
                esc(n.title) +
                "<small>" +
                esc(new Date(n.at).toLocaleTimeString()) +
                "</small></span></button>",
            )
            .join("")
        : '<div class="notification-empty">' +
          icon("bell") +
          "<strong>暂无通知</strong><span>任务完成后，会在这里显示。</span></div>") +
      "</div></section></div>";
    return;
  }
  if (ui.overlay === "wechat") {
    const login = ui.login;
    const d = ui.connectionDraft || defaultConnection();
    const status = {
      wait: "使用微信扫一扫",
      scaned: "已扫码，请在微信确认",
      scaned_but_redirect: "正在确认登录",
      need_verifycode: "输入手机上的验证码",
      expired: "二维码已过期",
      verify_code_blocked: "验证受限，请重新扫码",
      error: "连接失败",
    };
    $("overlay").innerHTML =
      `<div class="overlay-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="连接到微信"><div class="modal-header">${icon("wechat", "wechat-color")}<h2>连接到微信</h2><span class="grow"></span><span class="pill">${state.accounts.filter((a) => a.connected).length} 个已连接</span>${ib("close-overlay", "关闭", "close")}</div><div class="modal-body"><p class="modal-description">让微信成为你的另一个工作入口。每个账户都有自己的目录、模型和连续对话。</p>
      ${state.accounts.length ? state.accounts.map(accountCard).join("") : `<div class="connection-empty"><div class="wechat-illustration">${icon("wechat")}</div><div><h3>把工作，连接到微信。</h3><p>通过腾讯 ClawBot 扫码连接，在微信里操作指定项目。</p></div></div>`}
      ${login ? `<div class="qr-layout"><div class="qr-frame"><img src="${esc(login.qr)}" alt="微信 ClawBot 登录二维码"></div><div class="qr-description"><h3>${status[login.status] || "正在连接…"}</h3><p>用手机微信扫描二维码，并确认连接。<br>连接成功后，账户会出现在上方列表中。</p><p class="small">${esc(login.workspace)}</p>${login.error ? `<p class="error">${esc(login.error)}</p>` : ""}${login.status === "need_verifycode" ? `<div class="verify-row"><input id="verify-code" aria-label="微信验证码" inputmode="numeric" placeholder="数字验证码">${button("verify-code", "确认", "", "primary")}</div>` : ""}<div class="row">${["expired", "error", "verify_code_blocked"].includes(login.status) ? button("retry-login", "重新生成", "refresh", "green") : ""}${button("cancel-login", "取消连接")}</div></div></div>` : ui.editingAccount ? "" : `<div class="login-form"><h3>${state.accounts.length ? "添加另一个账户" : "连接第一个微信账户"}</h3>${accountForm(d, "login")}<div class="row">${button("start-login", ui.loading ? "正在获取二维码…" : "生成登录二维码", "wechat", "green", ui.loading ? "disabled" : "")}<span class="small muted">仅接收扫码账户的私聊消息</span></div></div>`}
      <div class="connection-footer">微信中发送 <b>/new</b> 开始新会话，<b>/status</b> 查看目录和模型。支持文字与已转写的语音。<br>保持本机和应用运行。${button("connection-models", "管理模型与 API", "external", "", 'style="font-size:11px;padding:2px 6px"')}</div></div></section></div>`;
  } else if (ui.overlay === "search" || ui.overlay === "history") {
    const query = ui.sessionSearch || "";
    const results = state.sessions.filter((s) =>
      `${s.title} ${s.workspace}`.toLowerCase().includes(query.toLowerCase()),
    );
    $("overlay").innerHTML =
      `<div class="overlay-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="会话历史" style="width:650px"><div class="modal-header">${icon("clock")}<h2>会话历史</h2><span class="grow"></span>${ib("close-overlay", "关闭", "close")}</div><div class="modal-body"><input id="session-search" aria-label="搜索会话历史" placeholder="搜索会话名称或目录…" value="${esc(query)}" style="width:100%"><div class="search-results">${results.map((s) => `<div class="row"><button class="search-result grow" data-action="select-session" data-id="${s.id}">${icon(s.source === "wechat" ? "wechat" : "new")}<div><strong class="small">${esc(s.title)}</strong><p>${esc(s.workspace)}</p></div></button>${ib("remove-session", "移除会话", "trash", `data-id="${s.id}" ${s.busy ? "disabled" : ""}`)}</div>`).join("") || '<p class="empty-note">没有找到会话。</p>'}</div></div></section></div>`;
  }
  enhancePickers($("overlay"));
}
function selectSession(id) {
  if (!state.sessions.some((s) => s.id === id)) return toast("该会话已不存在，请重新选择。");
  invalidatePanel();
  ui.active = id;
  viewStorage.setItem("active-session", id);
  ui.overlay = "";
  ui.page = "";
  ui.draft = "";
  ui.project = session()?.workspace || "";
  const p = state.projects.find((p) => sameWorkspace(p.workspace, ui.project));
  if (p) ui.expanded.add(p.id);
  render();
  renderOverlay();
  if (["files", "review"].includes(ui.panelPage)) loadPanel();
}
async function addProject() {
  const directory = await rpc("dialog.folder", {
    path: project()?.workspace || "",
  });
  if (!directory) return;
  state = await rpc("project.add", { workspace: directory });
  ui.project = directory;
  const p = state.projects.find((x) => sameWorkspace(x.workspace, directory));
  if (p) ui.expanded.add(p.id);
  render();
  return directory;
}
async function newSession(directory) {
  directory ||= session()?.workspace || ui.project || project()?.workspace;
  if (!directory) directory = await addProject();
  if (!directory) return;
  const s = await rpc("session.create", { workspace: directory });
  const result = await rpc("snapshot");
  state = result;
  selectSession(s.id);
}
async function refreshEnvironment(restart = false) {
  if (environmentRefresh) return environmentRefresh;
  environmentRefresh = checkEnvironment(restart);
  try { await environmentRefresh; } finally { environmentRefresh = null; }
}
async function checkEnvironment(restart) {
  const nodeWasReady = ui.runtime?.nodeReady;
  ui.checkingEnvironment = true;
  try {
    ui.runtime = await rpc("system.status");
    if (ui.runtime.nodeReady) {
      if (restart) await rpc("system.reload");
      const initial = await rpc("snapshot");
      state = initial;
      ui.login = initial.wechat?.login;
      ui.busyAccounts = initial.wechat?.busyAccounts || [];
      if (!state.sessions.some((s) => s.id === ui.active)) ui.active = state.sessions[0]?.id || "";
      const p = state.projects.find((p) => sameWorkspace(p.workspace, session()?.workspace));
      if (p) ui.expanded.add(p.id);
      ui.environment = await rpc("environment");
      ui.startupError = ui.environment.error || "";
      if (!nodeWasReady && !ui.environment.codexPath)
        toast("NodeJS 环境配置成功，Codex 未检测到配置");
    } else {
      ui.environment = null;
      ui.startupError = ui.runtime.nodeError || "";
    }
  } catch (e) {
    ui.environment = null;
    ui.startupError = e.message;
  } finally {
    ui.environmentChecked = true;
    ui.checkingEnvironment = false;
  }
  if (!environmentReady()) { ui.overlay = ""; renderOverlay(); }
  render();
}
async function updateComposer(change) {
  const s = session();
  if (s) await rpc("session.update", { id: s.id, ...change });
  else {
    const mapping = {
      providerId: "defaultProvider",
      model: "defaultModel",
      effort: "defaultEffort",
      permission: "defaultPermission",
    };
    const defaults = Object.fromEntries(
      Object.entries(change).map(([k, v]) => [mapping[k], v]),
    );
    state = await rpc("settings.save", defaults);
  }
  render();
}
async function send() {
  const text = ui.draft.trim();
  if (!text || !environmentReady()) return;
  if (!session()) await newSession();
  if (!session()) return;
  ui.draft = "";
  if (!session()?.busy) {
    ui.streams.delete(ui.active);
    ui.logs.delete(ui.active);
  }
  render();
  try {
    await rpc("chat.send", { sessionId: ui.active, text });
  } catch (e) {
    ui.draft = text;
    render();
    throw e;
  }
}
async function saveProvider() {
  const form = $("provider-form");
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const result = await rpc("provider.save", {
    id: ui.providerDraft.id,
    name: data.get("name"),
    baseUrl: data.get("baseUrl"),
    apiKey: data.get("apiKey"),
    clearKey: data.has("clearKey"),
    protocol: data.get("protocol"),
    reasoningParameter: data.get("reasoningParameter"),
    models: data.get("models").split(/[\r\n,]+/),
  });
  state = result.state;
  ui.providerDraft = null;
  render();
  catalog.refresh(result.providerId, true);
  toast("API 服务已保存，可在输入框或微信账户中选择。");
}
const external = {
  "install-node": "https://nodejs.org/zh-cn/download",
  "install-desktop": "https://chatgpt.com/download",
  "install-webview": "https://developer.microsoft.com/microsoft-edge/webview2/",
  "codex-docs": "https://developers.openai.com/codex/cli/",
  "source-wechat": "https://github.com/XavierJiezou/codex-weixin",
  "source-ui": "https://github.com/vastsa/pi-desktop",
};
async function action(name, element) {
  const id = element?.dataset.id;
  if (!environmentReady() && !name.startsWith("window.") && ![
    "runtime", "refresh-environment", "choose-node", "choose-codex", "save-codex-source", "open-desktop", "install-desktop",
    "install-node", "install-webview", "install-codex", "codex-docs", "login-codex", "open-data", "open-conversations", "restore-conversations",
  ].includes(name)) return;
  if (external[name]) return rpc("shell.open", { url: external[name] });
  if (name.startsWith("window.")) return rpc(name);
  switch (name) {
    case "scroll-bottom":
      $("chat-scroll").scrollTo({
        top: $("chat-scroll").scrollHeight,
        behavior: "smooth",
      });
      return;
    case "project-switch":
      return showContext(element, [
        ...state.projects.map((p) => ({
          label: p.name,
          icon: "folder",
          action: "choose-project",
          id: p.id,
        })),
        { label: "添加项目", icon: "plus", action: "add-project" },
      ]);
    case "choose-project":
      ui.project = state.projects.find((p) => p.id === id).workspace;
      ui.active = "";
      return render();
    case "home":
      ui.active = "";
      ui.page = "";
      ui.draft = "";
      return render();
    case "about":
      ui.page = "about";
      return render();
    case "composer-add":
      return showContext(element, [
        { label: "选择工作目录", icon: "folder", action: "add-project" },
        { label: "添加文件路径", icon: "file", action: "attach-file" },
      ]);
    case "attach-file": {
      const file = await rpc("dialog.file", { title: "选择要引用的文件" });
      if (file) {
        ui.draft += (ui.draft ? "\n" : "") + "请查看文件：" + file;
        render();
      }
      return;
    }
    case "session-menu":
      if (!id) return;
      return showContext(element, [
        { label: "在 Codex Desktop 中继续", icon: "external", action: "continue-desktop", id },
        { label: "重命名", icon: "file", action: "rename-session", id },
        { label: "复制会话内容", icon: "copy", action: "copy-session", id },
        { label: "移除会话", icon: "trash", action: "remove-session", id },
      ]);
    case "rename-session": {
      ui.renameSession = id;
      ui.overlay = "rename";
      return renderOverlay();
    }
    case "save-session-name":
      await rpc("session.update", {
        id: ui.renameSession,
        title: $("session-name").value,
      });
      ui.overlay = "";
      renderOverlay();
      return;
    case "copy-session":
      await copyText(
        state.sessions
          .find((s) => s.id === id)
          .messages.map((m) => m.role + ": " + m.text)
          .join("\n\n"),
      );
      return toast("会话已复制。");
    case "project-menu":
      return showContext(element, [
        { label: "新建会话", icon: "plus", action: "project-chat", id },
        { label: "绑定微信账号", icon: "wechat", action: "bind-project", id },
        {
          label: "在资源管理器中打开",
          icon: "folder",
          action: "open-project-folder",
          id,
        },
        { label: "从列表移除", icon: "trash", action: "remove-project", id },
      ]);
    case "notifications":
      ui.overlay = ui.overlay === "notifications" ? "" : "notifications";
      return renderOverlay();
    case "clear-notifications":
      ui.notifications = [];
      return renderOverlay();
    case "approval-allow":
    case "approval-deny": {
      const request = ui.approvals.get(id);
      if (request)
        await rpc("approval.respond", {
          sessionId: request.sessionId,
          requestId: request.requestId,
          allow: name === "approval-allow",
        });
      ui.approvals.delete(id);
      return render();
    }
    case "panel-new":
      invalidatePanel();
      ui.panel = true;
      ui.panelPage = "";
      ui.panelMax = false;
      return render();
    case "maximize-panel":
      ui.panel = true;
      ui.panelMax = !ui.panelMax;
      return render();
    case "panel-review":
    case "panel-files":
    case "panel-browser":
      ui.panelPage = name.slice(6);
      ui.panel = true;
      ui.filePreview = null;
      return loadPanel();
    case "panel-refresh":
      return loadPanel();
    case "file-open": {
      if (element.dataset.directory === "true")
        return loadPanel(element.dataset.file);
      const seq = ++ui.panelSeq, context = panelContext();
      ui.panelLoading = false;
      try {
        const preview = await rpc("workspace.read", {
          workspace: session()?.workspace || project()?.workspace,
          file: element.dataset.file,
        });
        if (seq !== ui.panelSeq || context !== panelContext()) return;
        ui.filePreview = preview;
        return render();
      } catch (error) {
        if (seq === ui.panelSeq && context === panelContext()) throw error;
      }
      return;
    }
    case "file-parent":
      return loadPanel(
        (ui.panelData?.directory || "").split(/[\\/]/).slice(0, -1).join("/"),
      );
    case "close-file":
      ui.panelSeq++;
      ui.filePreview = null;
      return render();
    case "open-browser": {
      let url = $("browser-form").elements.url.value.trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = /^[\w-]+(?:\.[\w-]+)+(?:[:/].*)?$/.test(url) || /^localhost[:/]/.test(url) ? `https://${url}` : `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      if (!session()) await newSession();
      if (!session()) return;
      return rpc("browser.open", { sessionId: session().id, url });
    }
    case "open-browser-window": {
      if (!session()) await newSession();
      if (!session()) return;
      ui.panel = true; ui.panelPage = "browser"; render();
      return rpc("browser.command", { sessionId: session().id, action: "state" });
    }
    case "browser-google":
      if (!session()) await newSession();
      if (session()) return rpc("browser.open", { sessionId: session().id, url: "https://www.google.com/" });
      return;
    case "browser-external": {
      const url = browserStates.get(session()?.id)?.url;
      if (url) return rpc("shell.open", { url });
      return;
    }
    case "browser-back": case "browser-forward": case "browser-reload": case "browser-stop":
    case "browser-newTab": case "browser-selectTab": case "browser-closeTab":
      if (!session()) await newSession();
      if (session()) return rpc("browser.command", { sessionId: session().id, action: name.slice(8), tabId: id });
      return;
    case "toggle-sidebar":
      ui.sidebar = !ui.sidebar;
      return render();
    case "toggle-panel":
      ui.panel = !ui.panel;
      return render();
    case "add-project":
      return addProject();
    case "new-session":
      return newSession();
    case "select-session":
      return selectSession(id);
    case "project-chat":
      return newSession(state.projects.find((p) => p.id === id)?.workspace);
    case "project-toggle": {
      const p = state.projects.find((p) => p.id === id);
      if (!p) return;
      const changed = !sameWorkspace(session()?.workspace || ui.project, p.workspace);
      ui.project = p.workspace;
      if (!sameWorkspace(session()?.workspace, p.workspace)) ui.active = "";
      if (changed) invalidatePanel();
      ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id);
      render();
      if (changed && ["files", "review"].includes(ui.panelPage)) loadPanel();
      return;
    }
    case "send":
      return send();
    case "stop":
      return rpc("chat.stop", { sessionId: ui.active });
    case "suggest":
      ui.draft = element.dataset.text;
      render();
      return $("composer-input")?.focus();
    case "open-folder": {
      const directory = session()?.workspace || project()?.workspace;
      if (!directory) return addProject();
      return rpc("shell.folder", { path: directory });
    }
    case "settings":
      ui.page = "general";
      ui.search = "";
      return render();
    case "runtime":
      ui.page = "runtime";
      render();
      return refreshEnvironment();
    case "settings-page":
      ui.page = element.dataset.page;
      render();
      if (ui.page === "runtime") await refreshEnvironment();
      return;
    case "return":
      ui.page = "";
      ui.search = "";
      return render();
    case "toggle-status":
      state = await rpc("settings.save", {
        showStatus: !state.settings.showStatus,
      });
      return render();
    case "toggle-preference":
      state = await rpc("settings.save", {
        [element.dataset.key]: !state.settings[element.dataset.key],
      });
      return render();
    case "set-font-size":
      state = await rpc("settings.save", {
        fontSize: Number(element.dataset.size),
      });
      return render();
    case "add-provider":
      ui.providerDraft = {
        name: "",
        baseUrl: "",
        protocol: "responses",
        apiKey: "",
        models: [],
        reasoningParameter: "effort",
      };
      render();
      return $("provider-form")?.scrollIntoView({ block: "nearest" });
    case "edit-provider":
      ui.providerDraft = { ...profile(id), apiKey: "" };
      render();
      return $("provider-form")?.scrollIntoView({ block: "nearest" });
    case "cancel-provider":
      ui.providerDraft = null;
      return render();
    case "save-provider":
      return saveProvider();
    case "remove-provider":
      state = await rpc("provider.remove", { id });
      ui.providerDraft = null;
      return render();
    case "test-provider": {
      element.disabled = true;
      toast("正在读取模型列表…");
      try {
        const r = await rpc("provider.test", { id });
        ui.models.set(id, r.models);
        render();
        toast(`${r.message} ${r.latency} ms`);
      } finally {
        element.disabled = false;
      }
      return;
    }
    case "save-defaults":
      state = await rpc("settings.save", {
        defaultProvider: $("default-provider").value,
        defaultModel: $("default-model").value.trim(),
        defaultEffort: $("default-effort").value,
        defaultPermission: $("default-permission").value,
      });
      render();
      return toast("新会话默认值已保存。");
    case "remove-project":
      state = await rpc("project.remove", { id });
      return render();
    case "open-project-folder":
      return rpc("shell.folder", {
        path: state.projects.find((p) => p.id === id).workspace,
      });
    case "refresh-environment":
      await refreshEnvironment(true);
      return toast(environmentReady() ? "环境配置成功。" : ui.runtime?.nodeReady ? "NodeJS 环境配置成功，Codex 未检测到配置" : "请先完成 NodeJS 安装。");
    case "continue-desktop": {
      if (ui.desktopHandoff) return;
      const target = id ? state.sessions.find((s) => s.id === id) : session();
      ui.desktopHandoff = true; render();
      try {
        const result = await rpc("desktop.continue", { sessionId: target?.id, workspace: target?.workspace || project()?.workspace });
        state = await rpc("snapshot");
        toast(result.message);
      } finally { ui.desktopHandoff = false; render(); }
      return;
    }
    case "open-desktop":
      return rpc("desktop.open", {});
    case "choose-node": {
      const file = await rpc("dialog.executable", { title: isMac ? "选择 Node.js 程序（node）" : "选择 node.exe" });
      if (file) {
        await rpc("system.nodePath", { path: file });
        await refreshEnvironment(true);
      }
      return;
    }
    case "choose-codex": {
      const file = await rpc("dialog.executable", {
        title: isMac ? "选择 Codex 程序或 codex.js" : "选择 codex.exe 或 npm 的 codex.cmd",
      });
      if (file) { ui.codexPathDraft = file; $("codex-path").value = file; }
      return;
    }
    case "save-codex-source": {
      if (ui.savingCodexSource) return;
      const source = $("codex-source").value;
      const configured = source === "custom" ? $("codex-path").value.trim() : "";
      ui.savingCodexSource = true;
      render();
      try {
        state = await rpc("settings.save", { codexSource: source, codexPath: configured });
        ui.codexSourceDraft = null;
        ui.codexPathDraft = null;
        await refreshEnvironment();
        await catalog.pending.get("local");
        await catalog.refresh("local", true);
        toast("Codex 来源已保存，后续任务使用新来源。");
      } finally { ui.savingCodexSource = false; render(); }
      return;
    }
    case "install-codex":
      if (ui.installingCodex || !ui.runtime?.nodeReady) return;
      ui.installingCodex = true;
      render();
      try {
        const r = await rpc("system.installCodex");
        toast(r.message);
        if (r.installed) await rpc("system.restart");
      } finally {
        ui.installingCodex = false;
        render();
      }
      return;
    case "login-codex":
      await rpc("system.loginCodex");
      return toast("已打开 Codex 登录窗口，按提示完成登录后返回。");
    case "open-data":
      return rpc("shell.folder", {
        path: ui.environment?.dataDir || ui.runtime?.dataDir,
      });
    case "open-conversations":
      return rpc("conversations.open");
    case "restore-conversations": {
      const result = await rpc("conversations.restore");
      state = await rpc("snapshot"); render();
      return toast(`已恢复 ${result.restored} 个对话。${result.providersMissing ? "部分模型服务需要重新配置。" : ""}`);
    }
    case "search":
    case "history":
      ui.overlay = name;
      ui.sessionSearch = "";
      renderOverlay();
      return $("session-search")?.focus();
    case "close-overlay":
      ui.overlay = "";
      return renderOverlay();
    case "remove-session":
      state = await rpc("session.remove", { id });
      if (ui.active === id) { ui.active = ""; invalidatePanel(); }
      render();
      return renderOverlay();
    case "copy-message": {
      const message = session()?.messages[Number(element.dataset.index)];
      if (!message) return toast("该回复已不存在，请重新打开会话。");
      await copyText(message.text || "");
      return toast("已复制回复。");
    }
    case "wechat":
      ui.overlay = "wechat";
      ui.editingAccount = "";
      ui.connectionDraft = defaultConnection();
      if (element?.dataset.projectId) {
        const p = state.projects.find((p) => p.id === element.dataset.projectId);
        if (p) ui.connectionDraft.workspace = p.workspace;
      }
      renderOverlay();
      {
        const r = await rpc("wechat.status");
        ui.login = r.login;
        ui.busyAccounts = r.busyAccounts;
        renderOverlay();
      }
      return;
    case "reveal-attachment":
      return rpc("attachment.reveal", { sessionId: session()?.id, message: Number(element.dataset.message), attachment: Number(element.dataset.attachment) });
    case "bind-project":
      ui.bindingProject = id;
      ui.overlay = "wechat-bind";
      renderOverlay();
      {
        const r = await rpc("wechat.status");
        ui.busyAccounts = r.busyAccounts;
        if (ui.overlay === "wechat-bind") renderOverlay();
      }
      return;
    case "bind-workspace-account": {
      if (ui.bindingAccount) return;
      const p = state.projects.find((p) => p.id === ui.bindingProject);
      const a = state.accounts.find((a) => a.id === id);
      if (!p || !a) throw new Error("项目或微信账号已移除，请重新选择。");
      ui.bindingAccount = id;
      renderOverlay();
      try {
        state = await rpc("wechat.update", { ...a, workspace: p.workspace });
        render();
        toast(`已将 ${a.name} 绑定到 ${p.name}。`);
      } finally {
        ui.bindingAccount = "";
        renderOverlay();
      }
      return;
    }
    case "connection-folder": {
      const directory = await rpc("dialog.folder", {
        path: ui.connectionDraft?.workspace || "",
      });
      if (directory) {
        ui.connectionDraft.workspace = directory;
        renderOverlay();
      }
      return;
    }
    case "start-login":
      ui.loading = true;
      renderOverlay();
      try {
        const r = await rpc("wechat.login", ui.connectionDraft);
        ui.login = r.login;
        ui.busyAccounts = r.busyAccounts;
      } finally {
        ui.loading = false;
        renderOverlay();
      }
      return;
    case "cancel-login": {
      const r = await rpc("wechat.cancel");
      ui.login = r.login;
      return renderOverlay();
    }
    case "retry-login":
      await rpc("wechat.cancel");
      ui.login = null;
      return action("start-login", element);
    case "verify-code":
      await rpc("wechat.verify", { code: $("verify-code").value.trim() });
      return toast("验证码已提交。");
    case "edit-account":
      ui.editingAccount = id;
      ui.connectionDraft = { ...state.accounts.find((a) => a.id === id) };
      return renderOverlay();
    case "reconnect-account":
      ui.editingAccount = "";
      ui.connectionDraft = { ...state.accounts.find((a) => a.id === id) };
      renderOverlay();
      return action("start-login", element);
    case "cancel-account-edit":
      ui.editingAccount = "";
      ui.connectionDraft = defaultConnection();
      return renderOverlay();
    case "save-account":
      state = await rpc("wechat.update", { ...ui.connectionDraft, id });
      ui.editingAccount = "";
      ui.connectionDraft = defaultConnection();
      render();
      renderOverlay();
      return toast("账户配置已保存。");
    case "pause-account": {
      const a = state.accounts.find((a) => a.id === id);
      state = await rpc("wechat.update", { ...a, paused: !a.paused });
      render();
      return renderOverlay();
    }
    case "disconnect-account":
      state = await rpc("wechat.disconnect", { id });
      render();
      return renderOverlay();
    case "account-session": {
      const account = state.accounts.find((a) => a.id === id);
      if (!account?.sessionId) return toast("该微信账户已不存在，请重新连接。");
      return selectSession(account.sessionId);
    }
    case "connection-models":
      ui.overlay = "";
      ui.page = "models";
      renderOverlay();
      return render();
  }
}
document.addEventListener("click", (event) => {
  if (event.target.classList.contains("overlay-backdrop")) {
    ui.overlay = "";
    renderOverlay();
    return;
  }
  const anchor = event.target.closest("a");
  if (anchor) {
    event.preventDefault();
    if (/^https?:/.test(anchor.href))
      rpc("shell.open", { url: anchor.href }).catch((e) => toast(e.message));
    return;
  }
  const element = event.target.closest("[data-action]");
  if (
    element?.closest(".session-row,.project-row") &&
    element.classList.contains("row-more")
  )
    event.stopPropagation();
  if (element) {
    event.preventDefault();
    if (element.disabled) return;
    Promise.resolve(action(element.dataset.action, element)).catch((e) =>
      toast(e.message),
    );
  }
});
document.addEventListener("pointerdown", (event) => {
  const edge = event.target.closest("[data-resize]");
  if (edge) {
    rpc("window.resize", { direction: edge.dataset.resize }).catch(() => {});
    return;
  }
  if (
    event.button === 0 &&
    event.target.closest("[data-drag]") &&
    !event.target.closest("button,input,select,a")
  )
    rpc("window.drag").catch(() => {});
});
document.addEventListener("dblclick", (event) => {
  if (event.target.closest("[data-drag]") && !event.target.closest("button"))
    rpc("window.maximize").catch(() => {});
});
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "codex-path") ui.codexPathDraft = el.value;
  if (el.id === "composer-input") {
    ui.draft = el.value;
    el.style.height = "auto";
    el.style.height = `${Math.min(180, Math.max(60, el.scrollHeight))}px`;
    document
      .querySelector(".send-button")
      ?.classList.toggle("empty", !el.value.trim() && !session()?.busy);
    const sendButton = document.querySelector(".send-button");
    if (sendButton) {
      const stopping = session()?.busy && !el.value.trim();
      sendButton.dataset.action = stopping ? "stop" : "send";
      sendButton.title = stopping ? "停止任务" : "发送任务";
      sendButton.setAttribute("aria-label", sendButton.title);
      sendButton.innerHTML = icon(stopping ? "stop" : "arrow");
    }
  }
  if (el.dataset.draft && ui.connectionDraft)
    ui.connectionDraft[el.dataset.draft] = el.dataset.draft === "allowedSenders" ? el.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : el.value;
  if (el.closest("#provider-form") && el.name && ui.providerDraft)
    ui.providerDraft[el.name] =
      el.name === "models" ? el.value.split(/[\r\n,]+/) : el.value;
  if (el.id === "settings-search") {
    const start = el.selectionStart;
    ui.search = el.value;
    render();
    $("settings-search")?.setSelectionRange(start, start);
  }
  if (el.id === "session-search") {
    const start = el.selectionStart;
    ui.sessionSearch = el.value;
    renderOverlay();
    $("session-search")?.focus();
    $("session-search")?.setSelectionRange(start, start);
  }
});
document.addEventListener("change", (event) => {
  const el = event.target;
  (async () => {
    if (el.id === "codex-source") {
      ui.codexSourceDraft = el.value;
      render();
    }
    if (el.id === "theme-setting") {
      state = await rpc("settings.save", { theme: el.value });
      render();
    }
    if (el.id === "font-family-setting") {
      state = await rpc("settings.save", { fontFamily: el.value });
      render();
    }
    if (el.id === "font-setting") {
      state = await rpc("settings.save", { fontSize: Number(el.value) });
      render();
    }
    if (el.id === "permission-select")
      await updateComposer({ permission: el.value });
    if (el.id === "effort-select") await updateComposer({ effort: el.value });
    if (el.id === "model-select")
      await updateComposer({ model: el.value, effort: "" });
    if (el.id === "provider-select") {
      const p = profile(el.value);
      await catalog.refresh(p.id, true);
      await updateComposer({
        providerId: p.id,
        model:
          p.type === "local"
            ? ""
            : ui.models.get(p.id)?.[0]?.model || p.models[0] || "",
        effort: "",
      });
    }
    if (el.id === "default-provider") {
      const p = profile(el.value);
      $("default-model").value = p.type === "local" ? "" : p.models[0] || "";
      $("default-model").dataset.modelProvider = p.id;
      $("default-effort").innerHTML = effortOptions(
        p.id,
        $("default-model").value,
        "",
      );
      refreshPickers();
      catalog.refresh(p.id, true);
    }
    if (el.id === "default-model") {
      $("default-effort").innerHTML = effortOptions(
        $("default-provider").value,
        el.value,
        "",
      );
      refreshPickers();
    }
    if (el.id === "agent-select") {
      const current = session()?.permission || state.settings.defaultPermission;
      const key = session()?.id || "default";
      const writable = ["auto", "ask", "accept-edits"];
      if (el.value === "read" && writable.includes(current)) ui.agentPermissions.set(key, current);
      await updateComposer({
        permission: el.value === "read" ? "read-only" : ui.agentPermissions.get(key) ||
          (writable.includes(state.settings.defaultPermission) ? state.settings.defaultPermission : "accept-edits"),
      });
    }
    if (el.dataset.draft === "providerId") {
      const p = profile(el.value);
      await catalog.refresh(p.id, true);
      ui.connectionDraft.model =
        p.type === "local"
          ? ""
          : ui.models.get(p.id)?.[0]?.model || p.models[0] || "";
      ui.connectionDraft.effort = "";
      renderOverlay();
    }
  })().catch((e) => toast(e.message));
});
document.addEventListener("keydown", (event) => {
  if (!environmentReady() && (event.ctrlKey || event.metaKey)) return;
  if (event.key === "Escape") {
    ui.overlay = "";
    renderOverlay();
    return;
  }
  if (
    event.key === "Tab" &&
    ui.overlay &&
    !document.querySelector(".picker-menu")
  ) {
    const focusable = [
      ...$("overlay").querySelectorAll(
        'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
      ),
    ].filter((el) => el.offsetParent !== null);
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
      event.preventDefault();
      focusable[0]?.focus();
    }
  }
  if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === "n") {
    event.preventDefault();
    newSession().catch((e) => toast(e.message));
  }
  if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    action("search").catch((e) => toast(e.message));
  }
  if (
    event.target.id === "composer-input" &&
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();
    send().catch((e) => toast(e.message));
  }
});
function onEvent(event, data) {
  if (event === "browser-state") {
    browserStates.set(data.owner, data);
    if (data.owner !== session()?.id) return;
    if (data.reveal && !ui.page && (!ui.panel || ui.panelPage !== "browser")) {
      ui.panel = true; ui.panelPage = "browser"; render();
    } else refreshBrowserPanel();
  } else if (event === "approval") {
    const key = `${data.sessionId}:${data.requestId}`;
    ui.approvals.set(key, { ...data, key });
    toast("Codex 正在等待操作确认。");
    render();
  } else if (event === "state") {
    const previous = new Map(state.sessions.map((s) => [s.id, s]));
    const beforePanel = panelContext();
    state = data;
    if (ui.active && !state.sessions.some((s) => s.id === ui.active)) {
      ui.active = "";
      viewStorage.removeItem("active-session");
    }
    for (const s of state.sessions)
      if (!s.busy) {
        ui.streams.delete(s.id);
        ui.activities.delete(s.id);
        for (const [id, a] of ui.approvals)
          if (a.sessionId === s.id) ui.approvals.delete(id);
      }
    for (const completed of state.sessions.filter((s) => previous.get(s.id)?.busy && !s.busy)) {
      ui.notifications.unshift({
        title: completed.title || "任务完成",
        at: new Date().toISOString(),
        sessionId: completed.id,
      });
    }
    const panelChanged = beforePanel !== panelContext();
    if (panelChanged) invalidatePanel();
    render();
    if (["wechat", "wechat-bind", "history", "notifications"].includes(ui.overlay)) renderOverlay();
    if (panelChanged && ["files", "review"].includes(ui.panelPage)) loadPanel();
  } else if (event === "wechat") {
    const wasLogin = ui.login;
    ui.login = data.login;
    ui.busyAccounts = data.busyAccounts;
    if (wasLogin && !ui.login) {
      ui.connectionDraft = defaultConnection();
      toast("微信账户已连接。");
    }
    if (ui.overlay === "wechat" || ui.overlay === "wechat-bind") renderOverlay();
  } else if (event === "codex") {
    const p = data.params;
    const id = data.sessionId;
    if (data.method === "thread/tokenUsage/updated") {
      const s = state.sessions.find((s) => s.id === id);
      if (s) s.tokenUsage = p.tokenUsage;
    }
    if (data.method === "turn/completed")
      for (const [key, approval] of ui.approvals)
        if (approval.sessionId === id) ui.approvals.delete(key);
    if (data.method === "item/agentMessage/delta")
      ui.streams.set(id, (ui.streams.get(id) || "") + p.delta);
    if (data.method === "item/completed" && p.item?.type === "agentMessage")
      ui.streams.delete(id);
    if (data.method === "item/started") {
      const item = p.item;
      if (item.type === "agentMessage") ui.streams.set(id, "");
      const activity = {
        commandExecution: "正在运行命令",
        fileChange: "正在编辑文件",
        reasoning: "正在思考",
        mcpToolCall: "正在调用工具",
        webSearch: "正在搜索",
      }[item.type];
      if (activity) {
        ui.activities.set(id, activity);
        if (item.command) {
          const log = ui.logs.get(id) || [];
          log.push(item.command);
          ui.logs.set(id, log.slice(-60));
        }
      }
    }
    if (data.method === "item/completed" && p.item?.type === "fileChange") {
      const log = ui.logs.get(id) || [];
      for (const change of p.item.changes || [])
        log.push(`${change.kind?.type || "编辑"} ${change.path}`);
      ui.logs.set(id, log.slice(-60));
    }
    if (id === ui.active && !ui.page && !ui.renderTimer)
      ui.renderTimer = setTimeout(() => {
        ui.renderTimer = null;
        render();
      }, 80);
  } else if (event === "activity") {
    ui.activities.set(data.sessionId, data.text);
    if (data.sessionId === ui.active) render();
  } else if (
    event === "fatal" ||
    event === "backend-exit"
  ) {
    ui.startupError = String(data);
    ui.environment = null;
    render();
  } else if (event === "backend-error" || event === "backend-warning") toast(String(data));
  else if (event === "task-error") {
    ui.notifications.unshift({
      title: data.error,
      at: new Date().toISOString(),
      sessionId: data.sessionId,
    });
    toast(data.error);
  } else if (event === "install") toast(data);
}
nativeBridge?.addEventListener("message", (event) => {
  const message = event.data;
  if (message.kind === "event") {
    onEvent(message.event, message.data);
    return;
  }
  const item = pending.get(message.id);
  if (!item) return;
  clearTimeout(item.timer);
  pending.delete(message.id);
  message.error
    ? item.reject(new Error(message.error))
    : item.resolve(message.result);
});
matchMedia("(prefers-color-scheme:dark)").addEventListener(
  "change",
  applyTheme,
);
render();
(async () => {
    await refreshEnvironment();
    if (environmentReady())
    for (const p of state.providers)
      catalog.refresh(p.id, true);
})().catch((e) => {
  ui.startupError = e.message;
  render();
});

function showContext(anchor, items) {
  document.querySelector(".context-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = items
    .map(
      (item) =>
        '<button role="menuitem" data-action="' +
        item.action +
        '" data-id="' +
        esc(item.id || "") +
        '">' +
        icon(item.icon) +
        "<span>" +
        esc(item.label) +
        "</span></button>",
    )
    .join("");
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.min(innerWidth - menu.offsetWidth - 8, r.left) + "px";
  menu.style.top =
    Math.min(innerHeight - menu.offsetHeight - 8, r.bottom + 4) + "px";
  menu.querySelector("button")?.focus();
}
document.addEventListener("click", (e) => {
  if (
    !e.target.closest(
      '.row-more,.project-tools,.conversation-title,[data-action="composer-add"]',
    )
  )
    document.querySelector(".context-menu")?.remove();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.querySelector(".context-menu")?.remove();
});
function panelContext() {
  return JSON.stringify([ui.active, workspaceKey(session()?.workspace || project()?.workspace), ui.panelPage]);
}
function invalidatePanel() {
  ui.panelSeq++;
  ui.panelLoading = false;
  ui.panelData = null;
  ui.filePreview = null;
  ui.panelError = "";
}
async function loadPanel(directory = "") {
  const seq = ++ui.panelSeq, context = panelContext();
  if (!["files", "review"].includes(ui.panelPage)) {
    ui.panelLoading = false;
    render();
    return;
  }
  const workspace = session()?.workspace || project()?.workspace;
  if (!workspace) {
    ui.panelLoading = false;
    ui.panelError = "请先选择工作目录。";
    render();
    return;
  }
  ui.panelLoading = true;
  ui.panelError = "";
  render();
  try {
    const data = await rpc(
      ui.panelPage === "review" ? "workspace.diff" : "workspace.list",
      { workspace, directory },
    );
    if (seq !== ui.panelSeq || context !== panelContext()) return;
    ui.panelData = data;
  } catch (e) {
    if (seq !== ui.panelSeq || context !== panelContext()) return;
    ui.panelError = e.message;
  }
  if (seq !== ui.panelSeq || context !== panelContext()) return;
  ui.panelLoading = false;
  render();
}
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".sidebar-splitter")) return;
  e.preventDefault();
  const splitter = e.target.closest(".sidebar-splitter");
  splitter.setPointerCapture(e.pointerId);
  const move = (event) => {
    const width = Math.max(220, Math.min(520, event.clientX));
    document.documentElement.style.setProperty("--sidebar-width", width + "px");
    viewStorage.setItem("sidebar-width", String(width));
  };
  const done = () => {
    splitter.removeEventListener("pointermove", move);
    splitter.removeEventListener("pointerup", done);
    splitter.removeEventListener("pointercancel", done);
    splitter.removeEventListener("lostpointercapture", done);
    window.removeEventListener("blur", done);
    if (splitter.hasPointerCapture(e.pointerId)) splitter.releasePointerCapture(e.pointerId);
  };
  splitter.addEventListener("pointermove", move);
  splitter.addEventListener("pointerup", done);
  splitter.addEventListener("pointercancel", done);
  splitter.addEventListener("lostpointercapture", done);
  window.addEventListener("blur", done);
});
document.documentElement.style.setProperty(
  "--sidebar-width",
  (Number(viewStorage.getItem("sidebar-width")) || 275) + "px",
);
window.addEventListener("focus", () => {
  if (!environmentReady()) {
    if (ui.page === "runtime" && !ui.installingCodex) refreshEnvironment();
    return;
  }
  const id = session()?.providerId || state.settings.defaultProvider;
  catalog.refresh(id);
});
setInterval(
  () => {
    if (environmentReady() && document.visibilityState === "visible")
      for (const id of new Set([session()?.providerId, state.settings.defaultProvider].filter(Boolean))) catalog.refresh(id);
  },
  5 * 60 * 1000,
);
setInterval(() => {
  if (ui.page === "runtime" && !environmentReady() && !ui.installingCodex)
    refreshEnvironment();
}, 5000);

function runSummary(stats) {
  const seconds = Math.round((stats.durationMs || 0) / 1000);
  const duration =
    seconds >= 60
      ? Math.floor(seconds / 60) + "m " + (seconds % 60) + "s"
      : seconds + "s";
  return (
    '<details class="run-summary"><summary>' +
    icon("spark") +
    "运行完成 · " +
    duration +
    " · " +
    stats.tools +
    " 个工具 " +
    icon("chevron") +
    "</summary><pre>" +
    esc((stats.actions || []).join("\n") || "没有工具调用") +
    "</pre></details>"
  );
}
function contextUsage(s) {
  const tokens = s?.tokenUsage;
  if (!tokens?.modelContextWindow) return "";
  const used = tokens.total?.totalTokens || tokens.last?.inputTokens || 0;
  const percent = Math.min(
    100,
    Math.round((used / tokens.modelContextWindow) * 100),
  );
  return (
    '<span class="context-usage" title="上下文已用 ' +
    used.toLocaleString() +
    " / " +
    tokens.modelContextWindow.toLocaleString() +
    ' tokens"><span class="context-ring" style="--context-percent:' +
    percent +
    '%"></span>' +
    percent +
    "%</span>"
  );
}

document.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "browser-form")
    action("open-browser").catch((e) => toast(e.message));
  else if (event.target.id === "provider-form")
    saveProvider().catch((e) => toast(e.message));
});

// Native web content must track the HTML viewport and hide beneath app menus.
new MutationObserver(scheduleBrowserView).observe(document.body, { childList: true, subtree: true });
window.addEventListener("resize", scheduleBrowserView);
scheduleBrowserView();
