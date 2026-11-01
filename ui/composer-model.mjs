import { enhancePickers, closePicker } from "./controls.mjs";
import { icon } from "./icons.mjs";

// One entry in the composer; provider, model and effort remain independent
// settings inside it. Keep pending saves bound to their originating session.
export class ComposerModelMenu {
  constructor({ context, change, refresh, error }) {
    Object.assign(this, { context, change, refreshModels: refresh, error });
    document.addEventListener("pointerdown", event => {
      if (this.opened && !this.surface.contains(event.target) && !this.trigger()?.contains(event.target) &&
          !event.target.closest(".picker-menu:not(.composer-model-popup)")) this.close();
    });
    document.addEventListener("keydown", event => {
      if (!this.opened || event.key !== "Escape") return;
      event.preventDefault(); this.close(true);
    });
    window.addEventListener("resize", () => this.position());
  }
  trigger() { return document.querySelector('[data-action="composer-model"]'); }
  toggle() {
    if (this.opened) return this.close(true);
    const context = this.context();
    if (!context.available || context.busy) return;
    closePicker();
    this.opened = { owner: context.owner, origin: context.origin, saving: false };
    const surface = this.surface = document.createElement("section");
    surface.className = "picker-menu composer-model-popup";
    surface.id = "composer-model-popup";
    surface.setAttribute("role", "dialog");
    surface.setAttribute("aria-label", "模型配置");
    document.body.append(surface);
    surface.addEventListener("change", event => {
      event.stopPropagation();
      if (event.target.id === "provider-select") { this.selectProvider(event.target.value); return; }
      const changes = { "model-select": value => ({ model: value, effort: "" }), "effort-select": value => ({ effort: value }) };
      const change = changes[event.target.id];
      if (change) this.save(change(event.target.value), event.target.id);
    });
    surface.addEventListener("click", event => {
      if (event.target.closest("[data-model-close]")) this.close(true);
      if (event.target.closest("[data-model-refresh]")) this.refreshModels(this.selection().providerId, true);
    });
    surface.addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const fields = [...surface.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(.native-picker-source):not(:disabled)')].filter(element => !element.hidden && element.getClientRects().length);
      const first = fields[0], last = fields.at(-1);
      if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    });
    this.update();
    surface.querySelector('[data-control="model-select"]')?.focus();
    this.refreshModels(context.config.providerId, true);
  }
  selection() { return { ...this.context().config, ...this.opened?.draft }; }
  selectProvider(providerId) {
    const opened = this.opened, context = this.context();
    if (!opened || opened.saving || context.busy || context.owner !== opened.owner) return;
    if (providerId === context.config.providerId) { opened.draft = null; this.update(); return; }
    opened.draft = { providerId, model: "", effort: "" }; this.update();
    this.refreshModels(providerId, true);
    // Local Codex has a valid default model. Custom providers need an explicit
    // model selection, including when their discovery endpoint is unavailable.
    if (context.providers.find(provider => provider[0] === providerId)?.[2] === "local") this.save({}, "provider-select");
  }
  async save(change, controlId) {
    const opened = this.opened, context = this.context();
    if (!opened || opened.saving || context.owner !== opened.owner || context.busy || !context.available) return;
    let draft = opened.draft;
    if (draft) {
      change = { ...draft, ...change };
      opened.draft = draft = change;
      if (!change.model && context.providers.find(provider => provider[0] === change.providerId)?.[2] !== "local") {
        this.update(); return;
      }
    }
    opened.saving = true; this.update();
    try {
      await this.change(change, opened.origin);
      if (this.opened === opened && opened.draft === draft) opened.draft = null;
      if (change.providerId) this.refreshModels(change.providerId, true);
    } catch (error) { this.error(error); }
    finally {
      if (this.opened === opened) {
        opened.saving = false; this.update();
        if (this.opened === opened) [...this.surface.querySelectorAll("button")].find(element => element.dataset.control === controlId)?.focus({ preventScroll: true });
      }
    }
  }
  update() {
    const context = this.context(), trigger = this.trigger();
    if (trigger) {
      trigger.innerHTML = context.label;
      trigger.title = context.title;
      trigger.setAttribute("aria-expanded", String(Boolean(this.opened)));
    }
    if (!this.opened) return;
    if (!trigger || !context.available || context.busy || context.owner !== this.opened.owner) return this.close();
    if (this.opened.draft && !context.providers.some(provider => provider[0] === this.opened.draft.providerId)) return this.close();
    const config = this.selection();
    const signature = JSON.stringify([config, context.providers, this.opened.saving]);
    if (signature !== this.signature) {
      const focused = this.surface.contains(document.activeElement) ? document.activeElement.dataset.control || document.activeElement.id : "";
      this.signature = signature;
      closePicker(false, this.surface);
      this.surface.innerHTML = `<div class="composer-model-heading"><strong>模型配置</strong><button type="button" class="icon-button" data-model-close aria-label="关闭模型配置">${icon("close")}</button></div>${context.fields(this.opened.saving, config)}<div class="composer-model-footer"><span data-model-status role="status"></span><button type="button" class="icon-button" data-model-refresh aria-label="刷新模型列表">${icon("refresh")}</button></div>`;
      enhancePickers(this.surface);
      if (focused) [...this.surface.querySelectorAll("button")].find(element => element.dataset.control === focused || element.id === focused)?.focus({ preventScroll: true });
    }
    const status = context.status(config.providerId), note = this.surface.querySelector("[data-model-status]");
    note.textContent = this.opened.saving ? "正在保存…" : status?.loading ? "正在更新模型列表…"
      : status?.error ? status.at ? "列表更新失败，保留上次结果" : "列表更新失败，可手填模型 ID"
        : this.opened.draft ? "选择模型后保存新服务" : "选择后自动保存";
    note.title = status?.error || "";
    // Catalog refreshes coalesce; keep the button focusable while loading.
    this.surface.querySelector("[data-model-refresh]").setAttribute("aria-busy", String(Boolean(status?.loading)));
    this.position();
  }
  position() {
    if (!this.opened) return;
    const trigger = this.trigger(); if (!trigger) return this.close();
    const rect = trigger.getBoundingClientRect(), surface = this.surface;
    surface.style.maxHeight = `${Math.max(140, innerHeight - 16)}px`;
    surface.style.left = `${Math.max(8, Math.min(innerWidth - surface.offsetWidth - 8, rect.right - surface.offsetWidth))}px`;
    surface.style.top = `${Math.max(8, rect.top > surface.offsetHeight + 8 ? rect.top - surface.offsetHeight - 6 : Math.min(rect.bottom + 6, innerHeight - surface.offsetHeight - 8))}px`;
  }
  close(focus = false) {
    if (!this.opened) return;
    closePicker(); this.opened = null; this.signature = "";
    this.surface.remove(); this.surface = null;
    const trigger = this.trigger(); trigger?.setAttribute("aria-expanded", "false");
    if (focus) trigger?.focus({ preventScroll: true });
  }
}
