import { icon } from "./icons.mjs";

const literal = (query, all = false) => new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), all ? "giu" : "iu");
const attachmentNames = message => (message.attachments || []).map(a => a.label || a.path?.split(/[\\/]/).pop() || "附件").join("、");
const identity = message => JSON.stringify([message?.role, message?.text, message?.at, attachmentNames(message || {})]);
const element = (tag, className, text) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function marked(node, text, query) {
  if (!query) { node.textContent = text; return; }
  const pattern = literal(query, true); let end = 0;
  for (const match of text.matchAll(pattern)) {
    node.append(document.createTextNode(text.slice(end, match.index)), element("mark", "", match[0]));
    end = match.index + match[0].length;
  }
  node.append(document.createTextNode(text.slice(end)));
}
function excerpt(text, query) {
  const index = query ? literal(query).exec(text)?.index || 0 : 0;
  let start = Math.max(0, index - 45), end = Math.min(text.length, Math.max(start + 180, index + query.length + 45));
  if (start && /[\uDC00-\uDFFF]/.test(text[start])) start--;
  if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) end++;
  return `${start ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

// Read-only search over the saved messages. No model or provider is involved.
export function searchSessions(sessions, value) {
  const query = value.trim(), pattern = query ? literal(query) : null, results = [];
  const ordered = [...sessions].sort((a, b) => (Date.parse(b.updatedAt || b.messages.at(-1)?.at || b.createdAt) || 0) - (Date.parse(a.updatedAt || a.messages.at(-1)?.at || a.createdAt) || 0));
  for (const session of ordered) {
    if (!pattern || pattern.test(`${session.title}\n${session.workspace}`))
      results.push({ key: `${session.id}:session`, sessionId: session.id, title: session.title || "未命名会话", workspace: session.workspace, text: "", index: null });
    if (!pattern) continue;
    session.messages.forEach((message, index) => {
      const text = [message.text || "", attachmentNames(message)].filter(Boolean).join("\n附件：");
      if (pattern.test(text)) results.push({ key: `${session.id}:${index}`, sessionId: session.id, title: session.title || "未命名会话", workspace: session.workspace,
        text, index, role: message.role, kind: message.kind, at: message.at, identity: identity(message) });
    });
  }
  return results;
}

export class SessionSearch {
  constructor({ sessions, select, reveal, dismiss, error }) {
    Object.assign(this, { sessions, select, reveal, dismiss, error });
    document.addEventListener("keydown", event => this.key(event), true);
  }
  open(mode) {
    this.opener = document.activeElement;
    this.openerId = this.opener?.id;
    const action = this.opener?.closest("[data-action]");
    this.openerAction = action ? [action.dataset.action, action.dataset.id] : null;
    this.mode = mode; this.query = ""; this.limit = 60; this.popup?.remove(); this.popup = null;
  }
  close() {
    this.dismiss();
    const [action, id] = this.openerAction || [];
    const target = this.opener?.isConnected ? this.opener : document.getElementById(this.openerId) ||
      (action && document.querySelector(`[data-action="${CSS.escape(action)}"]${id ? `[data-id="${CSS.escape(id)}"]` : ""}`));
    target?.focus({ preventScroll: true });
  }
  hide() { this.popup?.remove(); this.popup = null; }
  render(host, mode) {
    if (!this.popup?.isConnected || this.mode !== mode) {
      this.mode = mode;
      const backdrop = element("div", "overlay-backdrop"), popup = this.popup = element("section", "modal session-search-modal");
      this.rendered = null;
      popup.setAttribute("role", "dialog"); popup.setAttribute("aria-modal", "true"); popup.setAttribute("aria-label", mode === "history" ? "会话历史" : "搜索会话");
      const header = element("div", "modal-header"); header.innerHTML = icon(mode === "history" ? "clock" : "search");
      header.append(element("h2", "grow", mode === "history" ? "会话历史" : "搜索会话"));
      const close = element("button", "icon-button"); close.type = "button"; close.innerHTML = icon("close"); close.setAttribute("aria-label", "关闭搜索"); close.addEventListener("click", () => this.close()); header.append(close);
      const body = element("div", "modal-body"), input = this.input = element("input", "");
      input.id = "session-search"; input.type = "search"; input.maxLength = 512; input.placeholder = "搜索名称、目录、消息或附件…";
      input.setAttribute("aria-label", "搜索会话名称、目录、消息和附件"); input.setAttribute("aria-controls", "session-search-results"); input.value = this.query || "";
      input.addEventListener("input", () => { this.query = input.value; this.limit = 60; this.update(); });
      this.summary = element("p", "search-summary"); this.summary.setAttribute("role", "status");
      this.list = element("div", "search-results"); this.list.id = "session-search-results"; this.list.setAttribute("role", "list");
      this.more = element("button", "outline search-more"); this.more.type = "button";
      this.more.addEventListener("click", () => { const offset = this.list.scrollTop; this.limit += 60; this.update(); this.list.scrollTop = offset; });
      body.append(input, this.summary, this.list, this.more); popup.append(header, body); backdrop.append(popup); host.replaceChildren(backdrop);
    }
    this.update();
  }
  update() {
    const focused = document.activeElement?.dataset.searchKey, scroll = this.list.scrollTop;
    this.results = searchSessions(this.sessions(), this.query || "");
    const query = (this.query || "").trim(), visible = this.results.slice(0, this.limit), fragment = document.createDocumentFragment();
    const rows = visible.map(r => ({ ...r, busy: Boolean(this.sessions().find(s => s.id === r.sessionId)?.busy) }));
    const prior = this.rendered;
    if (prior && prior.query === query && prior.total === this.results.length && prior.rows.length === rows.length &&
        rows.every((row, i) => Object.keys(row).every(key => row[key] === prior.rows[i][key]))) return;
    this.rendered = { query, total: this.results.length, rows };
    for (const result of visible) {
      const row = element("div", "search-row"); row.setAttribute("role", "listitem");
      const button = element("button", "search-result grow"); button.type = "button"; button.dataset.searchKey = result.key;
      const content = element("span", "search-result-content"), title = element("strong", "search-title"); marked(title, result.title, query);
      const path = element("span", "search-path"); marked(path, result.workspace || "", query); path.title = result.workspace || "";
      content.append(title, path);
      if (result.index !== null) {
        const label = result.role === "user" ? "你" : result.kind === "progress" ? "过程" : result.role === "assistant" ? "Codex" : "系统";
        const snippet = element("span", "search-snippet"), text = element("span", ""); marked(text, excerpt(result.text, query), query);
        snippet.append(element("small", "search-role", label), text); content.append(snippet);
      }
      button.innerHTML = icon(result.index === null ? "clock" : result.role === "user" ? "new" : "spark"); button.append(content);
      button.addEventListener("click", () => this.activate(result)); row.append(button);
      if (result.index === null) {
        const remove = element("button", "icon-button"); remove.type = "button"; remove.innerHTML = icon("trash");
        remove.dataset.action = "remove-session"; remove.dataset.id = result.sessionId;
        remove.setAttribute("aria-label", `移除会话：${result.title}`);
        remove.disabled = Boolean(this.sessions().find(s => s.id === result.sessionId)?.busy); row.append(remove);
      }
      fragment.append(row);
    }
    if (!visible.length) fragment.append(element("p", "empty-note", query ? "没有找到匹配的会话或消息。" : "还没有会话。"));
    this.list.replaceChildren(fragment); this.list.scrollTop = scroll;
    this.summary.textContent = query ? `找到 ${this.results.length} 条结果 · 按 ↑ ↓ 选择，Enter 打开` : `${this.results.length} 个会话 · 最近更新在前`;
    this.more.hidden = this.limit >= this.results.length; this.more.textContent = `再显示 ${Math.min(60, this.results.length - this.limit)} 条结果`;
    if (focused) (this.list.querySelector(`[data-search-key="${CSS.escape(focused)}"]`) || this.input).focus({ preventScroll: true });
  }
  activate(result) {
    const session = this.sessions().find(s => s.id === result.sessionId), message = session?.messages[result.index];
    if (!session || result.index !== null && identity(message) !== result.identity) {
      this.update(); this.error("该搜索结果已变化，请重新选择。"); return;
    }
    this.select(session.id);
    if (result.index !== null) this.reveal(result.index);
  }
  key(event) {
    if (!this.popup?.isConnected || !this.popup.contains(event.target) || event.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); return this.close(); }
    const buttons = [...this.list.querySelectorAll("[data-search-key]")], index = buttons.indexOf(document.activeElement);
    if (event.key === "Enter" && event.target === this.input) { event.preventDefault(); event.stopImmediatePropagation(); return buttons[0]?.click(); }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey || ["Home", "End"].includes(event.key) && event.target === this.input) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : index < 0 ? event.key === "ArrowUp" ? buttons.length - 1 : 0 : (index + (event.key === "ArrowUp" ? buttons.length - 1 : 1)) % buttons.length;
    buttons[next]?.focus({ preventScroll: true }); buttons[next]?.scrollIntoView({ block: "nearest" });
  }
}

export class MessageFind {
  constructor({ current, root, view, documentMode = false, changed = () => {}, active = () => true }) {
    Object.assign(this, { current, root, view, documentMode, changed, isActive: active });
    this.resize = new ResizeObserver(() => this.position());
    document.addEventListener("keydown", event => this.key(event), true);
    window.addEventListener("resize", () => this.position());
  }
  open() {
    const session = this.current(), root = this.root();
    if (!session || !root) return;
    this.view.closeOutline(); document.querySelector(".context-menu")?.remove();
    if (!this.bar?.isConnected) {
      this.owner = session.id; this.opener = document.activeElement; this.query = ""; this.active = 0;
      const bar = this.bar = element("section", `message-find${this.documentMode ? " document-find" : ""}`); bar.setAttribute("role", "search"); bar.setAttribute("aria-label", this.documentMode ? "在当前文件中查找" : "在当前会话中查找");
      const input = this.input = element("input", ""); input.type = "search"; input.maxLength = 512; input.placeholder = this.documentMode ? "查找此文件…" : "查找此会话…"; input.setAttribute("aria-label", this.documentMode ? "查找当前文件内容" : "查找当前会话内容");
      this.count = element("span", "message-find-count"); this.count.setAttribute("role", "status");
      input.addEventListener("input", () => { this.query = input.value; this.active = 0; this.paint(true); });
      const control = (label, glyph, action) => { const b = element("button", "icon-button"); b.type = "button"; b.setAttribute("aria-label", label); b.title = label; b.innerHTML = glyph; b.addEventListener("click", action); return b; };
      this.previous = control("上一个匹配（Shift+Enter）", "↑", () => this.step(-1)); this.next = control("下一个匹配（Enter）", "↓", () => this.step(1));
      bar.append(input, this.count, this.previous, this.next, control("关闭查找（Esc）", icon("close"), () => this.close())); document.body.append(bar);
      this.paint(false);
    }
    this.position(); this.input.focus({ preventScroll: true }); this.input.select();
    this.resize.disconnect(); this.resize.observe(root); this.observed = root;
  }
  clear() {
    for (const mark of this.root()?.querySelectorAll("mark[data-message-find]") || []) { const parent = mark.parentNode; mark.replaceWith(...mark.childNodes); parent.normalize(); }
  }
  close(restore = true) {
    const open = this.bar?.isConnected; this.clear(); this.bar?.remove(); this.bar = null; this.resize.disconnect();
    if (open && restore) (this.opener?.isConnected ? this.opener : this.documentMode ? this.root() : document.querySelector("#composer-input"))?.focus({ preventScroll: true });
    this.changed();
  }
  refresh() {
    if (!this.bar?.isConnected) return;
    if (this.current()?.id !== this.owner || !this.root()) return this.close(false);
    if (this.observed !== this.root()) { this.resize.disconnect(); this.resize.observe(this.root()); this.observed = this.root(); }
    this.paint(false); this.position();
  }
  textNodes(article) {
    const nodes = []; let previousBlock;
    for (const part of this.documentMode ? [article] : article.querySelectorAll(".message-content,.attachment-name")) {
      const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest(".message-expand,.website-meta,.website-open") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      while (walker.nextNode()) {
        const node = walker.currentNode, block = node.parentElement.closest("p,div,pre,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,.website-card") || part;
        // Inline formatting remains contiguous; separate paragraphs and
        // attachment labels must not manufacture a word spanning two blocks.
        if (nodes.length && block !== previousBlock) nodes.push(document.createTextNode("\n"));
        nodes.push(node); previousBlock = block;
      }
    }
    return nodes;
  }
  paint(move) {
    this.clear(); const query = this.documentMode ? this.query : this.query.trim(); this.groups = []; this.total = 0;
    if (query) for (const article of this.documentMode ? [this.root()] : this.root().querySelectorAll("[data-message-index]")) {
      const text = this.textNodes(article).map(n => n.data).join(""), positions = [];
      for (const match of text.matchAll(literal(query, true))) positions.push(match.index, match.index + match[0].length);
      if (positions.length) { this.groups.push({ article, positions, first: this.total }); this.total += positions.length / 2; }
    }
    this.active = Math.min(this.active, Math.max(0, this.total - 1)); this.show(move);
  }
  show(move) {
    this.clear();
    this.count.textContent = (this.documentMode ? this.query : this.query.trim()) ? `${this.total ? this.active + 1 : 0}/${this.total}` : "";
    this.previous.disabled = this.next.disabled = !this.total;
    this.changed();
    const group = this.groups.find(g => this.active >= g.first && this.active < g.first + g.positions.length / 2);
    if (!group) return;
    const local = this.active - group.first, matches = [], nodes = this.textNodes(group.article);
    // Count every occurrence, but decorate a bounded neighborhood in the active
    // message. A common word in a large conversation must not create 100k marks.
    for (let i = Math.max(0, local - 100); i < Math.min(group.positions.length / 2, local + 101); i++)
      matches.push({ start: group.positions[i * 2], end: group.positions[i * 2 + 1], active: i === local, marks: [] });
    let offset = nodes.reduce((n, node) => n + node.length, 0);
    for (const node of nodes.reverse()) {
      offset -= node.length;
      if (!node.parentNode) continue;
      for (const match of [...matches].reverse()) {
        const start = Math.max(0, match.start - offset), end = Math.min(node.length, match.end - offset);
        if (end <= start) continue;
        const middle = node.splitText(start); middle.splitText(end - start);
        const mark = element("mark", match.active ? "current-match" : ""); mark.dataset.messageFind = "";
        middle.replaceWith(mark); mark.append(middle); match.marks.unshift(mark);
      }
    }
    if (move) {
      this.view.reveal(Number(group.article.dataset.messageIndex), false);
      const first = matches.find(m => m.active)?.marks[0], root = this.root();
      if (first) {
        const match = first.getBoundingClientRect(), viewport = root.getBoundingClientRect();
        root.scrollTop += match.top - viewport.top - root.clientHeight / 2;
        if (this.documentMode && root.scrollWidth > root.clientWidth) root.scrollLeft += match.left - viewport.left - root.clientWidth / 2;
      }
      this.view.captureReading();
    }
  }
  step(direction) {
    if (!this.total) return;
    this.active = (this.active + direction + this.total) % this.total; this.show(true);
  }
  position() {
    if (!this.bar?.isConnected || !this.root()) return;
    const r = this.root().getBoundingClientRect(), panel = document.querySelector(".work-panel")?.getBoundingClientRect();
    const right = !this.documentMode && panel && panel.left < r.right && panel.right > r.left && panel.bottom > r.top && panel.top < r.bottom ? Math.min(r.right, panel.left - 6) : r.right;
    this.bar.hidden = right - r.left < 180;
    if (this.bar.hidden) {
      if (this.bar.contains(document.activeElement)) document.querySelector('.work-panel [data-action="close-panel"]')?.focus({ preventScroll: true });
      return;
    }
    this.bar.style.width = `${Math.min(380, right - r.left - 16)}px`; this.bar.style.left = `${right - this.bar.offsetWidth - 8}px`; this.bar.style.top = `${r.top + 8}px`;
  }
  key(event) {
    if (!this.bar?.isConnected || this.bar.hidden || event.isComposing || document.querySelector(".overlay-backdrop,.context-menu,.application-menu-popup")) return;
    const next = event.key === "F3" || (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g" || event.key === "Enter" && this.bar.contains(event.target);
    if (event.key !== "Escape" && !next) return;
    if (next && !this.isActive()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === "Escape") this.close(!this.documentMode || Boolean(event.target.closest(".document-panel,.document-find"))); else this.step(event.shiftKey ? -1 : 1);
  }
}
