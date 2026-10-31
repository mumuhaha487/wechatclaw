export class PanelTabs {
  constructor() { this.groups = new Map(); this.readSequence = 0; }
  group(owner) {
    if (!this.groups.has(owner)) this.groups.set(owner, { tabs: [], selected: "" });
    return this.groups.get(owner);
  }
  selected(owner) { const group = this.group(owner); return group.tabs.find(tab => tab.key === group.selected); }
  select(owner, key) {
    const group = this.group(owner);
    if (key && !group.tabs.some(tab => tab.key === key)) return false;
    group.selected = key;
    return true;
  }
  openFile(owner, file) {
    const group = this.group(owner), key = `file:${file}`;
    let tab = group.tabs.find(tab => tab.key === key);
    if (!tab) {
      if (group.tabs.filter(tab => tab.kind === "file").length >= 16) throw new Error("最多同时打开 16 个文件，请先关闭一些文件标签。");
      tab = { key, kind: "file", file, name: file.split(/[\\/]/).pop(), text: "", loaded: false, revision: 0, scrollTop: 0, scrollLeft: 0 };
      group.tabs.push(tab);
    }
    group.selected = key;
    return tab;
  }
  completeFile(owner, tab, data) {
    const group = this.group(owner), key = `file:${data.relative || tab.file}`;
    const existing = group.tabs.find(candidate => candidate.key === key);
    if (existing && existing !== tab) {
      const selected = group.selected === tab.key;
      this.close(owner, tab.key);
      if (selected) group.selected = existing.key;
      if ((tab.request || 0) >= (existing.request || 0)) {
        Object.assign(existing, data, { loaded: true, loading: false, error: "", request: tab.request });
        if (tab.pendingLine) Object.assign(existing, { pendingLine: tab.pendingLine, source: true, scrollLeft: 0 });
      }
      return existing;
    }
    if (group.selected === tab.key) group.selected = key;
    Object.assign(tab, data, { key, file: data.relative || tab.file, loaded: true });
    return tab;
  }
  openBrowser(owner, state = {}) {
    this.syncBrowser(owner, state);
    const group = this.group(owner);
    let key = state.activeTab && `browser:${state.activeTab}`;
    if (!key || !group.tabs.some(tab => tab.key === key)) {
      key = "browser:start";
      if (!group.tabs.some(tab => tab.key === key)) group.tabs.push({ key, kind: "browser", name: "新标签页", id: "" });
    }
    group.selected = key;
  }
  close(owner, key) {
    const group = this.group(owner), index = group.tabs.findIndex(tab => tab.key === key);
    if (index < 0) return;
    group.tabs.splice(index, 1);
    if (group.selected === key) group.selected = group.tabs[Math.min(index, group.tabs.length - 1)]?.key || "";
  }
  syncBrowser(owner, state) {
    if (!Array.isArray(state?.tabs)) return;
    const group = this.group(owner), keys = new Set(state.tabs.map(tab => `browser:${tab.id}`));
    for (const tab of [...group.tabs]) {
      if (tab.kind === "browser" && (tab.id ? !keys.has(tab.key) : state.tabs.length)) this.close(owner, tab.key);
    }
    for (const value of state.tabs) {
      const key = `browser:${value.id}`;
      let tab = group.tabs.find(tab => tab.key === key);
      if (!tab) { tab = { key, kind: "browser", id: value.id }; group.tabs.push(tab); }
      Object.assign(tab, { name: value.title || "新标签页", loading: value.loading });
    }
  }
}

export function workspaceFileReference(value, baseFile = "", windows = false) {
  if (typeof value !== "string" || !value || value.length > 8192 || value.includes("\0") || value.startsWith("#")) return null;
  const fragment = value.match(/#L?(\d+)(?:[C:-].*)?$/i);
  let file = value.split("#")[0].split("?")[0];
  if (/^file:/i.test(file)) {
    try {
      const url = new URL(file);
      if (url.username || url.password || url.port) return null;
      file = decodeURIComponent(url.pathname);
      if (url.hostname && url.hostname !== "localhost") file = `//${url.hostname}${file}`;
      else if (/^\/[a-z]:\//i.test(file)) file = file.slice(1);
    } catch { return null; }
  } else {
    if (/^[a-z][\w+.-]*:/i.test(file) && !/^[a-z]:[\\/]/i.test(file)) return null;
    if (file.startsWith("//")) return null;
    try { file = decodeURIComponent(file); } catch { return null; }
    if (!/^(?:[a-z]:[\\/]|[\\/])/i.test(file) && baseFile) {
      const parts = baseFile.split(windows ? /[\\/]/ : /\//); parts.pop();
      file = [...parts, file].join("/");
    }
  }
  return file && !file.includes("\0") ? { file, line: fragment ? Number(fragment[1]) : 0 } : null;
}
