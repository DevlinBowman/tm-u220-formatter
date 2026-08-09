import test from "node:test";
import assert from "node:assert/strict";
import {
  ASB_DISABLE_COMMAND,
  decodeCheckpointStatus,
  decodeErrorStatus,
  decodeOfflineStatus,
  decodePrinterStatus,
  decodeRealtimePaperStatus,
  isBasicAsbHeader,
} from "../../libexec/live_session/status.mjs";

test("ASB disable and frame header use Epson's fixed bits", () => {
  assert.deepEqual([...ASB_DISABLE_COMMAND], [0x1d, 0x61, 0x00]);
  assert.equal(isBasicAsbHeader(0x10), true);
  assert.equal(isBasicAsbHeader(0x3c), true);
  assert.equal(isBasicAsbHeader(0x16), false);
  assert.equal(isBasicAsbHeader(0x00), false);
});

test("verified idle responses decode as online and paper ready", () => {
  assert.deepEqual(decodePrinterStatus(0x16), {
    byte: 0x16, online: true, waitingForRecovery: false, feedButtonActive: false,
  });
  assert.equal(decodeOfflineStatus(0x12).coverOpen, false);
  assert.equal(decodeErrorStatus(0x12).unrecoverable, false);
  assert.deepEqual(decodeRealtimePaperStatus(0x12), {
    byte: 0x12, nearEnd: false, paperEnd: false,
  });
  assert.deepEqual(decodeCheckpointStatus(0x00), {
    byte: 0x00, nearEnd: false, paperEnd: false,
  });
});

test("paper checkpoint states are strict", () => {
  assert.equal(decodeCheckpointStatus(0x03).nearEnd, true);
  assert.equal(decodeCheckpointStatus(0x0c).paperEnd, true);
  assert.deepEqual(decodeCheckpointStatus(0x0f), {
    byte: 0x0f, nearEnd: true, paperEnd: true,
  });
  assert.throws(() => decodeCheckpointStatus(0x01), /invalid/);
  assert.throws(() => decodeCheckpointStatus(0x10), /invalid/);
  assert.throws(() => decodeCheckpointStatus(0x20), /invalid/);
  assert.throws(() => decodePrinterStatus(0x00), /fixed bits/);
});
