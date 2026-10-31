import { viewPreferences, VIEW_PREFERENCE_KEYS } from "../shared/view-preferences.mjs";

export class ViewPreferences {
  constructor({ storage, context, save, error }) {
    Object.assign(this, { storage, context, save, error });
    this.ready = false;
    this.values = {};
  }
  getItem(key) {
    if (this.ready) return this.values[key] ?? null;
    try { return this.storage()?.getItem(key) ?? null; } catch { return null; }
  }
  hydrate(saved) {
    if (this.ready) return;
    const legacy = Object.fromEntries(VIEW_PREFERENCE_KEYS.map(key => [key, this.getItem(key)]));
    this.values = viewPreferences(saved ?? legacy, this.context()) || {};
    this.ready = true;
    if (saved != null) this.sentSignature = JSON.stringify(this.values);
    if (saved == null) this.persist();
  }
  setItem(key, value) { this.patch({ [key]: String(value) }); }
  removeItem(key) { this.patch({ [key]: undefined }); }
  stageItem(key, value) { this.patch({ [key]: String(value) }, false); }
  patch(patch, persist = true) {
    if (!this.ready) {
      for (const [key, value] of Object.entries(patch)) {
        try { value === undefined ? this.storage()?.removeItem(key) : this.storage()?.setItem(key, value); } catch {}
      }
      return;
    }
    const next = viewPreferences({ ...this.values, ...patch }, this.context()) || {};
    if (JSON.stringify(next) === JSON.stringify(this.values)) return;
    this.values = next;
    if (persist) this.persist();
  }
  persist() {
    const value = structuredClone(this.values);
    const signature = JSON.stringify(value);
    if (signature === this.sentSignature) return;
    this.sentSignature = signature;
    // Post immediately, as with review.remember: normal shutdown then drains
    // the backend Store queue even if the web origin cannot save localStorage.
    Promise.resolve(this.save(value)).catch(error => {
      if (this.sentSignature === signature) this.sentSignature = undefined;
      this.error(error);
    });
  }
}
