// Proves that device verification sends only bounded Epson queries and classifies outcomes.
import test from "node:test";
import assert from "node:assert/strict";
import {
  probeDevice,
  probeProtocol,
} from "../../libexec/printing_setup/device_probe.mjs";

const NAME = Buffer.from([0x5f, ...Buffer.from("TM-U220"), 0x00]);
const READY = [Buffer.from([0x16]), Buffer.from([0x12]),
  Buffer.from([0x12]), Buffer.from([0x12])];

function connection(responses) {
  const writes = [];
  let active = [];
  let closed = false;
  return {
    writes,
    get closed() { return closed; },
    async write(bytes) {
      writes.push(Buffer.from(bytes));
      active = [...(responses.shift() || [])];
    },
    async read() {
      if (active.length === 0) throw new Error("response timed out");
      return active.shift();
    },
    pendingBytes() { return active.length; },
    close() { closed = true; },
  };
}

async function run(responses, options = {}) {
  const fake = connection(responses.map((value) => [...value]));
  const result = await probeDevice({ host: "printer.local", port: 9100 }, options, {
    openConnection: async () => fake,
  });
  return { fake, result };
}

test("verified ready probe emits only the six response-only query sequences", async () => {
  const { fake, result } = await run([NAME, Buffer.from([0x0d]), ...READY]);
  assert.equal(result.outcome, "verified");
  assert.deepEqual(result.identity, { verified: true, modelName: "TM-U220", modelId: 13 });
  assert.equal(result.readiness.ready, true);
  assert.equal(fake.closed, true);
  assert.deepEqual(fake.writes.map((bytes) => bytes.toString("hex")), [
    probeProtocol.queryHex.modelName,
    probeProtocol.queryHex.modelId,
    probeProtocol.queryHex.printerStatus,
    probeProtocol.queryHex.offlineStatus,
    probeProtocol.queryHex.errorStatus,
    probeProtocol.queryHex.paperStatus,
  ]);
  assert.equal(fake.writes.some((bytes) => bytes.includes(0x0a) || bytes.includes(0x0d)), false,
    "no line/feed/job bytes are sent");
});

test("verified identity remains distinct from readiness", async () => {
  const notReady = [Buffer.from([0x1e]), Buffer.from([0x76]),
    Buffer.from([0x3e]), Buffer.from([0x72])];
  const { result } = await run([NAME, Buffer.from([0x0d]), ...notReady]);
  assert.equal(result.outcome, "verified");
  assert.equal(result.identity.verified, true);
  assert.equal(result.readiness.ready, false);
  assert.deepEqual(result.readiness.reasons,
    ["offline", "cover_open", "paper_out", "printer_error"]);
});

test("verified identity survives an unavailable readiness response", async () => {
  const { fake, result } = await run([NAME, Buffer.from([0x0d])]);
  assert.equal(result.outcome, "verified");
  assert.equal(result.identity.verified, true);
  assert.deepEqual(result.readiness, { checked: true, ready: null,
    reasons: ["status_unavailable"], statuses: null });
  assert.equal(result.error.code, "DEVICE_READINESS_UNAVAILABLE");
  assert.equal(fake.writes.length, 3);
});

test("identity-only mode sends no status, setup, or printable bytes", async () => {
  const { fake, result } = await run([NAME, Buffer.from([0x0d])], {
    checkReadiness: false,
  });
  assert.equal(result.outcome, "verified");
  assert.deepEqual(result.readiness,
    { checked: false, ready: null, reasons: [], statuses: null });
  assert.deepEqual(fake.writes.map((bytes) => bytes.toString("hex")),
    ["1d4943", "1d4901"]);
});

test("well-framed wrong devices and malformed replies are not verification", async () => {
  const wrongName = Buffer.from([0x5f, ...Buffer.from("TM-T88"), 0x00]);
  const wrong = await run([wrongName]);
  assert.equal(wrong.result.outcome, "wrong_device");
  assert.equal(wrong.result.error.code, "DEVICE_WRONG_MODEL_NAME");
  assert.equal(wrong.fake.writes.length, 1);

  const malformed = await run([Buffer.from([0x58, 0x00])]);
  assert.equal(malformed.result.outcome, "malformed_response");
  assert.equal(malformed.result.error.code, "DEVICE_MODEL_NAME_MALFORMED");

  const invalidStatus = await run([
    NAME, Buffer.from([0x0d]), Buffer.from([0x00]),
  ]);
  assert.equal(invalidStatus.result.outcome, "malformed_response");
  assert.equal(invalidStatus.result.identity.verified, true);
  assert.equal(invalidStatus.result.error.code, "DEVICE_STATUS_MALFORMED");

  const trailingStatus = await run([
    NAME, Buffer.from([0x0d]), Buffer.from([0x16, 0x16]),
  ]);
  assert.equal(trailingStatus.result.outcome, "malformed_response");
  assert.equal(trailingStatus.result.error.code, "DEVICE_STATUS_TRAILING_DATA");
});

test("authorized connection failures remain explicit device-check results", async () => {
  const error = Object.assign(new Error("connect refused"), { code: "ECONNREFUSED" });
  const result = await probeDevice({ host: "printer.local", port: 9100 }, {}, {
    openConnection: async () => { throw error; },
  });
  assert.equal(result.outcome, "unreachable");
  assert.equal(result.error.code, "DEVICE_CONNECTION_REFUSED");
});

test("unknown adapter failures remain explicit probe errors", async () => {
  const result = await probeDevice({ host: "printer.local", port: 9100 }, {}, {
    openConnection: async () => { throw new Error("unexpected adapter failure"); },
  });
  assert.equal(result.outcome, "probe_error");
  assert.equal(result.error.code, "DEVICE_PROBE_ERROR");
});

test("an oversized device response is malformed", async () => {
  const error = Object.assign(new Error("response limit"), { code: "EMSGSIZE" });
  const result = await probeDevice({ host: "printer.local", port: 9100 }, {}, {
    openConnection: async () => ({
      write: async () => {}, read: async () => { throw error; }, close: () => {},
    }),
  });
  assert.equal(result.outcome, "malformed_response");
  assert.equal(result.error.code, "DEVICE_RESPONSE_TOO_LARGE");
});
