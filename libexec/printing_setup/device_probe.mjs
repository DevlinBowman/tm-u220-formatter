// Verifies a TM-U220 identity and optional readiness using Epson response-only queries.
// The allowlist excludes initialization, paper motion, drawer, cut, and printable bytes.
import {
  decodeErrorStatus,
  decodeOfflineStatus,
  decodePrinterStatus,
  decodeRealtimePaperStatus,
  ERROR_STATUS_QUERY,
  OFFLINE_STATUS_QUERY,
  PAPER_STATUS_QUERY,
  PRINTER_STATUS_QUERY,
} from "../live_session/status.mjs";
import { classifyTransportProbeError } from "./device_probe_errors.mjs";
import { summarizeReadiness } from "./device_probe_readiness.mjs";

const QUERIES = Object.freeze({
  modelName: Buffer.from([0x1d, 0x49, 0x43]),
  modelId: Buffer.from([0x1d, 0x49, 0x01]),
  printerStatus: Buffer.from(PRINTER_STATUS_QUERY),
  offlineStatus: Buffer.from(OFFLINE_STATUS_QUERY),
  errorStatus: Buffer.from(ERROR_STATUS_QUERY),
  paperStatus: Buffer.from(PAPER_STATUS_QUERY),
});
const ALLOWED_HEX = new Set(Object.values(QUERIES).map((value) => value.toString("hex")));
export const probeProtocol = Object.freeze({
  schemaVersion: 1,
  queryHex: Object.freeze(Object.fromEntries(
    Object.entries(QUERIES).map(([name, value]) => [name, value.toString("hex")])),
  ),
});
class ProbeFailure extends Error {
  constructor(outcome, code, message) {
    super(message);
    this.outcome = outcome;
    this.code = code;
  }
}

function base(endpoint) {
  return {
    schemaVersion: 1,
    checked: true,
    outcome: "unreachable",
    endpoint: { host: endpoint.host, port: endpoint.port },
    identity: { verified: false, modelName: null, modelId: null },
    readiness: { checked: false, ready: null, reasons: [], statuses: null },
    error: null,
  };
}

async function writeQuery(connection, query) {
  if (!Buffer.isBuffer(query) || !ALLOWED_HEX.has(query.toString("hex"))) {
    throw new Error("device probe rejected a non-query byte sequence");
  }
  await connection.write(Buffer.from(query));
}

async function readByte(connection, timeoutMs, label) {
  return connection.read(timeoutMs, label);
}

async function readBefore(connection, deadline, label) {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error(`${label} timed out`);
  return readByte(connection, remaining, label);
}

async function readInformationB(connection, timeoutMs) {
  const bytes = [];
  const deadline = performance.now() + timeoutMs;
  for (let index = 0; index < 82; index += 1) {
    let byte;
    try {
      byte = await readBefore(connection, deadline, "GS I model-name response");
    } catch (error) {
      if (bytes.length === 0) throw error;
      throw new ProbeFailure("malformed_response", "DEVICE_MODEL_NAME_INCOMPLETE",
        "GS I model-name response ended before its terminator");
    }
    bytes.push(byte);
    if (byte === 0x00) break;
  }
  if (bytes.at(-1) !== 0x00) {
    throw new ProbeFailure("malformed_response", "DEVICE_MODEL_NAME_TOO_LONG",
      "GS I model-name response has no terminator within 82 bytes");
  }
  if (bytes.length < 2 || bytes[0] !== 0x5f) {
    throw new ProbeFailure("malformed_response", "DEVICE_MODEL_NAME_MALFORMED",
      "GS I model-name response has invalid Information B framing");
  }
  const payload = bytes.slice(1, -1);
  if (payload.some((byte) => byte < 0x20 || byte > 0x7e)) {
    throw new ProbeFailure("malformed_response", "DEVICE_MODEL_NAME_MALFORMED",
      "GS I model-name response contains non-ASCII bytes");
  }
  if ((connection.pendingBytes?.() || 0) > 0) {
    throw new ProbeFailure("malformed_response", "DEVICE_MODEL_NAME_TRAILING_DATA",
      "GS I model-name response contains trailing bytes");
  }
  return Buffer.from(payload).toString("ascii");
}

async function identify(connection, timeoutMs, result) {
  await writeQuery(connection, QUERIES.modelName);
  const modelName = await readInformationB(connection, timeoutMs);
  result.identity.modelName = modelName;
  if (modelName !== "TM-U220") {
    throw new ProbeFailure("wrong_device", "DEVICE_WRONG_MODEL_NAME",
      `device reports model ${JSON.stringify(modelName)}, not TM-U220`);
  }
  await writeQuery(connection, QUERIES.modelId);
  let modelId;
  try {
    modelId = await readByte(connection, timeoutMs, "GS I model-ID response");
  } catch {
    throw new ProbeFailure("malformed_response", "DEVICE_MODEL_ID_INCOMPLETE",
      "GS I model-ID response did not contain exactly one byte");
  }
  if ((connection.pendingBytes?.() || 0) > 0) {
    throw new ProbeFailure("malformed_response", "DEVICE_MODEL_ID_TRAILING_DATA",
      "GS I model-ID response contains trailing bytes");
  }
  if (!Number.isInteger(modelId) || modelId < 0 || modelId > 0xff) {
    throw new ProbeFailure("malformed_response", "DEVICE_MODEL_ID_MALFORMED",
      "GS I model-ID response is not one byte");
  }
  result.identity.modelId = modelId;
  if (modelId !== 0x0d) {
    throw new ProbeFailure("wrong_device", "DEVICE_WRONG_MODEL_ID",
      `device reports model ID 0x${modelId.toString(16).padStart(2, "0")}, not 0x0d`);
  }
  result.identity.verified = true;
}

async function checkReadiness(connection, timeoutMs) {
  const values = {};
  for (const [name, decoder] of [
    ["printerStatus", decodePrinterStatus], ["offlineStatus", decodeOfflineStatus],
    ["errorStatus", decodeErrorStatus], ["paperStatus", decodeRealtimePaperStatus],
  ]) {
    await writeQuery(connection, QUERIES[name]);
    const byte = await readByte(connection, timeoutMs, `DLE EOT ${name} response`);
    try {
      values[name] = decoder(byte);
    } catch (error) {
      throw new ProbeFailure("malformed_response", "DEVICE_STATUS_MALFORMED", error.message);
    }
    if ((connection.pendingBytes?.() || 0) > 0) {
      throw new ProbeFailure("malformed_response", "DEVICE_STATUS_TRAILING_DATA",
        `DLE EOT ${name} response contains trailing bytes`);
    }
  }
  return summarizeReadiness({
    printer: values.printerStatus, offline: values.offlineStatus,
    error: values.errorStatus, paper: values.paperStatus,
  });
}

export async function probeDevice(endpoint, options = {}, runtime = {}) {
  const result = base(endpoint);
  const responseTimeoutMs = options.responseTimeoutMs ?? 1000;
  if (!Number.isInteger(responseTimeoutMs)
      || responseTimeoutMs < 1 || responseTimeoutMs > 5000) {
    throw new Error("device response timeout must be from 1 through 5000 milliseconds");
  }
  const openConnection = runtime.openConnection;
  if (typeof openConnection !== "function") {
    throw new Error("device checking requires the installed privileged-source connection");
  }
  let connection;
  try {
    connection = await openConnection(endpoint, options, runtime);
    await identify(connection, responseTimeoutMs, result);
    if (options.checkReadiness !== false) {
      try {
        result.readiness = await checkReadiness(connection, responseTimeoutMs);
      } catch (error) {
        const readinessFailure = error instanceof ProbeFailure
          ? { outcome: error.outcome } : classifyTransportProbeError(error);
        if (readinessFailure.outcome !== "unreachable") throw error;
        result.readiness = { checked: true, ready: null,
          reasons: ["status_unavailable"], statuses: null };
        result.error = { code: "DEVICE_READINESS_UNAVAILABLE",
          message: String(error?.message || error || "readiness status is unavailable").slice(0, 240) };
      }
    }
    result.outcome = "verified";
  } catch (error) {
    const failure = error instanceof ProbeFailure
      ? { outcome: error.outcome, code: error.code }
      : classifyTransportProbeError(error);
    result.outcome = failure.outcome;
    result.error = {
      code: failure.code,
      message: String(error?.message || error || "device did not respond").slice(0, 240),
    };
  } finally {
    try { await connection?.close?.(); } catch {}
  }
  return result;
}
