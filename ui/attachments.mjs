// Previews use a separate RPC, so snapshots never contain base64 image bodies.
// Bound the cache and concurrent requests; render only raster formats that the
// backend has recognized by their bytes, never SVG or model-provided HTML.
export class AttachmentPreviews {
  constructor(request) { this.request = request; this.cache = new Map(); this.pending = new Map(); }
  async get(key, params) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.pending.has(key)) return this.pending.get(key);
    const request = this.request("attachment.preview", params).then(src => {
      const safe = typeof src === "string" && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : "";
      this.cache.set(key, safe);
      let size = [...this.cache.values()].reduce((n, value) => n + value.length, 0);
      while (this.cache.size > 24 || size > 24 * 1024 * 1024) {
        const oldest = this.cache.keys().next().value;
        size -= this.cache.get(oldest).length;
        this.cache.delete(oldest);
      }
      return safe;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
  async hydrate(root, paramsFor) {
    const queue = [...root.querySelectorAll("img[data-preview-key]:not([src])")];
    const worker = async () => {
      while (queue.length) {
        const img = queue.shift();
        try {
          const src = await this.get(img.dataset.previewKey, paramsFor(img));
          if (src && img.isConnected) { img.src = src; img.hidden = false; }
        } catch { /* A missing or oversized image keeps its file placeholder. */ }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }
}
