// Creates and validates the deterministic installed-file manifest used for integrity inspection.
import { createHash } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const VERSION_PATH = fileURLToPath(new URL("../VERSION", import.meta.url));
export const APPLICATION_VERSION = fs.readFileSync(VERSION_PATH, "utf8").trim();
if (!/^\d+\.\d+\.\d+$/.test(APPLICATION_VERSION)) {
  throw new Error("VERSION must contain one semantic version");
}
export const MANIFEST_NAME = ".tm-u220-install.json";
export const MANIFEST_SCHEMA = "tm-u220-install";
export const MANIFEST_SCHEMA_VERSION = 1;
export const SOURCE_TRUST = "local-unverified-source";
export const SNAPSHOT_VERIFICATION = "two-pass-byte-match";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validPayloadPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && !value.startsWith("/") && !value.includes("\\")
    && value.split("/").every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part));
}

function canonicalEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("payload is empty");
  const result = entries.map((entry) => {
    if (!entry || !validPayloadPath(entry.path)) throw new Error("invalid payload path");
    if (![0o644, 0o755].includes(entry.mode)) throw new Error(`invalid mode for ${entry.path}`);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error(`invalid byte count for ${entry.path}`);
    }
    if (!/^[0-9a-f]{64}$/.test(entry.sha256 || "")) {
      throw new Error(`invalid SHA-256 for ${entry.path}`);
    }
    return { path: entry.path, mode: entry.mode, bytes: entry.bytes, sha256: entry.sha256 };
  }).sort((left, right) => left.path.localeCompare(right.path));
  for (let index = 1; index < result.length; index += 1) {
    if (result[index - 1].path === result[index].path) {
      throw new Error(`duplicate payload path: ${result[index].path}`);
    }
  }
  return result;
}

function contentHash(entries) {
  return sha256(Buffer.from(JSON.stringify(entries), "utf8"));
}

export function createManifest(entries, version = APPLICATION_VERSION) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("invalid application version");
  const payload = canonicalEntries(entries);
  const hash = contentHash(payload);
  return Object.freeze({ schema: MANIFEST_SCHEMA, schemaVersion: MANIFEST_SCHEMA_VERSION,
    applicationVersion: version, releaseId: `${version}-${hash.slice(0, 16)}`,
    contentHash: hash, sourceTrust: SOURCE_TRUST,
    snapshotVerification: SNAPSHOT_VERIFICATION,
    payload: Object.freeze(payload.map(Object.freeze)) });
}

export function manifestBytes(manifest) {
  const checked = validateManifest(manifest);
  return Buffer.from(`${JSON.stringify(checked, null, 2)}\n`, "utf8");
}

export function validateManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("install manifest must be an object");
  }
  const keys = Object.keys(value).sort();
  const expected = ["applicationVersion", "contentHash", "payload", "releaseId",
    "schema", "schemaVersion", "snapshotVerification", "sourceTrust"].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error("install manifest fields are not canonical");
  }
  if (value.schema !== MANIFEST_SCHEMA || value.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error("unsupported install manifest schema");
  }
  if (value.sourceTrust !== SOURCE_TRUST || value.snapshotVerification !== SNAPSHOT_VERIFICATION) {
    throw new Error("install manifest source provenance is invalid");
  }
  const canonical = createManifest(value.payload, value.applicationVersion);
  if (canonical.contentHash !== value.contentHash || canonical.releaseId !== value.releaseId) {
    throw new Error("install manifest identity does not match its payload");
  }
  return canonical;
}

export function parseManifest(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 1024 * 1024) {
    throw new Error("install manifest has an invalid size");
  }
  if (bytes.length === 0 || bytes.at(-1) !== 0x0a) {
    throw new Error("install manifest must end with LF");
  }
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("install manifest is not valid JSON"); }
  return validateManifest(parsed);
}
