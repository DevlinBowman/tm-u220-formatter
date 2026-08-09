import test from "node:test";
import assert from "node:assert/strict";
import { runSession } from "../../libexec/live_session/session.mjs";
import {
  ASB_DISABLE_COMMAND,
  ERROR_STATUS_QUERY,
  LINE_CHECKPOINT_QUERY,
  OFFLINE_STATUS_QUERY,
  PAPER_STATUS_QUERY,
  PRINTER_STATUS_QUERY,
} from "../../libexec/live_session/status.mjs";

class FakeConnection {
  constructor(responses, pending = () => 0) {
    this.responses = [...responses];
    this.writes = [];
    this.pending = pending;
  }
  write(value) { this.writes.push(Buffer.from(value)); return Promise.resolve(); }
  read() {
    if (this.responses.length === 0) return Promise.reject(new Error("EOF"));
    const value = this.responses.shift();
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  }
  pendingBytes() { return this.pending(); }
}

function plan() {
  return {
    timeoutMs: 100,
    lineCount: 2,
    steps: [
      { index: 1, kind: "line",
        payload: Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from("A\n")]),
        resetAfterByteOffsets: [2],
        display: "001 | A", previewLineIndex: 1 },
      { index: 2, kind: "line", payload: Buffer.from("B\n"),
        resetAfterByteOffsets: [],
        display: "002 | B", previewLineIndex: 2 },
    ],
  };
}

const PREFLIGHT = [0x16, 0x12, 0x12, 0x12];

test("session preflights then releases exactly one checkpoint at a time", async () => {
  const connection = new FakeConnection([...PREFLIGHT, 0x00, 0x00]);
  const events = [];
  const result = await runSession(plan(), connection, { requested: false },
    (event) => events.push(event));
  assert.equal(result.status, "completed");
  assert.equal(result.confirmedLines, 2);
  assert.deepEqual(connection.writes.slice(0, 5), [
    ASB_DISABLE_COMMAND,
    PRINTER_STATUS_QUERY, OFFLINE_STATUS_QUERY, ERROR_STATUS_QUERY, PAPER_STATUS_QUERY,
  ]);
  assert.deepEqual(connection.writes[5], Buffer.concat([
    Buffer.from([0x1b, 0x40]), ASB_DISABLE_COMMAND,
    Buffer.from("A\n"), LINE_CHECKPOINT_QUERY,
  ]));
  assert.deepEqual(connection.writes[6], Buffer.concat([
    Buffer.from("B\n"), LINE_CHECKPOINT_QUERY,
  ]));
  assert.equal(result.confirmedBytes, 6);
  assert.equal(result.releasedBytes, 6);
  assert.deepEqual(events.filter((event) => event.type === "confirmed")
    .map((event) => event.step.display), ["001 | A", "002 | B"]);
});

test("boundary cancellation leaves every later line unsent", async () => {
  const connection = new FakeConnection([...PREFLIGHT, 0x00, 0x00]);
  const cancellation = { requested: false };
  const result = await runSession(plan(), connection, cancellation, (event) => {
    if (event.type === "confirmed") cancellation.requested = true;
  });
  assert.equal(result.status, "cancelled");
  assert.equal(result.confirmedLines, 1);
  assert.equal(connection.writes.length, 6);
  assert.equal(connection.writes.some((value) => value.includes(Buffer.from("B\n"))), false);
});

test("in-flight cancellation confirms the current line and withholds the next", async () => {
  const connection = new FakeConnection([...PREFLIGHT, 0x00, 0x00]);
  const cancellation = { requested: false };
  const result = await runSession(plan(), connection, cancellation, (event) => {
    if (event.type === "in_flight" && event.step.index === 1) {
      cancellation.requested = true;
    }
  });
  assert.equal(result.status, "cancelled");
  assert.equal(result.confirmedLines, 1);
  assert.equal(connection.writes.length, 6);
});

test("completion wins when cancellation arrives during the final operation", async () => {
  const connection = new FakeConnection([...PREFLIGHT, 0x00, 0x00]);
  const cancellation = { requested: false };
  const result = await runSession(plan(), connection, cancellation, (event) => {
    if (event.type === "confirmed" && event.step.index === 2) {
      cancellation.requested = true;
    }
  });
  assert.equal(result.status, "completed");
  assert.equal(result.confirmedLines, 2);
  assert.equal(connection.writes.length, 7);
});

test("ambiguous checkpoint failure never releases the next line", async () => {
  const connection = new FakeConnection([...PREFLIGHT, new Error("reply EOF")]);
  await assert.rejects(
    runSession(plan(), connection, { requested: false }),
    (error) => {
      assert.equal(error.code, "LIVE_CHECKPOINT_FAILED");
      assert.equal(error.step, 1);
      assert.equal(error.outcomeUnknown, true);
      return true;
    },
  );
  assert.equal(connection.writes.length, 6);
  assert.equal(connection.writes.some((value) => value.includes(Buffer.from("B\n"))), false);
});

test("unsolicited status before a checkpoint fails closed without job bytes", async () => {
  let checks = 0;
  const connection = new FakeConnection([...PREFLIGHT, 0x00], () => {
    checks += 1;
    return checks === 5 ? 1 : 0;
  });
  await assert.rejects(
    runSession(plan(), connection, { requested: false }),
    (error) => error.code === "LIVE_UNEXPECTED_STATUS" && error.outcomeUnknown === false,
  );
  assert.equal(connection.writes.length, 5);
});

test("a complete ASB frame is consumed before the requested response", async () => {
  const asb = [0x10, 0x00, 0x00, 0x00];
  const connection = new FakeConnection([...asb, ...PREFLIGHT, 0x00, 0x00]);
  const result = await runSession(plan(), connection, { requested: false });
  assert.equal(result.status, "completed");
  assert.equal(result.confirmedLines, 2);
});

test("bytes inside an ASB frame cannot acknowledge a checkpoint", async () => {
  const asbWithValidCheckpointBytes = [0x10, 0x00, 0x03, 0x0c];
  const connection = new FakeConnection([
    ...PREFLIGHT, ...asbWithValidCheckpointBytes, new Error("reply EOF"),
  ]);
  await assert.rejects(
    runSession(plan(), connection, { requested: false }),
    (error) => error.code === "LIVE_CHECKPOINT_FAILED" && error.outcomeUnknown === true,
  );
  assert.equal(connection.writes.length, 6);
  assert.equal(connection.writes.some((value) => value.includes(Buffer.from("B\n"))), false);
});
