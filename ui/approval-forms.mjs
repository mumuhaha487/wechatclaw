export function approvalFields(request, esc) {
  if (request.kind !== "form" || request.consent !== null) return "";
  return Object.entries(request.form.properties || {}).map(([key, schema], index) => {
    const required = request.form.required?.includes(key), name = `approval-field-${index}`;
    const title = `${schema.title || key}${required ? " *" : ""}`;
    const value = request.fieldValues?.[index] ?? "";
    const attributes = `id="${name}" aria-label="${esc(title)}" data-approval-field="${index}" ${required ? "required" : ""}`;
    let control;
    if (schema.enum || schema.type === "boolean") {
      const choices = schema.enum || [true, false];
      control = `<select ${attributes}><option value="">请选择</option>${choices.map((entry, choice) => `<option value="${choice}" ${String(choice) === value ? "selected" : ""}>${esc(typeof entry === "boolean" ? entry ? "是" : "否" : String(entry))}</option>`).join("")}</select>`;
    } else if (["object", "array", "null"].includes(schema.type)) control = `<textarea ${attributes} placeholder="填写 JSON 内容" autocomplete="off">${esc(value)}</textarea>`;
    else {
      const password = /password|secret|token|密码|密钥/i.test(key + (schema.title || ""));
      const type = password ? "password" : ["integer", "number"].includes(schema.type) ? "number" : schema.format === "email" ? "email" : "text";
      control = `<input ${attributes} type="${type}" value="${esc(value)}" autocomplete="off" ${schema.type === "number" ? 'step="any"' : ""}>`;
    }
    return `<label class="approval-field" for="${name}"><span>${esc(title)}</span>${control}${schema.description ? `<small>${esc(schema.description)}</small>` : ""}</label>`;
  }).join("");
}

export function approvalContent(request, root) {
  if (request.kind !== "form") return undefined;
  if (!root || root.dataset.approvalKey !== request.key) throw new Error("确认内容所属的请求已经变化，请重新查看。");
  if (request.consent !== null) return request.consent;
  const content = Object.create(null);
  Object.entries(request.form.properties || {}).forEach(([key, schema], index) => {
    const control = root.querySelector(`[data-approval-field="${index}"]`), value = control?.value ?? "";
    if (!control || !control.checkValidity()) throw new Error(`请正确填写${schema.title || key}。`);
    if (value === "" && !request.form.required?.includes(key)) return;
    if (schema.enum || schema.type === "boolean") {
      const choices = schema.enum || [true, false];
      if (!/^\d+$/.test(value) || !Object.hasOwn(choices, Number(value))) throw new Error(`请选择${schema.title || key}。`);
      content[key] = choices[Number(value)];
    } else if (["object", "array", "null"].includes(schema.type)) {
      try { content[key] = JSON.parse(value); } catch { throw new Error(`${schema.title || key}需要填写有效的 JSON。`); }
    } else content[key] = ["integer", "number"].includes(schema.type) ? Number(value) : value;
  });
  return content;
}
