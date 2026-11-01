const payload = entry => ({ text: entry?.text || "", attachments: (entry?.attachments || []).map(a => a.id), goalMode: Boolean(entry?.goalMode) });

export class ComposerDrafts {
  constructor({ entries, save, error }) {
    Object.assign(this, { entries, save, error });
    this.ready = false; this.signatures = new Map(); this.held = new Set();
  }
  hydrate(drafts) {
    if (this.ready) return;
    for (const [key, entry] of Object.entries(drafts)) {
      this.entries.set(key, entry);
      this.signatures.set(key, JSON.stringify(payload(entry)));
    }
    this.ready = true;
  }
  remember(key, entry) {
    if (!this.ready || this.held.has(key)) return;
    const value = payload(entry), signature = JSON.stringify(value);
    if (this.signatures.get(key) === signature) return;
    this.signatures.set(key, signature);
    // Post immediately. The backend updates memory before awaiting its encrypted
    // Store write, preserving input order without a debounce window on unload.
    Promise.resolve(this.save({ key, value })).catch(error => {
      if (this.signatures.get(key) === signature) this.signatures.delete(key);
      this.error(error);
    });
  }
}
