// Exercises the fixed companion-image reader against traversal, links, and exact binary bytes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("../../libexec/image_assets/read.mjs", import.meta.url));

function fixture() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "u220-assets-"));
  const document = path.join(root, "receipt.u220");
  fs.writeFileSync(document, "!tm-u220 job 1\n");
  fs.mkdirSync(path.join(root, "art"));
  fs.writeFileSync(path.join(root, "art/pixel.pbm"), Buffer.from([0x50, 0x34, 0x0a, 0x00]));
  return { root, document };
}

function read(document, reference, maximum = 1024) {
  return spawnSync(process.execPath, [helper, document, reference, String(maximum)]);
}

test("returns exact bytes behind the success marker", () => {
  const item = fixture();
  try {
    const result = read(item.document, "art/pixel.pbm");
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout,
      Buffer.concat([Buffer.from("U220ASSET1\n"), Buffer.from([0x50, 0x34, 0x0a, 0x00])]));
  } finally { fs.rmSync(item.root, { recursive: true, force: true }); }
});

test("rejects traversal, symlinks, and oversized files without leaking paths", () => {
  const item = fixture();
  try {
    const outside = path.join(path.dirname(item.root), `${path.basename(item.root)}-outside.pbm`);
    fs.writeFileSync(outside, "P4\n1 1\n\0");
    fs.symlinkSync(outside, path.join(item.root, "art/link.pbm"));
    for (const [reference, maximum, code] of [
      ["../outside.pbm", 1024, "REFERENCE_INVALID"],
      ["art/link.pbm", 1024, "LINK_REJECTED"],
      ["art/pixel.pbm", 2, "SIZE_INVALID"],
    ]) {
      const result = read(item.document, reference, maximum);
      assert.equal(result.status, 0);
      assert.equal(result.stdout.toString(), `U220ERROR1\n${code}\n`);
      assert.equal(result.stdout.includes(Buffer.from(item.root)), false);
    }
    fs.rmSync(outside, { force: true });
  } finally { fs.rmSync(item.root, { recursive: true, force: true }); }
});
