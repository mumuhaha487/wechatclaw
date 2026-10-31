// Only explicit, successful closes enter this in-memory, per-workspace stack.
// Keep locations and reading positions, never old file contents or POST bodies.
export class ClosedPanelTabs {
  constructor(limit = 20) { this.limit = limit; this.entries = new Map(); this.restoring = new Set(); }
  capture(tab, { index = 0, url = "" } = {}) {
    const position = Number.isSafeInteger(index) ? Math.max(0, index) : 0;
    const offset = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
    if (tab?.kind === "file" && typeof tab.file === "string" && tab.file && !tab.file.includes("\0")) {
      return Object.freeze({ kind: "file", file: tab.file, index: position, source: Boolean(tab.source),
        scrollTop: offset(tab.scrollTop), scrollLeft: offset(tab.scrollLeft) });
    }
    if (tab?.kind !== "browser") return null;
    if (url && url !== "about:blank") {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hostname === "qqclaw.local") return null;
        url = parsed.href;
      } catch { return null; }
    } else url = "";
    return Object.freeze({ kind: "browser", url, index: position });
  }
  remember(owner, entry) {
    if (!entry) return;
    if (!this.entries.has(owner)) this.entries.set(owner, []);
    const entries = this.entries.get(owner);
    entries.push(entry);
    if (entries.length > this.limit) entries.splice(0, entries.length - this.limit);
  }
  peek(owner) { return this.entries.get(owner)?.at(-1); }
  available(owner) { return Boolean(this.peek(owner)) && !this.restoring.has(owner); }
  async restore(owner, operation) {
    if (!this.available(owner)) return false;
    const entries = this.entries.get(owner), entry = entries.at(-1);
    this.restoring.add(owner);
    try {
      const accepted = await operation(entry);
      if (accepted === false) return false;
      if (this.entries.get(owner) === entries) {
        const index = entries.indexOf(entry);
        if (index >= 0) entries.splice(index, 1);
        if (!entries.length) this.entries.delete(owner);
      }
      return true;
    } finally { this.restoring.delete(owner); }
  }
  prune(owners) {
    const existing = new Set(owners);
    for (const owner of this.entries.keys()) if (!existing.has(owner)) this.entries.delete(owner);
  }
}
