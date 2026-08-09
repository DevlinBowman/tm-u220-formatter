// Provides small strict validators shared by policy parsing and rendering.
// They reject ambiguous text before it can influence privileged paths or commands.
import { createHash } from "node:crypto";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function immutableByteRecord(bytes, fields = {}) {
  if (!Buffer.isBuffer(bytes)) throw new Error("immutable byte record requires a buffer");
  const saved = Buffer.from(bytes);
  const value = { ...fields };
  Object.defineProperty(value, "bytes", {
    enumerable: true,
    get() { return Buffer.from(saved); },
  });
  return freezePolicy(value);
}

export function exactInteger(value, label, minimum, maximum) {
  const text = String(value);
  if (!/^(?:0|[1-9][0-9]*)$/.test(text)) throw new Error(`${label} must be a canonical integer`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} is outside the allowed range`);
  }
  return number;
}

export function validateAccountName(value) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw new Error("account name contains characters that are unsafe for policy display");
  }
  return value;
}

export function validateTimestamp(value) {
  if (typeof value !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error("probe recorded time must be canonical UTC RFC 3339 with milliseconds");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error("probe recorded time is not a real canonical UTC instant");
  }
  return value;
}

export function freezePolicy(value) {
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezePolicy(item);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) freezePolicy(item);
  }
  return Object.freeze(value);
}
