const object = value => value && typeof value === "object" && !Array.isArray(value);
const primitive = value => value === null || ["string", "boolean", "number"].includes(typeof value);

// The UI renders supported forms; automatic/WeChat consent also works with
// schemas that the form renderer does not understand.
export function supportedForm(schema, depth = 0) {
  if (!object(schema) || depth > 4) return false;
  const common = ["type", "title", "description", "default", "enum", "const"];
  const allowed = schema.type === "object"
    ? [...common, "properties", "required", "additionalProperties"]
    : schema.type === "array" ? [...common, "items", "minItems", "maxItems", "uniqueItems"]
    : [...common, "minLength", "maxLength", "format", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"];
  if (Object.keys(schema).some(key => !allowed.includes(key))) return false;
  if (schema.enum && (!Array.isArray(schema.enum) || schema.enum.length > 100 || !schema.enum.every(primitive))) return false;
  if (Object.hasOwn(schema, "const") && !primitive(schema.const)) return false;
  if (schema.type === "object") return object(schema.properties || {}) &&
    Object.keys(schema.properties || {}).length <= 24 &&
    Object.entries(schema.properties || {}).every(([key, value]) => !["__proto__", "constructor", "prototype"].includes(key) && supportedForm(value, depth + 1)) &&
    (schema.additionalProperties === undefined || typeof schema.additionalProperties === "boolean") &&
    (schema.required === undefined || Array.isArray(schema.required) && schema.required.every(key => Object.hasOwn(schema.properties || {}, key)));
  if (schema.type === "array") return supportedForm(schema.items, depth + 1);
  return ["string", "boolean", "integer", "number", "null"].includes(schema.type) &&
    (schema.format === undefined || ["date", "date-time", "email", "uri"].includes(schema.format));
}

export function validateForm(schema, content) {
  if (!supportedForm(schema)) return content ?? simpleConsent(schema);
  const visit = (shape, value, path = "表单") => {
    const fail = () => { throw new Error(`${path}的内容不符合请求。`); };
    if (shape.enum && !shape.enum.some(item => Object.is(item, value))) fail();
    if (Object.hasOwn(shape, "const") && !Object.is(shape.const, value)) fail();
    if (shape.type === "object") {
      if (!object(value)) fail();
      if ((shape.required || []).some(key => !Object.hasOwn(value, key))) fail();
      for (const [key, entry] of Object.entries(value)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) fail();
        if (!Object.hasOwn(shape.properties || {}, key)) { if (shape.additionalProperties === false) fail(); else continue; }
        visit(shape.properties[key], entry, key);
      }
    } else if (shape.type === "array") {
      if (!Array.isArray(value) || value.length > 100 || value.length < (shape.minItems || 0) || value.length > (shape.maxItems ?? 100)) fail();
      if (shape.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) fail();
      value.forEach(entry => visit(shape.items, entry, path));
    } else if (shape.type === "string") {
      if (typeof value !== "string" || value.length > 65536 || [...value].length < (shape.minLength || 0) || [...value].length > (shape.maxLength ?? 65536)) fail();
      if (shape.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail();
      if (["date", "date-time"].includes(shape.format) && !Number.isFinite(Date.parse(value))) fail();
      if (shape.format === "uri") { try { new URL(value); } catch { fail(); } }
    } else if (["integer", "number"].includes(shape.type)) {
      if (typeof value !== "number" || !Number.isFinite(value) || shape.type === "integer" && !Number.isInteger(value) ||
        value < (shape.minimum ?? -Infinity) || value > (shape.maximum ?? Infinity) ||
        shape.exclusiveMinimum !== undefined && value <= shape.exclusiveMinimum || shape.exclusiveMaximum !== undefined && value >= shape.exclusiveMaximum) fail();
    } else if (shape.type === "null" ? value !== null : typeof value !== "boolean") fail();
  };
  visit(schema, content);
  return content;
}

export function elicitationForm(params) {
  return supportedForm(params.requestedSchema) ? params.requestedSchema : null;
}

export function simpleConsent(schema) {
  const value = (shape = {}) => {
    if (Object.hasOwn(shape, "const")) return shape.const;
    if (Object.hasOwn(shape, "default")) return shape.default;
    if (Array.isArray(shape.enum) && shape.enum.length) return shape.enum.includes(true) ? true : shape.enum[0];
    if (shape.oneOf || shape.anyOf) return value((shape.oneOf || shape.anyOf)[0]);
    const type = Array.isArray(shape.type) ? shape.type.find(t => t !== "null") : shape.type;
    if (type === "object" || shape.properties) return Object.fromEntries(
      Object.entries(shape.properties || {}).map(([key, entry]) => [key,
        key === "approved" && entry.type === "boolean" && !Object.hasOwn(entry, "const") ? true : value(entry)]));
    if (type === "boolean") return true;
    if (type === "array") return Array.from({ length: shape.minItems || 0 }, () => value(shape.items));
    if (type === "number" || type === "integer") return shape.minimum ?? (shape.exclusiveMinimum !== undefined ? shape.exclusiveMinimum + 1 : 0);
    if (type === "string") return shape.format === "date" ? new Date().toISOString().slice(0, 10)
      : shape.format === "date-time" ? new Date().toISOString()
      : shape.format === "uri" ? "https://example.com" : shape.format === "email" ? "user@example.com" : "".padEnd(shape.minLength || 0, " ");
    return type === "null" ? null : {};
  };
  return value(schema || { type: "object" });
}
