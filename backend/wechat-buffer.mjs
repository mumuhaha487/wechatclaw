// Adapted from XavierJiezou/codex-weixin, MIT, Copyright (c) 2026 Xuechao Zou.
// See docs/CODEX-WEIXIN-LICENSE.txt for the upstream license.
class PromptBuffer {
  constructor(options) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
  }
  buffers = /* @__PURE__ */ new Map();
  now;
  start(key) {
    this.expire(key);
    if (this.buffers.has(key)) {
      return { status: "already-started" };
    }
    const now = this.now();
    this.buffers.set(key, { startedAt: now, updatedAt: now, items: [] });
    return { status: "started" };
  }
  append(key, item) {
    this.expire(key);
    const state = this.buffers.get(key);
    if (!state) {
      throw new Error("prompt buffer is not active");
    }
    if (state.items.length >= this.options.maxItems) {
      throw new Error(`too many buffered prompt items; limit is ${this.options.maxItems}`);
    }
    state.items.push(item);
    state.updatedAt = this.now();
  }
  done(key) {
    this.expire(key);
    const state = this.buffers.get(key);
    this.buffers.delete(key);
    if (!state || state.items.length === 0) {
      return { status: "empty", items: [] };
    }
    return { status: "flushed", items: state.items };
  }
  cancel(key) {
    return this.buffers.delete(key);
  }
  isActive(key) {
    this.expire(key);
    return this.buffers.has(key);
  }
  expire(key) {
    const state = this.buffers.get(key);
    if (!state) {
      return;
    }
    if (this.now() - state.updatedAt > this.options.ttlMs) {
      this.buffers.delete(key);
    }
  }
}
export {
  PromptBuffer
};
