const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function componentProgress(progress) {
  let message = progress?.message || "正在准备安装…";
  if (progress?.phase === "download" && Number.isFinite(progress.received) && progress.received >= 0 && progress.total > 0)
    message += ` ${Math.min(100, Math.floor(progress.received / progress.total * 100))}%`;
  return message;
}
export class BrowserComponentInstall {
  constructor({ rpc, changed, error }) {
    Object.assign(this, { rpc, changed, error });
    this.status = null;
    this.operation = null;
    this.requesting = false;
    this.refreshPromise = null;
    this.refreshAgain = false;
  }
  get installing() { return this.requesting || this.operation?.state === "running"; }
  get progress() {
    if (this.requesting && this.operation?.state !== "running") return null;
    return this.operation?.cancelling ? { ...this.operation.progress, message: "正在取消安装…", canCancel: false } : this.operation?.progress;
  }
  accept(operation) {
    if (!operation?.id || !Number.isSafeInteger(operation.revision) || !["running", "succeeded", "cancelled", "failed"].includes(operation.state) ||
        this.operation && operation.revision <= this.operation.revision) return false;
    this.operation = operation;
    return true;
  }
  event(operation) {
    const previous = this.operation;
    if (!this.accept(operation)) return;
    if (operation.state === "succeeded" && operation.result?.installed && this.status)
      this.status = { ...this.status, installed: true, needsRepair: false, reason: operation.result.message };
    this.changed(previous?.id !== operation.id || previous?.state !== operation.state);
    // A reloaded document has no pending install RPC to deliver completion.
    if (operation.state !== "running") this.refresh().catch(this.error);
  }
  refresh() {
    if (this.refreshPromise) { this.refreshAgain = true; return this.refreshPromise; }
    this.refreshPromise = this.readStatus();
    return this.refreshPromise;
  }
  async readStatus() {
    try {
      do {
        this.refreshAgain = false;
        const status = await this.rpc("system.browserComponentStatus");
        // A slow status read must not undo a newer progress/terminal event.
        if (this.operation && (!status.operation || status.operation.revision < this.operation.revision)) {
          this.refreshAgain = true;
          continue;
        }
        this.status = status;
        this.accept(status.operation);
        this.changed(true);
      } while (this.refreshAgain);
      return this.status;
    } finally { this.refreshPromise = null; }
  }
  async install() {
    if (this.installing || !this.status?.packaged || this.status.installed) return;
    this.requesting = true;
    this.changed(true);
    try { return await this.rpc("system.installBrowserComponent"); }
    finally {
      this.requesting = false;
      await this.refresh().catch(this.error);
      this.changed(true);
    }
  }
}
export function browserComponentSettings({ status, installing, progress, operation, isMac }, button) {
  if (isMac) return "";
  const title = installing ? "正在安装浏览器组件" : status?.installed ? "浏览器组件已安装" : status?.needsRepair ? "浏览器组件需要修复" : "浏览器运行组件";
  const outcome = !installing && operation?.state !== "running" && (operation?.error || operation?.result?.message);
  return `<div class="settings-card"><p class="setting-title">${title}</p><p class="setting-description">${escape(installing ? "安装完成后将校验浏览器组件。" : status?.reason || "正在检测浏览器组件…")}</p>
    ${installing ? `<p class="setting-description" data-browser-component-progress role="status">${escape(componentProgress(progress))}</p>` : ""}
    ${outcome ? `<p class="setting-description" data-browser-component-outcome role="status">${escape(outcome)}</p>` : ""}
    <div class="row">${status?.packaged && !status.installed ? button("install-browser-component", installing ? "正在安装…" : status.needsRepair ? "修复组件" : "安装浏览器组件", "download", "outline", installing ? "disabled" : "") : ""}
    ${button("check-browser-component", "重新检测", "refresh", "outline", installing ? "disabled" : "")}
    ${installing ? button("cancel-browser-component", "取消安装", "", "outline", progress?.canCancel === false ? "disabled" : "") : ""}</div></div>`;
}
