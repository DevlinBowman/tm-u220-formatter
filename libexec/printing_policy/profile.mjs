// Loads and validates the exact physical-printer profile selected for installation.
// The original bytes are preserved and hashed so runtime interpretation remains inspectable.
import { TextDecoder } from "node:util";
import { artifactPolicy } from "./spec.mjs";
import { readConstrainedFile } from "./safe_file.mjs";
import { freezePolicy, immutableByteRecord, sha256 } from "./validation.mjs";

const PROFILE_HEADER = "!tm-u220 profile 1";
const REQUIRED_FIELDS = Object.freeze(["variant", "paper", "dip2_1", "cutter"]);
const KNOWN_FIELDS = new Set(REQUIRED_FIELDS);

function decodeBytes(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new Error("printer profile must be a byte buffer");
  if (bytes.length < 1 || bytes.length > artifactPolicy.profile.maxBytes) {
    throw new Error("printer profile byte length is outside the allowed range");
  }
  if (bytes.some((byte) => byte !== 0x09 && byte !== 0x0a
      && (byte < 0x20 || byte > 0x7e))) {
    throw new Error("printer profile must use unambiguous printable ASCII with LF line endings");
  }
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return source;
  } catch {
    throw new Error("printer profile must contain valid printable text");
  }
}

function validateOptions(values) {
  if (!new Set(["A", "B", "D"]).has(values.variant)) {
    throw new Error("profile variant must be A, B, or D");
  }
  if (!new Set(["76", "69.5", "57.5"]).has(values.paper)) {
    throw new Error("profile paper must be 76, 69.5, or 57.5");
  }
  if (values.variant === "A" && values.paper !== "76") {
    throw new Error("TM-U220A supports only 76 mm paper");
  }
  if (!new Set(["on", "off"]).has(values.dip2_1)) {
    throw new Error("profile dip2_1 must be on or off");
  }
  if (!new Set(["partial", "full", "none"]).has(values.cutter)) {
    throw new Error("profile cutter must be partial, full, or none");
  }
  if (values.variant === "D" && values.cutter !== "none") {
    throw new Error("TM-U220D has no autocutter, so its profile cutter must be none");
  }
  if (values.variant !== "D" && values.cutter === "none") {
    throw new Error(`TM-U220${values.variant} has an autocutter, so cutter cannot be none`);
  }
}

export function parseProfile(bytes) {
  const source = decodeBytes(bytes);
  const lines = source.split("\n").map((line) => line.endsWith("\r") ? line.slice(0, -1) : line);
  const content = lines.map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim() !== "" && !/^\s*#/.test(line));
  if (content[0]?.line !== PROFILE_HEADER) {
    throw new Error(`first profile content line must be exactly ${PROFILE_HEADER}`);
  }
  const values = {};
  for (const { line, number } of content.slice(1)) {
    if (line === PROFILE_HEADER) throw new Error(`duplicate profile header on line ${number}`);
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=([^=]*)$/);
    if (!match) throw new Error(`invalid profile key=value syntax on line ${number}`);
    const [, key, value] = match;
    if (!KNOWN_FIELDS.has(key)) throw new Error(`unknown profile field ${key}`);
    if (Object.hasOwn(values, key)) throw new Error(`duplicate profile field ${key}`);
    values[key] = value;
  }
  for (const key of REQUIRED_FIELDS) {
    if (!Object.hasOwn(values, key)) throw new Error(`missing required profile field ${key}`);
  }
  validateOptions(values);
  return immutableByteRecord(bytes, { byteLength: bytes.length,
    hash: sha256(bytes), options: { ...values } });
}

export function loadSelectedProfile(filePath, runtime = {}) {
  const loaded = readConstrainedFile(filePath, {
    label: "selected printer profile", maxBytes: artifactPolicy.profile.maxBytes,
  }, runtime);
  return parseProfile(loaded.bytes);
}

export function loadInstalledProfile(runtime = {}) {
  const policy = artifactPolicy.profile;
  const loaded = readConstrainedFile(policy.path, {
    label: "installed printer profile", maxBytes: policy.maxBytes,
    uid: policy.uid, gid: policy.gid, mode: policy.mode,
  }, runtime);
  return parseProfile(loaded.bytes);
}
