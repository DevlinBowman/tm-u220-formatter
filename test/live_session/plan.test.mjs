import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan } from "../../libexec/live_session/plan.mjs";

const policy = Object.freeze({ routes: [Object.freeze({
  name: "live", host: "192.168.50.41", destinationPort: 9100,
  sourcePorts: Object.freeze([1023, 1021, 1020, 1019, 1018, 1017, 1016, 1015]),
})] });
const route = policy.routes[0];

function manifest(overrides = {}) {
  return {
    version: 1,
    host: route.host,
    port: route.destinationPort,
    source_ports: [...route.sourcePorts],
    silent: false,
    timeout_ms: 10000,
    payload_bytes: 4,
    line_count: 1,
    steps: [{
      index: 1, kind: "line", payload_hex: "1b40410a",
      reset_after_byte_offsets: [2],
      display: "001 | A", preview_line_index: 1,
    }],
    ...overrides,
  };
}

test("manifest preserves binary payload and canonical display", () => {
  const plan = validatePlan(manifest(), { policy });
  assert.deepEqual([...plan.steps[0].payload], [0x1b, 0x40, 0x41, 0x0a]);
  assert.deepEqual(plan.steps[0].resetAfterByteOffsets, [2]);
  assert.equal(plan.steps[0].display, "001 | A");
  assert.equal(plan.payloadBytes, 4);
});

test("manifest rejects endpoint, policy, and byte-count changes", () => {
  const validate = (value) => validatePlan(value, { policy });
  assert.throws(() => validate(manifest({ host: "example.com" })), /differs/);
  assert.throws(() => validate(manifest({ source_ports: [1023] })), /policy/);
  assert.throws(() => validate(manifest({ payload_bytes: 5 })), /byte count/);
  const value = manifest();
  value.steps[0].payload_hex = "not hex";
  assert.throws(() => validate(value), /payload hex/);
  value.steps[0].payload_hex = "1b40410a";
  value.steps[0].reset_after_byte_offsets = [2, 2];
  assert.throws(() => validate(value), /strictly increasing/);
  value.steps[0].reset_after_byte_offsets = [5];
  assert.throws(() => validate(value), /reset offset/);
  assert.throws(() => validate(manifest({ timeout_ms: 25001 })), /25000/);
});
