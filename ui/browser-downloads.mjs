import { icon } from "./icons.mjs";

const labels = { running: "下载中", completed: "已完成", cancelled: "已取消", interrupted: "已中断" };
const bytes = value => {
  if (!(value > 0)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"], index = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toLocaleString("zh-CN", { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
};
const button = (name, title, image) => {
  const node = document.createElement("button"); node.type = "button"; node.dataset.downloadAction = name;
  node.title = title; node.setAttribute("aria-label", title); node.className = "icon-button"; node.innerHTML = icon(image); return node;
};

// Native WebView downloads are independent of the currently selected conversation.
export class BrowserDownloads {
  constructor({ rpc, ready, changed }) {
    Object.assign(this, { rpc, ready, changed });
    this.value = { items: [] }; this.rows = new Map(); this.busy = new Set(); this.limit = 50;
    document.addEventListener("keydown", event => {
      if (!this.root) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); this.close(); }
      else if (event.key === "Tab") {
        const nodes = [...this.root.querySelectorAll("button:not(:disabled)")].filter(node => node.offsetParent !== null);
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
      } else if (event.ctrlKey || event.metaKey || event.altKey) event.stopImmediatePropagation();
    }, true);
  }
  async show(anchor) {
    if (!this.ready()) return;
    if (this.root) { this.close(); return; }
    this.anchor = anchor; this.limit = 50; this.error = ""; this.rows.clear();
    const root = this.root = document.createElement("div"); root.className = "overlay-backdrop downloads-backdrop";
    root.innerHTML = '<section class="downloads-dialog" role="dialog" aria-modal="true" aria-labelledby="downloads-heading"><header><div><h2 id="downloads-heading">下载</h2><p class="downloads-summary" role="status"></p></div><div class="downloads-tools"></div></header><p class="downloads-note">文件保存到系统下载目录。清除记录不会删除文件。</p><p class="downloads-error" role="status" hidden></p><div class="downloads-list" role="list" aria-label="下载记录"></div><footer><button class="outline" data-download-action="clear">清除已结束记录</button><button class="outline" data-download-action="more" hidden>显示更多</button></footer></section>';
    const tools = root.querySelector(".downloads-tools"); tools.append(button("refresh", "刷新下载记录", "refresh"), button("close", "关闭下载面板", "close"));
    root.addEventListener("click", event => {
      if (event.target === root) return this.close();
      const node = event.target.closest("[data-download-action]");
      if (node && !node.disabled) this.act(node.dataset.downloadAction, node.closest("[data-download-id]")?.dataset.downloadId).catch(error => { this.error = error.message; this.render(); });
    });
    document.body.append(root); this.render(); tools.querySelector('[data-download-action="close"]').focus(); this.changed();
    await this.act("refresh");
  }
  close() {
    if (!this.root) return;
    this.root.remove(); this.root = null; this.rows.clear();
    const anchor = this.anchor?.isConnected ? this.anchor : document.querySelector('[data-action="browser-downloads"]');
    anchor?.focus({ preventScroll: true }); this.changed();
  }
  update(value) {
    if (!value || !Array.isArray(value.items)) return;
    if (Number.isSafeInteger(this.value.revision) && value.revision < this.value.revision) return;
    this.value = value; this.render();
  }
  refresh() { if (!this.ready()) this.close(); }
  async act(action, id) {
    if (action === "close") return this.close();
    if (action === "more") { this.limit += 50; return this.render(); }
    const key = id || action; if (this.busy.has(key)) return;
    this.busy.add(key); this.error = ""; this.render();
    try { this.update(await this.rpc("browser.downloads", { action: action === "refresh" ? "state" : action, id })); }
    finally { this.busy.delete(key); this.render(); }
  }
  render() {
    if (!this.root) return;
    const list = this.root.querySelector(".downloads-list"), items = this.value.items;
    this.root.querySelector(".downloads-summary").textContent = `${items.length} 个文件${items.some(item => item.status === "running") ? ` · ${items.filter(item => item.status === "running").length} 个正在下载` : ""}`;
    const error = this.root.querySelector(".downloads-error"); error.textContent = this.error || this.value.storageError || ""; error.hidden = !error.textContent;
    const selected = new Set(items.slice(0, this.limit).map(item => item.id));
    for (const [id, row] of this.rows) if (!selected.has(id)) {
      if (row.contains(document.activeElement)) this.root.querySelector('[data-download-action="close"]').focus();
      row.remove(); this.rows.delete(id);
    }
    let position = 0;
    for (const item of items.slice(0, this.limit)) {
      let row = this.rows.get(item.id);
      if (!row) {
        row = document.createElement("article"); row.className = "download-row"; row.setAttribute("role", "listitem"); row.dataset.downloadId = item.id;
        row.innerHTML = `${icon("file")}<div class="download-detail"><strong></strong><p class="download-path"></p><progress aria-label="下载进度"></progress><p class="download-status"></p></div><div class="download-actions"></div>`;
        row.querySelector(".download-actions").append(button("cancel", "取消下载", "close"), button("open", "打开文件", "external"), button("reveal", "在文件夹中显示", "folder")); this.rows.set(item.id, row);
      }
      if (list.children[position] !== row) list.insertBefore(row, list.children[position] || null); position++;
      const name = row.querySelector("strong"); name.textContent = item.name; name.title = item.name;
      const path = row.querySelector(".download-path"); path.textContent = item.path; path.title = item.path;
      const progress = row.querySelector("progress"); progress.hidden = item.status !== "running";
      if (item.total > 0) { progress.max = item.total; progress.value = Math.min(item.total, item.received); } else progress.removeAttribute("value");
      row.querySelector(".download-status").textContent = `${labels[item.status] || "未知状态"} · ${bytes(item.received)}${item.total > 0 ? ` / ${bytes(item.total)}` : ""}${item.error ? ` · ${item.error}` : ""}${item.status === "completed" && !item.available ? " · 文件已移动或删除" : ""}`;
      for (const node of row.querySelectorAll("button")) {
        const cancel = node.dataset.downloadAction === "cancel"; node.hidden = cancel ? item.status !== "running" : item.status !== "completed";
        node.disabled = this.busy.has(item.id) || (!cancel && !item.available) || Boolean(this.value.storageError);
      }
      const focused = document.activeElement;
      if (row.contains(focused) && focused.hidden) (row.querySelector("button:not([hidden]):not(:disabled)") || this.root.querySelector('[data-download-action="close"]')).focus();
    }
    let empty = list.querySelector(".downloads-empty");
    if (!items.length && !empty) { empty = document.createElement("p"); empty.className = "downloads-empty"; empty.textContent = "还没有下载文件"; list.append(empty); }
    if (items.length) empty?.remove();
    const clear = this.root.querySelector('[data-download-action="clear"]'); clear.disabled = this.busy.has("clear") || !items.some(item => item.status !== "running") || Boolean(this.value.storageError);
    this.root.querySelector('[data-download-action="refresh"]').disabled = this.busy.has("refresh");
    this.root.querySelector('[data-download-action="more"]').hidden = items.length <= this.limit;
  }
}
