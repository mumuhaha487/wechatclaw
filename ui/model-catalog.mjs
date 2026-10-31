// Catalogs belong to a provider. A refresh replaces the last response; it never
// appends old discoveries or changes the user's selected model.
export class ModelCatalog {
  constructor(read, changed = () => {}) {
    this.read = read;
    this.changed = changed;
    this.entries = new Map();
    this.status = new Map();
    this.pending = new Map();
  }
  async refresh(providerId, force = false) {
    if (this.pending.has(providerId)) return this.pending.get(providerId);
    const previous = this.status.get(providerId);
    if (!force && previous?.at && Date.now() - previous.at < 60000)
      return this.entries.get(providerId);
    const promise = (async () => {
      this.status.set(providerId, { ...previous, loading: true });
      this.changed(providerId);
      try {
        const models = await this.read(providerId);
        this.entries.set(providerId, models);
        this.status.set(providerId, {
          at: Date.now(),
          loading: false,
          error: "",
        });
        return models;
      } catch (error) {
        this.status.set(providerId, {
          ...previous,
          loading: false,
          error: error.message,
        });
        return this.entries.get(providerId) || [];
      } finally {
        this.pending.delete(providerId);
        this.changed(providerId);
      }
    })();
    this.pending.set(providerId, promise);
    return promise;
  }
}
