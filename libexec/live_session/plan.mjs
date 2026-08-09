// Validates live checkpoint plans against the root-owned installed printing manifest.
import fs from "node:fs";
import { loadInstalledManifest } from "../printing_policy/index.mjs";

function installedLiveRoute(options = {}) {
  const loaded = options.policy || loadInstalledManifest(options.runtime);
  const manifest = loaded.manifest || loaded;
  const route = manifest.routes?.find((candidate) => candidate.name === "live");
  if (!route) throw new Error("installed printing manifest has no live route");
  return route;
}

function integer(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function resetOffsets(value, index, payloadLength) {
  if (!Array.isArray(value)) {
    throw new Error(`step ${index} reset offsets must be an array`);
  }
  let previous = 0;
  return value.map((offset) => {
    integer(offset, `step ${index} reset offset`, 1, payloadLength);
    if (offset <= previous) {
      throw new Error(`step ${index} reset offsets must be strictly increasing`);
    }
    previous = offset;
    return offset;
  });
}

function loadStep(step, index) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    throw new Error(`step ${index} must be an object`);
  }
  if (step.index !== index) throw new Error(`step ${index} has a mismatched index`);
  if (!["line", "motion", "cut", "control"].includes(step.kind)) {
    throw new Error(`step ${index} has an invalid kind`);
  }
  if (typeof step.payload_hex !== "string" || step.payload_hex.length === 0
      || step.payload_hex.length % 2 !== 0 || /[^0-9a-f]/i.test(step.payload_hex)) {
    throw new Error(`step ${index} has invalid payload hex`);
  }
  if (step.display !== null && step.display !== undefined
      && typeof step.display !== "string") {
    throw new Error(`step ${index} display must be text or null`);
  }
  const payload = Buffer.from(step.payload_hex, "hex");
  return {
    index,
    kind: step.kind,
    payload,
    resetAfterByteOffsets: resetOffsets(
      step.reset_after_byte_offsets, index, payload.length),
    display: step.display || null,
    previewLineIndex: step.preview_line_index || null,
  };
}

export function validatePlan(value, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("live plan must be an object");
  }
  const route = installedLiveRoute(options);
  if (value.version !== 1) throw new Error("unsupported live plan version");
  if (value.host !== route.host || value.port !== route.destinationPort) {
    throw new Error("live endpoint differs from the installed printing manifest");
  }
  if (!Array.isArray(value.source_ports)
      || value.source_ports.length !== route.sourcePorts.length
      || value.source_ports.some((port, index) => port !== route.sourcePorts[index])) {
    throw new Error("live source-port policy does not match the installed route");
  }
  if (typeof value.silent !== "boolean") throw new Error("silent must be boolean");
  integer(value.timeout_ms, "timeout_ms", 1000, 25000);
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    throw new Error("live plan requires at least one step");
  }
  const steps = value.steps.map((step, offset) => loadStep(step, offset + 1));
  const payloadBytes = steps.reduce((sum, step) => sum + step.payload.length, 0);
  if (payloadBytes !== value.payload_bytes) {
    throw new Error("live plan payload byte count does not match its steps");
  }
  return {
    version: 1,
    host: route.host,
    port: route.destinationPort,
    sourcePorts: [...route.sourcePorts],
    silent: value.silent,
    timeoutMs: value.timeout_ms,
    payloadBytes,
    lineCount: integer(value.line_count, "line_count", 0, steps.length),
    steps,
  };
}

export function loadPlan(path, runtime) {
  return validatePlan(JSON.parse(fs.readFileSync(path, "utf8")), { runtime });
}
