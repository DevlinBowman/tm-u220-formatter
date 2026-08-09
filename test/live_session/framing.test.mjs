import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { ByteReader } from "../../libexec/live_session/byte_reader.mjs";
import {
  checkpointRequest,
  readFramedStatus,
} from "../../libexec/live_session/framing.mjs";
import {
  ASB_DISABLE_COMMAND,
  LINE_CHECKPOINT_QUERY,
} from "../../libexec/live_session/status.mjs";

test("checkpoint framing follows reset metadata instead of scanning payload bytes", () => {
  const payload = Buffer.from([0x1b, 0x40, 0x41, 0x1b, 0x40, 0x0a]);
  const request = checkpointRequest({
    payload,
    resetAfterByteOffsets: [2],
  });
  assert.deepEqual(request, Buffer.concat([
    payload.subarray(0, 2),
    ASB_DISABLE_COMMAND,
    payload.subarray(2),
    LINE_CHECKPOINT_QUERY,
  ]));
  assert.equal(request.length, payload.length
    + ASB_DISABLE_COMMAND.length + LINE_CHECKPOINT_QUERY.length);
});

test("split ASB frames consume all inner checkpoint-shaped bytes", async () => {
  const stream = new PassThrough();
  const reader = new ByteReader(stream);
  const connection = {
    read: (timeoutMs, label) => reader.read(timeoutMs, label),
    pendingBytes: () => reader.pendingBytes(),
  };
  const response = readFramedStatus(connection, 100, "checkpoint");
  stream.write(Buffer.from([0x10, 0x00]));
  stream.write(Buffer.from([0x03]));
  stream.write(Buffer.from([0x0c, 0x00]));
  assert.equal(await response, 0x00);
  assert.equal(reader.pendingBytes(), 0);
  stream.end();
});
