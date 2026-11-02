// One renderer-owned picker for the composer, settings and account forms.
// Native select/datalist popups cannot inherit the desktop design system.
import { icon } from "./icons.mjs";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let active = null;
let onOpen = () => {};
let modelData = () => ({});
export function configurePickers(options) {
  onOpen = options.onOpen;
  modelData = options.modelData;
}
export function closePicker(restoreFocus = false, within) {
  if (!active) return;
  if (within && !within.contains(active.control)) return;
  const { trigger, surface } = active;
  trigger.setAttribute("aria-expanded", "false");
  surface.remove();
  active = null;
  if (restoreFocus && trigger.isConnected) trigger.focus();
}
function sourceOptions(control) {
  if (control.tagName === "SELECT")
    return [...control.options].map((o) => ({
      value: o.value,
      label:
        !o.value && control.dataset.modelProvider === "local"
          ? "本机默认"
          : o.textContent,
      disabled: o.disabled,
      description: o.dataset.description,
    }));
  const id = control.dataset.modelProvider;
  const data = modelData(id, control.value);
  return [
    { value: "", label: id === "local" ? "本机默认模型" : "选择模型" },
    ...data.models.map((m) => ({
      value: m.model || m.id,
      label: m.displayName || m.model || m.id,
      description: m.description,
    })),
  ];
}
function position() {
  if (!active) return;
  const { trigger, surface } = active;
  if (!trigger.isConnected) return closePicker();
  const rect = trigger.getBoundingClientRect();
  const width = surface.offsetWidth;
  const height = surface.offsetHeight;
  const top =
    rect.top > height + 12 &&
    (!trigger.closest(".settings-content,.modal") ||
      innerHeight - rect.bottom < height + 12);
  surface.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.left))}px`;
  surface.style.top = `${Math.max(8, top ? rect.top - height - 6 : Math.min(rect.bottom + 6, innerHeight - height - 8))}px`;
  surface.dataset.side = top ? "top" : "bottom";
}
function choose(value) {
  const control = active?.control;
  if (!control) return;
  if (
    control.tagName === "SELECT" &&
    ![...control.options].some((o) => o.value === value)
  )
    control.add(new Option(value, value));
  control.value = value;
  closePicker(true);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
  syncPicker(control);
}
function renderRows() {
  if (!active) return;
  const { control, surface, query } = active;
  const refreshFocused = surface.contains(document.activeElement) && document.activeElement?.matches(".picker-refresh");
  const focusedValue =
    document.activeElement?.closest(".picker-option")?.dataset.value;
  const id = control.dataset.modelProvider;
  const data = id ? modelData(id, control.value) : {};
  const choices = sourceOptions(control).filter(
    (o) =>
      !query ||
      `${o.label} ${o.value}`.toLowerCase().includes(query.toLowerCase()),
  );
  const list = surface.querySelector(".picker-options");
  list.innerHTML =
    choices
      .map(
        (o) =>
          `<button type="button" class="picker-option${o.value === control.value ? " selected" : ""}" role="option" aria-selected="${o.value === control.value}" data-value="${escape(o.value)}" ${o.disabled ? "disabled" : ""}><span class="grow"><span class="picker-label">${escape(o.label)}</span>${o.description ? `<span class="picker-description">${escape(o.description)}</span>` : ""}</span>${o.value === control.value ? icon("check") : ""}</button>`,
      )
      .join("") || '<div class="picker-empty">没有匹配的选项</div>';
  if (id) {
    const note = data.status?.loading
      ? "正在更新模型列表…"
      : data.status?.error
        ? `更新失败 · ${data.status.at ? "保留上次结果" : "可直接输入模型 ID"}`
        : data.status?.at
          ? `已同步 · ${new Date(data.status.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
          : "从模型服务读取列表";
    surface.querySelector(".picker-footer").innerHTML =
      `<span title="${escape(data.status?.error || "")}">${escape(note)}</span><button type="button" class="picker-refresh" aria-label="刷新模型列表">${icon("refresh")}</button>`;
    if (refreshFocused) surface.querySelector(".picker-refresh").focus({ preventScroll: true });
    const custom = surface.querySelector(".picker-custom");
    custom.hidden = !query || choices.some((o) => o.value === query);
    custom.textContent = `使用模型 ID：${query}`;
  }
  position();
  if (focusedValue !== undefined)
    [...list.querySelectorAll(".picker-option")]
      .find((el) => el.dataset.value === focusedValue)
      ?.focus({ preventScroll: true });
}
function open(control, trigger) {
  if (active?.control === control) return closePicker();
  closePicker();
  const model = Boolean(control.dataset.modelProvider);
  const surface = document.createElement("div");
  surface.className = `picker-menu${model ? " model-menu" : ""}${control.id.includes("permission") ? " permission-menu" : ""}`;
  surface.setAttribute("role", "listbox");
  surface.setAttribute(
    "aria-label",
    control.getAttribute("aria-label") || "选择选项",
  );
  surface.id = "desktop-picker";
  surface.innerHTML = `${model ? `<div class="picker-search">${icon("search")}<input type="search" placeholder="搜索或输入模型 ID…" aria-label="搜索模型" autocomplete="off"></div>` : ""}<div class="picker-options"></div>${model ? '<button type="button" class="picker-custom" hidden></button><div class="picker-footer"></div>' : ""}`;
  document.body.append(surface);
  active = { control, trigger, surface, query: "" };
  trigger.setAttribute("aria-expanded", "true");
  trigger.setAttribute("aria-controls", surface.id);
  surface.addEventListener("click", (event) => {
    const option = event.target.closest(".picker-option");
    if (option && !option.disabled) choose(option.dataset.value);
    if (event.target.closest(".picker-custom")) choose(active.query.trim());
    if (event.target.closest(".picker-refresh"))
      onOpen(control.dataset.modelProvider, true);
  });
  surface.querySelector("input")?.addEventListener("input", (event) => {
    if (active?.surface !== surface) return;
    active.query = event.target.value;
    renderRows();
  });
  renderRows();
  if (model) {
    surface.querySelector("input").focus();
    onOpen(control.dataset.modelProvider, false);
  } else surface.querySelector('[aria-selected="true"]')?.focus();
}
export function syncPicker(control) {
  const trigger = control._pickerTrigger;
  if (!trigger) return;
  const label =
    control.tagName === "SELECT"
      ? control.selectedOptions[0]?.textContent
      : control.value || control.placeholder;
  trigger.innerHTML = `<span class="ellipsis">${escape(label || "选择")}</span>${icon("down")}`;
  trigger.disabled = control.disabled;
  trigger.title = label || "选择";
  if (active?.control === control) renderRows();
}
export function refreshPickers() {
  document
    .querySelectorAll("select,input[data-model-provider]")
    .forEach(syncPicker);
  if (active) renderRows();
}
export function enhancePickers(root = document) {
  root.querySelectorAll("select").forEach((control) => {
    if (control._pickerTrigger) return syncPicker(control);
    control.classList.add("native-picker-source");
    control.tabIndex = -1;
    control.setAttribute("aria-hidden", "true");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "picker-trigger";
    trigger.dataset.control = control.id || control.name;
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute(
      "aria-label",
      control.getAttribute("aria-label") ||
        control.closest("label")?.querySelector(".field-label")?.textContent ||
        control.name,
    );
    control.after(trigger);
    control._pickerTrigger = trigger;
    trigger.addEventListener("click", () => open(control, trigger));
    trigger.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        open(control, trigger);
      }
    });
    control.addEventListener("change", () => syncPicker(control));
    syncPicker(control);
  });
  root.querySelectorAll("input[list]").forEach((control) => {
    const list = document.getElementById(control.getAttribute("list"));
    control.removeAttribute("list");
    list?.remove();
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "picker-trigger model-field-trigger";
    trigger.innerHTML = icon("down");
    trigger.setAttribute("aria-label", "选择模型");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const wrap = document.createElement("div");
    wrap.className = "model-field";
    control.before(wrap);
    wrap.append(control, trigger);
    trigger.addEventListener("click", () => open(control, trigger));
    control.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        open(control, trigger);
      }
    });
  });
}
document.addEventListener("pointerdown", (event) => {
  if (
    active &&
    !active.surface.contains(event.target) &&
    !active.trigger.contains(event.target)
  )
    closePicker();
});
document.addEventListener(
  "keydown",
  (event) => {
    if (!active || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closePicker(true);
      return;
    }
    if (event.key === "Tab") {
      closePicker(true);
      return;
    }
    if (
      event.key === "Enter" &&
      event.target.matches(".picker-search input") &&
      active.query &&
      !active.surface.querySelector(".picker-option")
    ) {
      event.preventDefault();
      choose(active.query.trim());
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const rows = [
      ...active.surface.querySelectorAll(".picker-option:not(:disabled)"),
    ];
    const index = rows.indexOf(document.activeElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? rows.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) %
            rows.length;
    rows[next]?.focus();
  },
  true,
);
window.addEventListener("resize", () => closePicker());
document.addEventListener(
  "scroll",
  (event) => {
    if (active && !active.surface.contains(event.target)) closePicker();
  },
  true,
);
