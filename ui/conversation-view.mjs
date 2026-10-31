// Presentation state only. No message, task or provider data is changed here.
export class ConversationView {
  constructor({ sessions, current, root }) {
    Object.assign(this, { sessions, current, root });
    this.folds = new Map();
    this.reading = new Map();
    this.resize = new ResizeObserver(() => {
      this.captureReading();
      this.updateFolds();
      this.restoreReading();
      this.positionOutline();
    });
    document.addEventListener("pointerdown", event => {
      if (!event.target.closest('.conversation-outline,[data-action="conversation-outline"]')) this.closeOutline();
    });
    document.addEventListener("keydown", event => this.key(event), true);
    window.addEventListener("resize", () => this.positionOutline());
  }
  expanded(session, index, text) {
    return this.folds.get(session)?.has(index) && this.folds.get(session).get(index) === text || false;
  }
  toggleMessage(index) {
    const session = this.current(), message = session?.messages[index];
    const root = this.root(), article = root?.querySelector(`[data-message-index="${index}"]`);
    if (!message || message.role !== "user" || !article || root.dataset.session !== session.id) return;
    const entries = this.folds.get(session.id) || new Map();
    if (entries.get(index) === message.text) entries.delete(index);
    else entries.set(index, message.text);
    this.folds.set(session.id, entries);
    const previous = root.scrollTop;
    this.updateFolds();
    root.scrollTop = previous;
    // Collapsing a long message must leave its remaining bubble in view.
    if (article.getBoundingClientRect().bottom < root.getBoundingClientRect().top + 24)
      root.scrollTop += article.getBoundingClientRect().top - root.getBoundingClientRect().top - 16;
    this.captureReading();
  }
  reveal(index, focus = true) {
    const session = this.current(), root = this.root(), message = session?.messages[index];
    const article = root?.querySelector(`[data-message-index="${index}"]`);
    if (!message || !article || root.dataset.session !== session.id) return false;
    if (message.role === "user") {
      const entries = this.folds.get(session.id) || new Map();
      entries.set(index, message.text); this.folds.set(session.id, entries); this.updateFolds();
    }
    root.scrollTop += article.getBoundingClientRect().top - root.getBoundingClientRect().top - 16;
    if (focus) article.focus({ preventScroll: true });
    this.captureReading();
    return true;
  }
  updateFolds() {
    const root = this.root();
    if (!root) return;
    const session = this.sessions().find(s => s.id === root.dataset.session);
    for (const content of root.querySelectorAll(".user-message-content")) {
      const text = content.querySelector(".user-message-text"), button = content.querySelector(".message-expand");
      const index = Number(content.closest("[data-message-index]").dataset.messageIndex);
      const message = session?.messages[index];
      const expanded = this.expanded(root.dataset.session, index, message?.text);
      const limit = (Number.parseFloat(getComputedStyle(text).lineHeight) || 22) * 8;
      if (text.style.getPropertyValue("--message-fold-height") !== `${limit}px`) text.style.setProperty("--message-fold-height", `${limit}px`);
      // scrollHeight measures the full text even while max-height clips it.
      const foldable = text.scrollHeight > limit + 2;
      text.classList.toggle("is-collapsed", foldable && !expanded);
      button.hidden = !foldable;
      button.setAttribute("aria-expanded", String(expanded));
      const label = expanded ? "收起" : "显示更多";
      if (button.querySelector("span").textContent !== label) button.querySelector("span").textContent = label;
    }
  }
  captureReading() {
    const root = this.root(), session = this.sessions().find(s => s.id === root?.dataset.session);
    if (!session) return;
    const top = root.getBoundingClientRect().top;
    const article = [...root.querySelectorAll("[data-message-index]")].find(e => e.getBoundingClientRect().bottom > top + 8);
    const index = Number(article?.dataset.messageIndex), message = session.messages[index];
    this.reading.set(session.id, {
      atBottom: root.scrollHeight - root.scrollTop - root.clientHeight < 90,
      scrollTop: root.scrollTop, index, text: message?.text, at: message?.at,
      offset: article ? article.getBoundingClientRect().top - top : 0,
    });
  }
  restoreReading() {
    const root = this.root();
    if (!root) return;
    const saved = this.reading.get(root.dataset.session);
    if (!saved || saved.atBottom) { root.scrollTop = root.scrollHeight; return; }
    root.scrollTop = saved.scrollTop;
    const message = this.sessions().find(s => s.id === root.dataset.session)?.messages[saved.index];
    const article = root.querySelector(`[data-message-index="${saved.index}"]`);
    if (article && message?.text === saved.text && message?.at === saved.at)
      root.scrollTop += article.getBoundingClientRect().top - root.getBoundingClientRect().top - saved.offset;
  }
  refresh() {
    for (const id of this.folds.keys()) {
      const session = this.sessions().find(s => s.id === id);
      if (!session) { this.folds.delete(id); continue; }
      for (const [index, text] of this.folds.get(id))
        if (session.messages[index]?.role !== "user" || session.messages[index]?.text !== text) this.folds.get(id).delete(index);
    }
    for (const id of this.reading.keys()) if (!this.sessions().some(s => s.id === id)) this.reading.delete(id);
    const root = this.root();
    if (root !== this.observed) {
      this.resize.disconnect();
      if (root) this.resize.observe(root);
      this.observed = root;
    }
    this.updateFolds();
    if (!this.popup?.isConnected || !root || this.owner !== this.current()?.id) this.closeOutline();
    else { this.fillOutline(); this.positionOutline(); }
  }
  toggleOutline() {
    if (this.popup?.isConnected) return this.closeOutline(true);
    const session = this.current(), anchor = document.querySelector('[data-action="conversation-outline"]');
    if (!session || !anchor) return;
    document.querySelector(".context-menu")?.remove();
    const popup = this.popup = document.createElement("section");
    popup.className = "context-menu conversation-outline";
    popup.setAttribute("role", "dialog"); popup.setAttribute("aria-label", "会话目录");
    popup.innerHTML = '<header><strong>会话目录</strong><button type="button" class="icon-button" aria-label="关闭会话目录">×</button></header><input type="search" aria-label="搜索当前会话的提问" placeholder="搜索此会话的提问…"><div class="conversation-outline-list"></div>';
    this.owner = session.id; this.signature = null;
    popup.querySelector("header button").addEventListener("click", () => this.closeOutline(true));
    popup.querySelector("input").addEventListener("input", () => this.fillOutline());
    document.body.append(popup);
    this.fillOutline(); this.positionOutline();
    popup.querySelector("input").focus();
  }
  entries() {
    return (this.current()?.messages || []).flatMap((message, index) => message.role === "user" ? [{
      index, text: message.text, at: message.at,
      label: String(message.text || "").replace(/\s+/g, " ").trim() || (message.attachments || []).map(a => a.label || "附件").join("、") || "空消息",
    }] : []);
  }
  fillOutline() {
    if (!this.popup?.isConnected) return;
    const input = this.popup.querySelector("input"), query = input.value.trim().toLocaleLowerCase();
    const all = this.entries(), ordinals = new Map(all.map((entry, index) => [entry.index, index + 1]));
    const entries = all.filter(entry => entry.label.toLocaleLowerCase().includes(query));
    const signature = JSON.stringify([this.owner, query, entries]);
    if (signature === this.signature) return;
    this.signature = signature;
    const list = this.popup.querySelector(".conversation-outline-list"), fragment = document.createDocumentFragment();
    const focused = document.activeElement?.dataset.outlineIndex, scrollTop = list.scrollTop;
    this.displayed = entries;
    for (const entry of entries) {
      const button = document.createElement("button");
      button.type = "button"; button.dataset.outlineIndex = entry.index;
      button.title = entry.label;
      const label = document.createElement("span"); label.textContent = entry.label;
      const number = document.createElement("small"); number.textContent = String(ordinals.get(entry.index));
      button.append(number, label);
      button.addEventListener("click", () => this.jump(entry));
      fragment.append(button);
    }
    if (!entries.length) {
      const empty = document.createElement("p"); empty.className = "empty-note";
      empty.textContent = query ? "没有找到匹配的提问。" : "发送第一条消息后会显示在这里。";
      fragment.append(empty);
    }
    list.replaceChildren(fragment); list.scrollTop = scrollTop;
    if (focused !== undefined) (list.querySelector(`[data-outline-index="${Number(focused)}"]`) || input).focus({ preventScroll: true });
  }
  positionOutline() {
    const anchor = document.querySelector('[data-action="conversation-outline"]');
    if (!this.popup?.isConnected || !anchor) return;
    anchor.setAttribute("aria-expanded", "true");
    const r = anchor.getBoundingClientRect();
    this.popup.style.left = `${Math.max(8, Math.min(innerWidth - this.popup.offsetWidth - 8, r.right - this.popup.offsetWidth))}px`;
    this.popup.style.top = `${Math.max(8, Math.min(innerHeight - this.popup.offsetHeight - 8, r.bottom + 6))}px`;
  }
  closeOutline(restore = false) {
    const open = this.popup?.isConnected;
    this.popup?.remove(); this.popup = null;
    const anchor = document.querySelector('[data-action="conversation-outline"]');
    anchor?.setAttribute("aria-expanded", "false");
    if (restore && open) anchor?.focus({ preventScroll: true });
  }
  jump(entry) {
    const session = this.current(), message = session?.messages[entry.index], root = this.root();
    if (session?.id !== this.owner || root?.dataset.session !== this.owner || message?.text !== entry.text || message?.at !== entry.at) {
      this.closeOutline(); return;
    }
    const article = root.querySelector(`[data-message-index="${entry.index}"]`);
    if (!article) return this.closeOutline();
    this.closeOutline();
    root.scrollTop += article.getBoundingClientRect().top - root.getBoundingClientRect().top - 16;
    article.focus({ preventScroll: true });
    this.captureReading();
  }
  key(event) {
    if (!this.popup?.isConnected || !this.popup.contains(event.target)) return;
    if (!["Escape", "Tab", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    if (["Home", "End"].includes(event.key) && event.target.tagName === "INPUT") return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (["Escape", "Tab"].includes(event.key)) return this.closeOutline(true);
    const buttons = [...this.popup.querySelectorAll("[data-outline-index]")], current = buttons.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
      current < 0 ? (event.key === "ArrowUp" ? buttons.length - 1 : 0) : (current + (event.key === "ArrowUp" ? buttons.length - 1 : 1)) % buttons.length;
    buttons[next]?.focus({ preventScroll: true });
    buttons[next]?.scrollIntoView({ block: "nearest" });
  }
}
