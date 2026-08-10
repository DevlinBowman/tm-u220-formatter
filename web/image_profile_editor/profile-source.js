// Serializes browser-owned profile drafts into the canonical versioned text envelope.
// Validation and persistence remain authoritative on the loopback server and Lua profile parser.
function encodedValue(field, value) {
  if (field.kind === "boolean" || typeof field.default === "boolean") {
    if (typeof value !== "boolean") throw new TypeError(`${field.name} must be boolean`);
    return value ? "on" : "off";
  }
  const text = String(value);
  if (!text || /[\r\n=]/.test(text)) {
    throw new TypeError(`${field.name} cannot be serialized`);
  }
  return text;
}

export function serializeProfile(schema, values) {
  if (!schema || typeof schema.header !== "string" || !schema.header
      || /[\r\n]/.test(schema.header) || !Array.isArray(schema.fields)) {
    throw new TypeError("image profile schema is invalid");
  }
  const lines = [schema.header];
  for (const field of schema.fields) {
    if (!field || typeof field.name !== "string" || !field.name
        || !Object.hasOwn(values || {}, field.name)) {
      throw new TypeError("image profile values do not match the schema");
    }
    lines.push(`${field.name}=${encodedValue(field, values[field.name])}`);
  }
  return `${lines.join("\n")}\n`;
}
