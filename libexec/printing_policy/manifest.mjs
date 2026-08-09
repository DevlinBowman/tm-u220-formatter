// Serializes and parses the byte-exact installed printing manifest shared by every runtime.
// Parsing rejects non-canonical bytes so the manifest hash identifies one unambiguous policy.
import { TextDecoder } from "node:util";
import { normalizeProbeEvidence } from "./evidence.mjs";
import { normalizeIdentity } from "./identity.mjs";
import { validatePrinterIPv4 } from "./ipv4.mjs";
import { parseProfile, loadInstalledProfile } from "./profile.mjs";
import {
  artifactPolicy, FIXED_ROUTE_SPECS, LPD_ROUTE_SPEC, LIVE_ROUTE_SPEC,
  MANIFEST_HEADER, PROFILE_DESTINATION, SCHEMA_VERSION,
} from "./spec.mjs";
import { exactInteger, freezePolicy, immutableByteRecord, sha256 } from "./validation.mjs";
import { readConstrainedFile } from "./safe_file.mjs";

const BASE_FIELDS = Object.freeze([
  "account_name", "account_uid", "printer_ipv4", "profile_path", "profile_bytes",
  "profile_sha256", "probe_mode", "probe_recorded_at",
]);
const ROUTE_FIELDS = Object.freeze([
  "live_destination_port", "live_timeout_seconds", "live_source_ports", "lpd_queue",
  "lpd_destination_port", "lpd_timeout_seconds", "lpd_source_ports",
]);
const EVIDENCE_FIELDS = Object.freeze({
  verified: ["probe_model", "probe_model_id"],
  offline: ["probe_error", "probe_acceptance"],
  deferred: ["probe_reason"],
});

function decodeManifest(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new Error("printing manifest must be a byte buffer");
  if (bytes.length < 1 || bytes.length > artifactPolicy.manifest.maxBytes) {
    throw new Error("printing manifest byte length is outside the allowed range");
  }
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("printing manifest must contain valid UTF-8");
  }
  if (source.includes("\r")) throw new Error("printing manifest must use LF line endings");
  if (!source.endsWith("\n")) throw new Error("printing manifest must end with LF");
  if (source.includes("\0")) throw new Error("printing manifest must not contain NUL bytes");
  return source;
}

function parseFields(source) {
  const lines = source.slice(0, -1).split("\n");
  if (lines.shift() !== MANIFEST_HEADER) {
    throw new Error(`printing manifest header must be exactly ${MANIFEST_HEADER}`);
  }
  const fields = {};
  const order = [];
  for (const line of lines) {
    const match = line.match(/^([a-z][a-z0-9_]*)=([^=\n]+)$/);
    if (!match) throw new Error("printing manifest fields must use strict non-empty key=value syntax");
    const [, key, value] = match;
    if (Object.hasOwn(fields, key)) throw new Error(`duplicate printing manifest field ${key}`);
    fields[key] = value;
    order.push(key);
  }
  const evidenceFields = EVIDENCE_FIELDS[fields.probe_mode];
  if (!evidenceFields) throw new Error("probe mode must be verified, deferred, or explicitly accepted offline");
  const expected = [...BASE_FIELDS, ...evidenceFields, ...ROUTE_FIELDS];
  if (order.length !== expected.length
      || order.some((field, index) => field !== expected[index])) {
    throw new Error(`printing manifest fields must appear exactly as: ${expected.join(", ")}`);
  }
  return fields;
}

function validateFixedFields(fields) {
  const exact = new Map([
    ["profile_path", PROFILE_DESTINATION],
    ["live_destination_port", String(LIVE_ROUTE_SPEC.destinationPort)],
    ["live_timeout_seconds", String(LIVE_ROUTE_SPEC.timeoutSeconds)],
    ["live_source_ports", LIVE_ROUTE_SPEC.sourcePorts.join(",")],
    ["lpd_queue", LPD_ROUTE_SPEC.queue],
    ["lpd_destination_port", String(LPD_ROUTE_SPEC.destinationPort)],
    ["lpd_timeout_seconds", String(LPD_ROUTE_SPEC.timeoutSeconds)],
    ["lpd_source_ports", LPD_ROUTE_SPEC.sourcePorts.join(",")],
  ]);
  for (const [key, expected] of exact) {
    if (fields[key] !== expected) throw new Error(`${key} differs from fixed printing policy`);
  }
}

function routesForHost(host) {
  return FIXED_ROUTE_SPECS.map((spec) => freezePolicy({ ...spec, host,
    sourcePorts: [...spec.sourcePorts] }));
}

export function parseManifest(bytes) {
  const source = decodeManifest(bytes);
  const fields = parseFields(source);
  validateFixedFields(fields);
  const identity = normalizeIdentity({ name: fields.account_name, uid: fields.account_uid });
  const host = validatePrinterIPv4(fields.printer_ipv4);
  const byteLength = exactInteger(fields.profile_bytes, "profile byte length", 1,
    artifactPolicy.profile.maxBytes);
  if (!/^[0-9a-f]{64}$/.test(fields.profile_sha256)) {
    throw new Error("profile SHA-256 must be 64 lowercase hexadecimal digits");
  }
  const probe = normalizeProbeEvidence(fields);
  return immutableByteRecord(bytes, {
    hash: sha256(bytes), schemaVersion: SCHEMA_VERSION,
    identity, host,
    profile: { path: PROFILE_DESTINATION, byteLength, hash: fields.profile_sha256 },
    probe, routes: routesForHost(host),
  });
}

function manifestLines(identity, host, profile, probe) {
  const values = [MANIFEST_HEADER, `account_name=${identity.name}`, `account_uid=${identity.uid}`,
    `printer_ipv4=${host}`, `profile_path=${PROFILE_DESTINATION}`,
    `profile_bytes=${profile.byteLength}`, `profile_sha256=${profile.hash}`,
    `probe_mode=${probe.mode}`, `probe_recorded_at=${probe.recordedAt}`];
  if (probe.mode === "verified") values.push(`probe_model=${probe.model}`,
    `probe_model_id=${probe.modelId}`);
  if (probe.mode === "offline") values.push(`probe_error=${probe.error}`,
    `probe_acceptance=${probe.acceptance}`);
  if (probe.mode === "deferred") values.push(`probe_reason=${probe.reason}`);
  values.push(`live_destination_port=${LIVE_ROUTE_SPEC.destinationPort}`,
    `live_timeout_seconds=${LIVE_ROUTE_SPEC.timeoutSeconds}`,
    `live_source_ports=${LIVE_ROUTE_SPEC.sourcePorts.join(",")}`,
    `lpd_queue=${LPD_ROUTE_SPEC.queue}`,
    `lpd_destination_port=${LPD_ROUTE_SPEC.destinationPort}`,
    `lpd_timeout_seconds=${LPD_ROUTE_SPEC.timeoutSeconds}`,
    `lpd_source_ports=${LPD_ROUTE_SPEC.sourcePorts.join(",")}`, "");
  return values;
}

export function createManifest({ identity: identityValue, host: hostValue,
  profile: profileValue, probe: probeValue }) {
  const identity = normalizeIdentity(identityValue);
  const host = validatePrinterIPv4(hostValue);
  const profile = parseProfile(profileValue?.bytes ?? profileValue);
  const probe = normalizeProbeEvidence(probeValue);
  return parseManifest(Buffer.from(manifestLines(identity, host, profile, probe).join("\n"), "utf8"));
}

export function loadInstalledManifest(runtime = {}) {
  const policy = artifactPolicy.manifest;
  const loaded = readConstrainedFile(policy.path, {
    label: "installed printing manifest", maxBytes: policy.maxBytes,
    uid: policy.uid, gid: policy.gid, mode: policy.mode,
  }, runtime);
  return parseManifest(loaded.bytes);
}

export function loadInstalledPolicy(runtime = {}) {
  const manifest = loadInstalledManifest(runtime);
  const profile = loadInstalledProfile(runtime);
  if (profile.byteLength !== manifest.profile.byteLength || profile.hash !== manifest.profile.hash) {
    throw new Error("installed printer profile does not match the canonical manifest");
  }
  return freezePolicy({ manifest, profile });
}
