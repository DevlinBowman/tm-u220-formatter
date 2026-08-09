import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { ByteReader } from "../../libexec/live_session/byte_reader.mjs";

test("byte reader preserves split and coalesced status bytes", async () => {
  const stream = new PassThrough();
  const reader = new ByteReader(stream);
  const first = reader.read(100, "first");
  stream.write(Buffer.from([0x16, 0x12]));
  assert.equal(await first, 0x16);
  assert.equal(await reader.read(100, "second"), 0x12);
  assert.equal(reader.pendingBytes(), 0);
  stream.end();
});

test("byte reader times out and rejects EOF", async () => {
  const waiting = new PassThrough();
  const reader = new ByteReader(waiting);
  await assert.rejects(reader.read(5, "checkpoint"), /checkpoint timed out/);
  waiting.end();

  const ended = new PassThrough();
  const endedReader = new ByteReader(ended);
  ended.end();
  await assert.rejects(endedReader.read(50), /ended/);
});
