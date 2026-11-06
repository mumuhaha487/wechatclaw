const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const groups = [["file", "文件", "f"], ["edit", "编辑", "e"], ["view", "视图", "v"], ["help", "帮助", "h"]];

// These commands operate on QQClaw's own controls, never on an agent's behalf.
export class ApplicationMenu {
  constructor({ state, dispatch, readClipboard, copy, pasteAttachments, error }) {
    Object.assign(this, { state, dispatch, readClipboard, copy, pasteAttachments, error });
    document.addEventListener("pointerdown", event => {
      if (event.target.closest(".application-menubar")) event.preventDefault();
      else if (!event.target.closest(".application-menu-popup")) this.close();
    });
    document.addEventListener("pointerover", event => {
      const anchor = event.target.closest('[data-action="app-menu"]');
      if (this.popup?.isConnected && anchor && anchor.dataset.menu !== this.group) this.open(anchor.dataset.menu, true);
    });
    document.addEventListener("keydown", event => this.key(event), true);
  }
  bar() {
    return `<nav class="application-menubar" role="menubar" aria-label="应用菜单">${groups.map(([id, label]) => `<button id="app-menu-${id}" role="menuitem" aria-haspopup="menu" aria-expanded="${this.popup?.isConnected && this.group === id || false}" data-action="app-menu" data-menu="${id}">${label}</button>`).join("")}</nav>`;
  }
  capture() {
    const element = document.activeElement;
    const editable = element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement && /^(text|search|url|tel|password)$/.test(element.type);
    const range = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0).cloneRange() : null;
    this.editor = {
      element, id: editable ? element.id : "", editable,
      value: editable ? element.value : "", start: editable ? element.selectionStart : null, end: editable ? element.selectionEnd : null,
      selected: editable && element.type !== "password" ? element.value.slice(element.selectionStart, element.selectionEnd) : editable ? "" : window.getSelection()?.toString() || "",
      writable: editable && !element.readOnly && !element.disabled,
      range, key: this.state().draftKey,
      undo: editable && document.queryCommandEnabled("undo"), redo: editable && document.queryCommandEnabled("redo"),
    };
  }
  items(group) {
    const s = this.state(), e = this.editor || {}, item = (label, command, shortcut = "", enabled = true, checked = null) => ({ label, command, shortcut, enabled, checked });
    if (group === "file") return [
      item("新聊天", "new-session", "Ctrl+N", s.ready), item("打开项目…", "add-project", "Ctrl+O", s.ready),
      item("新网页标签", "browser-new-tab", "Ctrl+T", s.ready && s.workspaceAvailable), item("关闭工作标签", "panel-close-active", "Ctrl+W", s.ready && s.workspaceAvailable && s.panel),
      item("重新打开关闭的标签页", "panel-reopen-tab", "Ctrl+Shift+T", s.ready && s.workspaceAvailable && s.canReopen),
      item("打开工作目录", "open-folder", "", s.ready && s.workspace), null,
      item("设置…", "settings", "Ctrl+,", s.ready), item("配置运行环境…", "runtime"), null, item("退出程序", s.isMac ? "window.close" : "window.exit"),
    ];
    if (group === "edit") return [
      item("撤销输入", "edit:undo", "Ctrl+Z", e.writable && e.undo), item("重做输入", "edit:redo", "Ctrl+Shift+Z", e.writable && e.redo), null,
      item("剪切", "edit:cut", "Ctrl+X", e.writable && e.selected), item("复制", "edit:copy", "Ctrl+C", e.selected),
      item("粘贴", "edit:paste", "Ctrl+V", e.writable), item("全选", "edit:selectAll", "Ctrl+A", e.editable), null,
      item("搜索会话…", "search", "Ctrl+K", s.ready), item("查找当前内容…", "find-current", "Ctrl+F", s.ready && s.canFind),
      item("下一个匹配", "find-next", "Ctrl+G", s.ready && s.canStepFind), item("上一个匹配", "find-previous", "Ctrl+Shift+G", s.ready && s.canStepFind),
      item("关闭查找", "find-close", "Esc", s.ready && s.findOpen),
    ];
    if (group === "view") return [
      item("侧栏", "toggle-sidebar", "Ctrl+B", s.ready, s.sidebar), item("工作面板", "toggle-panel", "Ctrl+Shift+B", s.ready, s.panel),
      item("展开工作面板", "maximize-panel", "", s.ready), item("网页预览", "open-browser-window", "", s.ready), null,
      item("网页地址栏", "browser-focus-address", "Ctrl+L", s.ready && s.workspaceAvailable && s.browser),
      item("下一个工作标签", "panel-next-tab", "Ctrl+Tab", s.ready && s.workspaceAvailable && s.tabNavigation), item("上一个工作标签", "panel-previous-tab", "Ctrl+Shift+Tab", s.ready && s.workspaceAvailable && s.tabNavigation), null,
      item("增大字号", "font-increase", "Ctrl++", s.ready && s.fontSize < 20), item("减小字号", "font-decrease", "Ctrl+−", s.ready && s.fontSize > 12),
      item("默认字号", "font-reset", "Ctrl+0", s.ready && s.fontSize !== 14),
    ];
    return [item("项目与使用说明", "source-project"), item("Codex 文档", "codex-docs"), item("官方浏览器扩展说明", "official-browser-docs"), null, item("关于 QQClaw", "about", "", s.ready)];
  }
  open(group, switching = false) {
    if (!groups.some(([id]) => id === group)) return;
    if (this.popup?.isConnected && this.group === group && !switching) return this.close(true);
    if (!this.popup?.isConnected) this.capture();
    this.close();
    document.querySelector(".context-menu")?.remove();
    const popup = this.popup = document.createElement("div");
    popup.className = "context-menu application-menu-popup";
    popup.setAttribute("role", "menu"); popup.setAttribute("aria-label", groups.find(([id]) => id === group)[1]);
    popup.innerHTML = this.items(group).map(item => item ? `<button role="${item.checked !== null ? "menuitemcheckbox" : "menuitem"}" ${item.checked !== null ? `aria-checked="${item.checked}"` : ""} ${item.enabled ? "" : "disabled"} data-action="app-command" data-command="${escape(item.command)}"><span class="menu-check">${item.checked ? "✓" : ""}</span><span class="grow">${escape(item.label)}</span><kbd>${escape(item.shortcut)}</kbd></button>` : '<div role="separator" class="menu-separator"></div>').join("");
    this.group = group; document.body.append(popup); this.afterRender();
    popup.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
  }
  afterRender() {
    const open = this.popup?.isConnected;
    for (const button of document.querySelectorAll('[data-action="app-menu"]')) button.setAttribute("aria-expanded", String(open && button.dataset.menu === this.group || false));
    if (!open) return;
    const anchor = document.getElementById(`app-menu-${this.group}`);
    if (!anchor) return this.close();
    const items = new Map(this.items(this.group).filter(Boolean).map(item => [item.command, item]));
    for (const button of this.popup.querySelectorAll("[data-command]")) {
      const item = items.get(button.dataset.command);
      button.disabled = !item?.enabled;
      if (item?.checked !== null && item?.checked !== undefined) {
        button.setAttribute("aria-checked", String(item.checked));
        button.querySelector(".menu-check").textContent = item.checked ? "✓" : "";
      }
    }
    if (this.popup.contains(document.activeElement) && document.activeElement.disabled)
      this.popup.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
    const r = anchor.getBoundingClientRect();
    this.popup.style.left = Math.max(8, Math.min(innerWidth - this.popup.offsetWidth - 8, r.left)) + "px";
    this.popup.style.top = Math.max(8, Math.min(innerHeight - this.popup.offsetHeight - 8, r.bottom + 4)) + "px";
  }
  close(restore = false) {
    this.popup?.remove(); this.popup = null;
    for (const button of document.querySelectorAll('[data-action="app-menu"]')) button.setAttribute("aria-expanded", "false");
    if (restore && this.editor?.element?.isConnected) this.editor.element.focus({ preventScroll: true });
  }
  restore(editor) {
    if (editor.key !== this.state().draftKey) throw new Error("当前会话已变化，请在目标输入框中重新操作。");
    const element = editor.element?.isConnected ? editor.element : editor.id ? document.getElementById(editor.id) : null;
    if (!element || editor.editable && element.value !== editor.value) throw new Error("输入内容已变化，请重新选择要编辑的内容。");
    element.focus({ preventScroll: true });
    if (editor.editable) element.setSelectionRange(editor.start, editor.end);
    else if (editor.range?.commonAncestorContainer.isConnected) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(editor.range); }
    return element;
  }
  async execute(command) {
    const editor = this.editor;
    this.close(true);
    if (!command.startsWith("edit:")) return this.dispatch(command);
    const op = command.slice(5);
    if (!editor) return;
    if (op === "copy" || op === "cut") await this.copy(editor.selected);
    if (op === "copy") return this.restore(editor);
    const value = op === "paste" ? await this.readClipboard() : null;
    if (op === "paste" && !value) return;
    const element = this.restore(editor);
    if (value && (value.files || value.image)) {
      if (element.id !== "composer-input") throw new Error("文件和图片请粘贴到聊天输入框中。");
      return this.pasteAttachments(value);
    }
    if (value && !value.text) return;
    if (!document.execCommand(op === "cut" ? "delete" : op === "paste" ? "insertText" : op, false, value?.text))
      throw new Error("当前控件无法执行此编辑操作，请使用键盘快捷键或重新选择内容。");
  }
  key(event) {
    if (this.state().isMac) return;
    const key = event.key;
    const group = event.altKey && !event.ctrlKey && !event.metaKey && groups.find(([, , letter]) => letter === key.toLowerCase());
    if (group || key === "F10" && !event.shiftKey) {
      event.preventDefault(); event.stopImmediatePropagation();
      return this.open(group ? group[0] : "file");
    }
    if (!this.popup?.isConnected) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape", "Tab"].includes(key)) {
      if (key !== "Tab") event.preventDefault();
      event.stopImmediatePropagation();
      if (key === "Escape" || key === "Tab") return this.close(true);
      if (key === "ArrowLeft" || key === "ArrowRight") {
        const index = groups.findIndex(([id]) => id === this.group);
        return this.open(groups[(index + (key === "ArrowRight" ? 1 : groups.length - 1)) % groups.length][0], true);
      }
      const buttons = [...this.popup.querySelectorAll("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement);
      buttons[key === "Home" ? 0 : key === "End" ? buttons.length - 1 : (index + (key === "ArrowUp" ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    }
  }
}
