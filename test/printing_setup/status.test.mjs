// Verifies status output, exit semantics, and the explicit boundary around device contact.
import test from "node:test";
import assert from "node:assert/strict";
import { runStatus } from "../../libexec/printing_setup/status_cli.mjs";

function report(overrides = {}) {
  const file = (path) => ({ path, exists: true, metadataValid: true, sha256: "a".repeat(64) });
  return {
    kind: "tm-u220-printing-status", schemaVersion: 1, localOnly: true, healthy: true,
    environment: { platform: { actual: "darwin", supported: true } },
    configuration: { endpoint: { host: "192.168.1.220", port: 9100 } },
    artifacts: { manifest: file("manifest"), profile: file("profile"),
      sudoers: file("sudoers"), legacyTombstone: file("legacy") },
    packageReceipt: { found: true, version: "1.2.3" },
    authorization: { expected: ["one"], active: ["one"], missing: [], extra: [], broad: [] },
    device: null, issues: [], ...overrides,
  };
}

function output() {
  let stdout = "";
  let stderr = "";
  return {
    io: { stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } } },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

test("default status is local-only and never invokes the probe", async () => {
  const capture = output();
  let probes = 0;
  const code = await runStatus([], {
    audit: () => report(),
    probe: () => { probes += 1; throw new Error("must not contact device"); },
  }, capture.io);
  assert.equal(code, 0);
  assert.equal(probes, 0);
  assert.match(capture.stdout(), /Printer contacted: no/);
  assert.match(capture.stdout(), /Device check: not requested/);
});

test("human status labels old offline evidence as legacy", async () => {
  const capture = output();
  const value = report({ configuration: {
    endpoint: { host: "192.168.1.220", port: 9100 },
    probeEvidence: { mode: "offline", recordedAt: "2026-08-08T12:34:56.000Z",
      error: "connection_refused", acceptance: "allow_offline" },
  } });
  const code = await runStatus([], { audit: () => value, probe: () => {} }, capture.io);
  assert.equal(code, 0);
  assert.match(capture.stdout(),
    /legacy offline evidence at 2026-08-08T12:34:56\.000Z \(connection_refused\)/);
});

test("human status exposes unsafe parents and quotes unmanaged entry names", async () => {
  const capture = output();
  const unexpected = "unmanaged\u001b.conf";
  const value = report({ healthy: false, pathSafety: { safe: false,
    directories: [{ path: "/private", checked: true, exists: true, type: "directory",
      uid: 0, gid: 0, mode: "0755", safe: true },
    { path: "/private/etc", checked: true, exists: true, type: "symlink",
      uid: 0, gid: 0, mode: "0777", safe: false }],
    managedEntries: { checked: true, actual: [unexpected], missing: ["printer.u220p"],
      unknown: [unexpected], exact: false },
  }, issues: [{ code: "CANONICAL_PARENT_UNSAFE", severity: "error", message: "unsafe" }] });
  const code = await runStatus([], { audit: () => value, probe: () => {} }, capture.io);
  assert.equal(code, 1);
  assert.match(capture.stdout(), /Canonical path safety: attention needed/);
  assert.match(capture.stdout(), /"unmanaged\\u001b\.conf"/);
  assert.equal(capture.stdout().includes("\u001b"), false);
});

test("--check-device contacts only the manifest endpoint and affects JSON health", async () => {
  const capture = output();
  let endpoint;
  const code = await runStatus(["--check-device", "--json"], {
    audit: () => report(),
    probe: (value) => {
      endpoint = value;
      return { schemaVersion: 1, checked: true, outcome: "verified", endpoint: value,
        identity: { verified: true, modelName: "TM-U220", modelId: 13 },
        readiness: { checked: true, ready: false, reasons: ["cover_open"], statuses: {} },
        error: null };
    },
  }, capture.io);
  assert.equal(code, 1);
  assert.deepEqual(endpoint, { host: "192.168.1.220", port: 9100 });
  const value = JSON.parse(capture.stdout());
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.localOnly, false);
  assert.equal(value.healthy, false);
  assert.equal(value.device.readiness.ready, false);
  assert.ok(value.issues.some((issue) => issue.code === "DEVICE_NOT_READY"));
});

test("verified identity with unavailable readiness remains distinct in status", async () => {
  const capture = output();
  const code = await runStatus(["--check-device"], {
    audit: () => report(),
    probe: (endpoint) => ({ schemaVersion: 1, checked: true, outcome: "verified", endpoint,
      identity: { verified: true, modelName: "TM-U220", modelId: 13 },
      readiness: { checked: true, ready: null,
        reasons: ["status_unavailable"], statuses: null },
      error: { code: "DEVICE_READINESS_UNAVAILABLE", message: "status response timed out" } }),
  }, capture.io);
  assert.equal(code, 1);
  assert.match(capture.stdout(), /Device check: verified/);
  assert.match(capture.stdout(), /identity: TM-U220 \(model ID 13\)/);
  assert.match(capture.stdout(), /readiness: unavailable \(status response timed out\)/);
  assert.match(capture.stdout(), /DEVICE_READINESS_UNAVAILABLE/);
});

test("device check cannot invent an endpoint when the manifest is invalid", async () => {
  const capture = output();
  let probes = 0;
  const code = await runStatus(["--check-device", "--json"], {
    audit: () => report({ healthy: false, configuration: null,
      issues: [{ code: "MANIFEST_SCHEMA_INVALID", severity: "error", message: "invalid" }] }),
    probe: () => { probes += 1; },
  }, capture.io);
  assert.equal(code, 1);
  assert.equal(probes, 0);
  assert.equal(JSON.parse(capture.stdout()).device.outcome, "unavailable");
});

test("unknown options fail before any audit or device action", async () => {
  const capture = output();
  let audits = 0;
  const code = await runStatus(["--host", "example"], {
    audit: () => { audits += 1; }, probe: () => {},
  }, capture.io);
  assert.equal(code, 64);
  assert.equal(audits, 0);
  assert.match(capture.stderr(), /unknown option: --host/);
});
