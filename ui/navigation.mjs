const same = (a, b) => a?.active === b?.active && a?.project === b?.project && a?.page === b?.page;
export class NavigationHistory {
  constructor() { this.entries = []; this.index = -1; }
  visit(location) {
    if (same(this.entries[this.index], location)) return;
    this.entries.splice(this.index + 1);
    this.entries.push({ ...location });
    if (this.entries.length > 80) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  prune(valid) {
    const current = this.entries[this.index];
    this.entries = this.entries.filter(valid);
    this.index = this.entries.indexOf(current);
    if (this.index < 0) this.index = this.entries.length - 1;
  }
  canGo(offset) { return this.index + offset >= 0 && this.index + offset < this.entries.length; }
  go(offset) { return this.canGo(offset) ? { ...this.entries[this.index += offset] } : null; }
}
