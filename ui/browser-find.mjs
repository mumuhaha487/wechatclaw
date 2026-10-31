import { icon } from "./icons.mjs";

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// This is a user-operated find bar. It never sends page content to a model.
export class BrowserFind {
  constructor({ context, rpc, layout, changed, focusPage, active = () => true }) {
    Object.assign(this, { context, rpc, layout, changed, focusPage, active });
    this.sequence = 0;
    document.addEventListener("input", event => {
      if (event.target.id !== "browser-find-input" || !this.current()) return;
      this.state.query = event.target.value; this.state.result = null;
      this.state.error = ""; this.state.pending = true; this.sequence++;
      clearTimeout(this.timer);
      if (!event.isComposing) this.timer = setTimeout(() => this.request("search"), 120);
      this.changed();
    });
    document.addEventListener("compositionend", event => {
      if (event.target.id !== "browser-find-input" || !this.current()) return;
      this.state.query = event.target.value; clearTimeout(this.timer);
      this.timer = setTimeout(() => this.request("search"), 120);
    });
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-browser-find-command]");
      if (!button || !this.current()) return;
      event.preventDefault(); event.stopPropagation();
      button.dataset.browserFindCommand === "close" ? this.close() : this.step(button.dataset.browserFindCommand === "previous" ? -1 : 1);
    });
    document.addEventListener("keydown", event => this.key(event), true);
  }
  current() {
    const context = this.context(), state = this.state;
    return state && context && state.owner === context.owner && state.tabId === context.tabId && state.url === context.url ? context : null;
  }
  sync() { if (this.state && !this.current()) this.close(false); }
  open() {
    const context = this.context();
    if (!context?.tabId) return false;
    document.querySelector(".context-menu")?.remove();
    if (!this.current()) {
      this.close(false);
      this.state = { ...context, query: "", result: null, error: "", pending: false };
      this.layout(); this.request("search");
    }
    this.afterRender(true); return true;
  }
  close(restore = true) {
    const state = this.state;
    if (!state) return;
    this.state = null; this.sequence++; clearTimeout(this.timer);
    this.layout(); this.changed();
    this.rpc("browser.find", { sessionId: state.sessionId, tabId: state.tabId, operation: "clear", query: "" }).catch(() => {});
    if (restore) Promise.resolve(this.focusPage(state)).catch(() => {});
  }
  canStep() { return Boolean(this.current() && this.state.query && !this.state.error && (this.state.pending || this.state.result?.found)); }
  html() {
    if (!this.current()) return "";
    const state = this.state;
    return `<section class="browser-find" role="search" aria-label="在当前网页中查找" data-owner="${escape(state.owner)}" data-key="${escape(state.tabId)}">
      <input id="browser-find-input" data-owner="${escape(state.owner)}" data-key="${escape(state.tabId)}" type="search" aria-label="查找当前网页内容" placeholder="查找此网页…" autocomplete="off" spellcheck="false" maxlength="512" value="${escape(state.query)}">
      <span class="browser-find-status" role="status" aria-live="polite"></span>
      <button class="icon-button" aria-label="上一个网页匹配（Shift+Enter）" title="上一个匹配" data-browser-find-command="previous">↑</button>
      <button class="icon-button" aria-label="下一个网页匹配（Enter）" title="下一个匹配" data-browser-find-command="next">↓</button>
      <button class="icon-button" aria-label="关闭网页查找（Esc）" title="关闭查找" data-browser-find-command="close">${icon("close")}</button>
      <p class="browser-find-error" role="alert" hidden></p></section>`;
  }
  afterRender(focus = false) {
    const bar = document.querySelector(".browser-find");
    if (!bar || !this.current()) return;
    const state = this.state, result = state.result;
    let label = "";
    if (state.query) {
      if (state.pending) label = "…";
      else if (state.error) label = "查找失败";
      else if (result) label = !result.found ? "未找到" : Number.isSafeInteger(result.total) && result.total >= 0
        ? Number.isSafeInteger(result.index) && result.index > 0 ? `${result.index}/${result.total}` : `共 ${result.total} 处`
        : "找到匹配";
    }
    bar.querySelector(".browser-find-status").textContent = label;
    for (const button of bar.querySelectorAll('[data-browser-find-command="previous"],[data-browser-find-command="next"]')) button.disabled = !this.canStep();
    const error = bar.querySelector(".browser-find-error"); error.textContent = state.error; error.hidden = !state.error;
    if (focus) { const input = bar.querySelector("input"); input.focus({ preventScroll: true }); input.select(); }
  }
  async request(operation) {
    const context = this.current(), state = this.state;
    if (!context || !state) return;
    clearTimeout(this.timer);
    const sequence = ++this.sequence, query = state.query;
    state.pending = true; state.error = ""; this.changed();
    try {
      const result = await this.rpc("browser.find", { sessionId: context.sessionId, tabId: context.tabId, operation, query });
      if (this.state !== state || !this.current() || sequence !== this.sequence) return;
      state.pending = false;
      if (result?.stale) { state.result = null; state.error = "网页已变化，请重新查找。"; }
      else state.result = result;
    } catch (error) {
      if (this.state !== state || !this.current() || sequence !== this.sequence) return;
      state.pending = false; state.result = null; state.error = error.message;
    }
    this.changed();
  }
  step(direction) { if (this.current() && this.state.query) return this.request(direction < 0 ? "previous" : "next"); }
  key(event) {
    if (!this.current() || event.isComposing || event.altKey || document.querySelector(".overlay-backdrop,.context-menu")) return;
    const next = event.key === "F3" || (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g" || event.key === "Enter" && event.target.closest(".browser-find");
    if (event.key !== "Escape" && !next) return;
    if (next && !this.active()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    event.key === "Escape" ? this.close(Boolean(event.target.closest(".browser-panel"))) : this.step(event.shiftKey ? -1 : 1);
  }
}
