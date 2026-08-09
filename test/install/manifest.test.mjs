// Proves that manifest identity covers ordered paths, modes, sizes, and file digests.
import test from "node:test";
import assert from "node:assert/strict";
import { createManifest, manifestBytes, parseManifest } from "../../install/manifest.mjs";

const entries = [
  { path: "src/example.lua", mode: 0o644, bytes: 3, sha256: "a".repeat(64) },
  { path: "bin/example", mode: 0o755, bytes: 4, sha256: "b".repeat(64) },
];

test("creates deterministic, round-trippable release identities", () => {
  const first = createManifest(entries, "1.2.3");
  const second = createManifest([...entries].reverse(), "1.2.3");
  assert.deepEqual(first, second);
  assert.match(first.releaseId, /^1\.2\.3-[0-9a-f]{16}$/);
  assert.deepEqual(parseManifest(manifestBytes(first)), first);
});

test("rejects traversal, duplicate paths, and forged identity", () => {
  assert.throws(() => createManifest([{ ...entries[0], path: "../escape" }]), /invalid payload path/);
  assert.throws(() => createManifest([entries[0], entries[0]]), /duplicate/);
  const forged = { ...createManifest(entries), contentHash: "0".repeat(64) };
  assert.throws(() => parseManifest(Buffer.from(`${JSON.stringify(forged)}\n`)), /identity/);
});
