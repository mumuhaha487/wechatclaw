const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function componentProgress(progress) {
  let message = progress?.message || "正在准备安装…";
  if (progress?.phase === "download" && Number.isFinite(progress.received) && progress.received >= 0 && progress.total > 0)
    message += ` ${Math.min(100, Math.floor(progress.received / progress.total * 100))}%`;
  return message;
}
export function browserComponentSettings({ status, installing, progress, isMac }, button) {
  if (isMac) return "";
  const title = status?.installed ? "浏览器组件已安装" : status?.needsRepair ? "浏览器组件需要修复" : "浏览器运行组件";
  return `<div class="settings-card"><p class="setting-title">${title}</p><p class="setting-description">${escape(status?.reason || "正在检测浏览器组件…")}</p>
    ${installing ? `<p class="setting-description" data-browser-component-progress role="status">${escape(componentProgress(progress))}</p>` : ""}
    <div class="row">${status?.packaged && !status.installed ? button("install-browser-component", installing ? "正在安装…" : status.needsRepair ? "修复组件" : "安装浏览器组件", "download", "outline", installing ? "disabled" : "") : ""}
    ${button("check-browser-component", "重新检测", "refresh", "outline", installing ? "disabled" : "")}
    ${installing ? button("cancel-browser-component", "取消安装", "", "outline", progress?.canCancel === false ? "disabled" : "") : ""}</div></div>`;
}
