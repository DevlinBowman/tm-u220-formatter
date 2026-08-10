// Tracks one schema-bound image-profile draft independently from preview and persistence I/O.
// Save completion advances the server revision without discarding newer browser edits.
import { serializeProfile } from "./profile-source.js";

function choices(field) {
  return Array.isArray(field.choices) ? field.choices.map(String) : null;
}

function integerValue(field, raw) {
  const text = String(raw);
  if (!/^\d+$/.test(text)) throw new RangeError(`${field.name} must be an integer`);
  const value = Number(text);
  const minimum = Number.isInteger(field.minimum) ? field.minimum : 0;
  const maximum = Number.isInteger(field.maximum) ? field.maximum : Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${field.name} must be ${minimum} through ${maximum}`);
  }
  return value;
}

export function normalizeFieldValue(field, raw) {
  if (raw === field.keyword && typeof field.keyword === "string") return raw;
  const allowed = choices(field);
  if (allowed) {
    const value = String(raw);
    if (!allowed.includes(value)) throw new RangeError(`${field.name} is outside its choices`);
    return value;
  }
  if (field.kind === "boolean" || typeof field.default === "boolean") {
    if (raw !== true && raw !== false) throw new TypeError(`${field.name} must be boolean`);
    return raw;
  }
  if (field.kind?.includes("integer") || Number.isInteger(field.default)
      || Number.isInteger(field.minimum) || Number.isInteger(field.maximum)) {
    return integerValue(field, raw);
  }
  throw new TypeError(`${field.name} has an unsupported schema kind`);
}

function normalizedSchema(schema) {
  if (!schema || !Number.isInteger(schema.version) || typeof schema.header !== "string"
      || !Array.isArray(schema.fields) || schema.fields.length === 0) {
    throw new TypeError("image profile schema must describe its fields");
  }
  const names = new Set();
  const fields = schema.fields.map((field) => {
    if (!field || typeof field.name !== "string" || names.has(field.name)) {
      throw new TypeError("image profile schema field names must be unique");
    }
    names.add(field.name);
    return Object.freeze({ ...field,
      choices: field.choices ? Object.freeze([...field.choices]) : undefined });
  });
  return Object.freeze({ ...schema, fields: Object.freeze(fields) });
}

function normalizedValues(schema, values) {
  const result = {};
  for (const field of schema.fields) {
    if (!Object.hasOwn(values || {}, field.name)) {
      throw new TypeError(`image profile is missing ${field.name}`);
    }
    const raw = values[field.name];
    const integer = field.kind?.includes("integer") || Number.isInteger(field.default)
      || Number.isInteger(field.minimum) || Number.isInteger(field.maximum);
    if (integer && raw !== field.keyword && typeof raw !== "number") {
      throw new TypeError(`${field.name} must be an integer`);
    }
    result[field.name] = normalizeFieldValue(field, raw);
  }
  return result;
}

function sameValues(schema, left, right) {
  return schema.fields.every(({ name }) => left[name] === right[name]);
}

export class ImageProfileModel {
  constructor(session) { this.applySession(session, true); }

  applySession(session, initial = false, submittedSource = null) {
    const schema = normalizedSchema(session?.schema);
    const saved = normalizedValues(schema, session?.image_profile);
    const canonical = serializeProfile(schema, saved);
    if (typeof session?.revision !== "string" || session.source !== canonical) {
      throw new TypeError("image profile session is not canonical");
    }
    const currentSource = initial ? null : this.source;
    const currentDraft = initial ? null : { ...this.draft };
    this.schema = schema;
    this.saved = saved;
    this.revision = session.revision;
    this.imageName = String(session.image_name || "image");
    this.profileName = String(session.profile_name || "default.u220i");
    const savedSubmitted = !initial && currentSource === submittedSource;
    this.draft = initial || savedSubmitted
      ? { ...saved } : normalizedValues(schema, currentDraft);
    return this.dirty === false;
  }

  get fields() { return this.schema.fields; }
  get source() { return serializeProfile(this.schema, this.draft); }
  get dirty() { return !sameValues(this.schema, this.draft, this.saved); }
  get fitDisabled() { return this.draft.default_height_cells === "auto"; }

  value(name) {
    if (!Object.hasOwn(this.draft, name)) throw new RangeError(`unknown profile field ${name}`);
    return this.draft[name];
  }

  set(name, raw) {
    const field = this.fields.find((item) => item.name === name);
    if (!field) throw new RangeError(`unknown profile field ${name}`);
    this.draft[name] = normalizeFieldValue(field, raw);
  }

  revert() { this.draft = { ...this.saved }; }
}
