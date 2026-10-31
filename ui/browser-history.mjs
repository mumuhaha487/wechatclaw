import { icon } from "./icons.mjs";

const match = (item, query) => `${item.title}\n${item.url}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
const control = (action, title, image) => {
  const node = document.createElement("button"); node.type = "button"; node.dataset.historyAction = action;
  node.className = "icon-button"; node.title = title; node.setAttribute("aria-label", title); node.innerHTML = icon(image); return node;
};

// User-operated history only. Nothing here exposes page history to the model.
export class BrowserHistory {
  constructor({ rpc, ready, changed, navigate, error }) {
    Object.assign(this, { rpc, ready, changed, navigate, reportError: error });
    this.value = { items: [] }; this.limit = 50; this.suppressed = false;
    document.addEventListener("focusin", event => {
      if (event.target.id === "browser-address" && !this.suppressed && !this.root) {
        this.refreshSuggestions(); this.load().catch(() => {});
      }
    });
    document.addEventListener("input", event => {
      if (event.target.id === "browser-address") { this.suppressed = false; this.selected = ""; this.refreshSuggestions(); }
    });
    document.addEventListener("focusout", () => queueMicrotask(() => {
      if (document.activeElement?.id !== "browser-address" && !this.suggestions?.contains(document.activeElement)) this.dismissSuggestions(false);
    }));
    document.addEventListener("pointerdown", event => {
      if (event.target.id === "browser-address") { this.suppressed = false; this.refreshSuggestions(); }
      else if (!this.suggestions?.contains(event.target)) this.dismissSuggestions(false);
    });
    document.addEventListener("submit", event => { if (event.target.id === "browser-form") this.dismissSuggestions(); }, true);
    document.addEventListener("keydown", event => this.key(event), true);
    window.addEventListener("resize", () => this.refreshSuggestions());
    window.addEventListener("blur", () => this.dismissSuggestions(false));
    window.addEventListener("focus", () => this.refreshSuggestions());
  }
  async load() {
    try { this.update(await this.rpc("browser.history", { action: "state" })); }
    catch (error) { this.error = error.message; this.render(); this.refreshSuggestions(); throw error; }
  }
  update(value) {
    if (!value || !Array.isArray(value.items) || value.revision < (this.value.revision || 0)) return;
    this.value = value; this.render(); this.refreshSuggestions();
  }
  refresh() { if (!this.ready()) this.close(); this.refreshSuggestions(); }
  dismissSuggestions(suppress = true) {
    this.suggestions?.remove(); this.suggestions = null; this.selected = ""; this.suppressed = suppress;
    const input = document.getElementById("browser-address");
    input?.setAttribute("aria-expanded", "false"); input?.removeAttribute("aria-activedescendant"); this.changed();
  }
  refreshSuggestions() {
    const input = document.getElementById("browser-address");
    if (!input || input.disabled || !document.hasFocus() || document.activeElement !== input || this.suppressed || this.root || !this.ready()) {
      if (this.suggestions) this.dismissSuggestions(this.suppressed); return;
    }
    const items = this.value.items.filter(item => match(item, input.value)).slice(0, 6);
    const root = this.suggestions || document.createElement("div"); root.className = "picker-menu browser-suggestions"; root.id = "browser-history-suggestions";
    root.setAttribute("role", "listbox"); root.setAttribute("aria-label", "浏览历史建议");
    root.replaceChildren();
    const message = this.error || this.value.storageError;
    if (message) { const node = document.createElement("p"); node.className = "browser-history-note"; node.textContent = message; root.append(node); }
    if (!items.length) { const node = document.createElement("p"); node.className = "browser-history-note"; node.textContent = input.value ? "没有匹配的浏览记录，按 Enter 打开或搜索" : "输入网址或搜索内容"; root.append(node); }
    for (const item of items) {
      const node = document.createElement("button"); node.type = "button"; node.className = "browser-history-option";
      node.setAttribute("role", "option"); node.id = "history-option-" + item.id; node.dataset.historyId = item.id;
      node.setAttribute("aria-selected", String(this.selected === item.id)); node.innerHTML = `${icon("clock")}<span><strong></strong><small></small></span>`;
      node.querySelector("strong").textContent = item.title; node.querySelector("small").textContent = item.url; node.title = item.url;
      node.addEventListener("click", () => this.choose(item.id)); root.append(node);
    }
    const all = document.createElement("button"); all.type = "button"; all.className = "browser-history-all"; all.textContent = "查看全部浏览记录";
    all.addEventListener("click", () => this.show(input).catch(this.reportError)); root.append(all);
    // Retain address focus so Arrow/Enter and IME keep editing the actual input.
    root.onpointerdown = event => event.preventDefault();
    this.suggestions = root; if (!root.isConnected) document.body.append(root);
    input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-controls", root.id); input.setAttribute("aria-expanded", "true");
    if (items.some(item => item.id === this.selected)) input.setAttribute("aria-activedescendant", "history-option-" + this.selected);
    else { this.selected = ""; input.removeAttribute("aria-activedescendant"); }
    const r = input.closest("form").getBoundingClientRect(), width = Math.min(440, Math.max(280, r.width), innerWidth - 16);
    root.style.width = width + "px"; root.style.left = Math.max(8, Math.min(innerWidth - width - 8, r.left)) + "px";
    root.style.maxHeight = Math.max(80, innerHeight - r.bottom - 16) + "px"; root.style.top = r.bottom + 5 + "px"; this.changed();
  }
  key(event) {
    if (this.root) {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); if (this.confirming) { this.confirming = false; this.render(); this.root.querySelector('[data-history-action="clear"]').focus(); } else this.close(); }
      else if (event.key === "Tab") {
        const nodes = [...this.root.querySelectorAll("button:not(:disabled),input,select")].filter(node => node.offsetParent !== null);
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
      } else if (event.ctrlKey || event.metaKey || event.altKey) event.stopImmediatePropagation();
      return;
    }
    if (event.target.id !== "browser-address" || event.isComposing) return;
    if (event.key === "Escape" && this.suggestions) { event.preventDefault(); event.stopImmediatePropagation(); this.dismissSuggestions(); }
    else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation(); this.suppressed = false; this.refreshSuggestions();
      const nodes = [...(this.suggestions?.querySelectorAll("[data-history-id]") || [])], index = nodes.findIndex(node => node.dataset.historyId === this.selected);
      if (nodes.length) {
        this.selected = nodes[(index + (event.key === "ArrowDown" ? 1 : index < 0 ? 0 : -1) + nodes.length) % nodes.length].dataset.historyId;
        this.refreshSuggestions(); this.suggestions.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
      }
    } else if (event.key === "Enter" && this.suggestions && this.selected) {
      event.preventDefault(); event.stopImmediatePropagation(); this.choose(this.selected);
    } else if (event.key === "Tab") this.dismissSuggestions();
  }
  choose(id) {
    const item = this.value.items.find(item => item.id === id); if (!item) return;
    this.dismissSuggestions(); this.close(false); this.navigate(item.url).catch(this.reportError);
  }
  async show(anchor) {
    if (!this.ready()) return;
    if (this.root) return this.close();
    this.anchor = anchor; this.dismissSuggestions(); this.limit = 50; this.error = ""; this.query = ""; this.confirming = false;
    const root = this.root = document.createElement("div"); root.className = "overlay-backdrop browser-history-backdrop";
    root.innerHTML = '<section class="browser-history-dialog" role="dialog" aria-modal="true" aria-labelledby="browser-history-heading"><header><div><h2 id="browser-history-heading">浏览记录</h2><p class="browser-history-summary"></p></div></header><p class="browser-history-note">仅保存本软件实际访问的最近 500 个网址；同一网址保留最近一次。记录在本机加密，不会自动发送给模型。</p><label class="browser-history-search"><span class="sr-only">搜索浏览记录</span><input type="search" placeholder="搜索标题或网址" maxlength="512"></label><p class="browser-history-error" role="status" hidden></p><div class="browser-history-list" role="list" aria-label="浏览记录"></div><footer><div class="browser-history-clear"><label>清除范围 <select aria-label="清除浏览记录的时间范围"><option value="hour">最近一小时</option><option value="day">最近一天</option><option value="all">全部时间</option></select></label><button class="outline" data-history-action="clear">清除记录</button></div><button class="outline" data-history-action="more" hidden>显示更多</button></footer><div class="browser-history-confirm" hidden><p>清除所选时间范围内的浏览记录？网页登录状态、下载文件和聊天不会被删除。</p><div><button class="outline" data-history-action="cancel-clear">取消</button><button class="primary" data-history-action="confirm-clear">确认清除</button></div></div></section>';
    root.querySelector("header").append(control("refresh", "刷新浏览记录", "refresh"), control("close", "关闭浏览记录", "close"));
    root.addEventListener("click", event => {
      if (event.target === root) return this.close();
      const node = event.target.closest("[data-history-action]");
      if (node && !node.disabled) this.act(node.dataset.historyAction, node.closest("[data-history-id]")?.dataset.historyId).catch(error => { this.error = error.message; this.render(); });
    });
    root.querySelector("input").addEventListener("input", event => { this.query = event.target.value; this.limit = 50; this.render(); });
    document.body.append(root); this.render(); root.querySelector("input").focus(); this.changed(); await this.load();
  }
  close(restore = true) {
    if (!this.root) return;
    this.root.remove(); this.root = null; this.confirming = false; this.suppressed = true;
    if (restore) (this.anchor?.isConnected ? this.anchor : document.querySelector('[data-action="browser-history"]'))?.focus({ preventScroll: true });
    this.changed();
  }
  async act(action, id) {
    if (action === "close") return this.close();
    if (action === "open") return this.choose(id);
    if (action === "more") { this.limit += 50; return this.render(); }
    if (action === "clear" || action === "cancel-clear") {
      this.confirming = action === "clear"; this.clearRange = this.root.querySelector("select").value; this.render();
      return this.root.querySelector(`[data-history-action="${this.confirming ? "cancel-clear" : "clear"}"]`).focus();
    }
    if (this.busy) return;
    this.busy = true; this.error = ""; this.render();
    try {
      if (action === "refresh") await this.load();
      else this.update(await this.rpc("browser.history", { action: action === "confirm-clear" ? "clear" : action, id, range: this.clearRange }));
      if (action === "confirm-clear") this.confirming = false;
    } finally { this.busy = false; this.render(); }
  }
  render() {
    if (!this.root) return;
    const items = this.value.items.filter(item => match(item, this.query)), list = this.root.querySelector(".browser-history-list");
    const focused = list.contains(document.activeElement) ? { id: document.activeElement.closest("[data-history-id]")?.dataset.historyId, action: document.activeElement.dataset.historyAction } : null;
    const scroll = list.scrollTop; list.replaceChildren();
    this.root.querySelector(".browser-history-summary").textContent = `${items.length} 个网址${this.query ? ` · 共 ${this.value.items.length} 个` : ""}`;
    for (const item of items.slice(0, this.limit)) {
      const row = document.createElement("article"); row.className = "browser-history-row"; row.setAttribute("role", "listitem"); row.dataset.historyId = item.id;
      row.innerHTML = '<button class="browser-history-open" data-history-action="open"><strong></strong><small></small><time></time></button>';
      row.querySelector("strong").textContent = item.title; row.querySelector("small").textContent = item.url; row.querySelector("small").title = item.url;
      row.querySelector("time").textContent = new Date(item.at).toLocaleString(); row.append(control("remove", "删除这条浏览记录", "close")); list.append(row);
    }
    if (!items.length) { const empty = document.createElement("p"); empty.className = "browser-history-note"; empty.textContent = this.query ? "没有匹配的浏览记录" : "还没有浏览记录"; list.append(empty); }
    list.scrollTop = scroll;
    if (focused) ([...list.querySelectorAll("button")].find(node => node.closest("[data-history-id]").dataset.historyId === focused.id && node.dataset.historyAction === focused.action) || this.root.querySelector("input")).focus({ preventScroll: true });
    const error = this.root.querySelector(".browser-history-error"); error.textContent = this.error || this.value.storageError || ""; error.hidden = !error.textContent;
    this.root.querySelector('[data-history-action="more"]').hidden = items.length <= this.limit;
    this.root.querySelector(".browser-history-confirm").hidden = !this.confirming;
    this.root.querySelector("select").disabled = this.confirming || Boolean(this.busy);
    for (const node of this.root.querySelectorAll("button")) {
      const action = node.dataset.historyAction;
      node.disabled = action !== "close" && (Boolean(this.busy) || Boolean(this.value.storageError) && ["clear", "confirm-clear", "remove"].includes(action) || action === "clear" && !this.value.items.length);
    }
    const active = document.activeElement;
    if (active?.closest(".browser-history-confirm") && !this.confirming) this.root.querySelector('[data-history-action="clear"]').focus();
  }
}
