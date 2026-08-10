// Exercises the fixed safe-image helper with real PNG/JPEG and raw PBM inputs.
// Exact protocols keep decoder output deterministic without exposing filesystem paths.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("../../libexec/image_assets/materialize.mjs", import.meta.url));
const chicken = fileURLToPath(new URL("../assets/Chicken.png", import.meta.url));
const jpeg = fileURLToPath(new URL("../assets/jpeg/color-grid-7x5.jpg", import.meta.url));

function materialize(base, reference, maximum = 1024 * 1024, kind) {
  const args = [helper, base, reference, String(maximum)];
  if (kind) args.push(kind);
  return spawnSync(process.execPath, args);
}

test("emits deterministic grayscale for Chicken.png", () => {
  const result = materialize(chicken, "Chicken.png");
  assert.equal(result.status, 0);
  const marker = Buffer.from(`U220GRAY2\npng 160 112 ${fs.statSync(chicken).size}\n`);
  assert.deepEqual(result.stdout.subarray(0, marker.length), marker);
  const data = result.stdout.subarray(marker.length);
  assert.equal(data.length, 17920);
  assert.equal(crypto.createHash("sha256").update(data).digest("hex"),
    "8e35d4cb7501a259fd34d525aa95f529339233b51b147f79703e15fcbeec78a7");
});

test("emits deterministic grayscale for a baseline JPEG", () => {
  const result = materialize(jpeg, "color-grid-7x5.jpg");
  assert.equal(result.status, 0);
  const marker = Buffer.from(`U220GRAY2\njpeg 7 5 ${fs.statSync(jpeg).size}\n`);
  assert.deepEqual(result.stdout.subarray(0, marker.length), marker);
  const data = result.stdout.subarray(marker.length);
  assert.equal(data.length, 35);
  assert.equal(crypto.createHash("sha256").update(data).digest("hex"),
    "090b9ee5e7a56ff54965a72b0d66157630d1fd30db41e5199b3f81d65fac2ad5");
});

test("preserves non-PNG bytes for the strict PBM decoder", () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "u220-image-"));
  const document = path.join(root, "receipt.u220");
  const pbm = Buffer.from([0x50, 0x34, 0x0a, 0x31, 0x20, 0x31, 0x0a, 0x80]);
  try {
    fs.writeFileSync(document, "!tm-u220 job 1\n");
    fs.writeFileSync(path.join(root, "pixel.pbm"), pbm);
    const result = materialize(document, "pixel.pbm");
    assert.deepEqual(result.stdout, Buffer.concat([Buffer.from("U220ASSET1\n"), pbm]));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("collapses malformed PNG details without leaking its path", () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "u220-png-"));
  const document = path.join(root, "receipt.u220");
  try {
    fs.writeFileSync(document, "!tm-u220 job 1\n");
    fs.writeFileSync(path.join(root, "bad.png"),
      Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("bad")]));
    const result = materialize(document, "bad.png");
    assert.equal(result.stdout.toString(), "U220ERROR1\nPNG_INVALID\n");
    assert.equal(result.stdout.includes(Buffer.from(root)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("collapses malformed JPEG details without leaking its path", () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "u220-jpeg-"));
  const document = path.join(root, "receipt.u220");
  try {
    fs.writeFileSync(document, "!tm-u220 job 1\n");
    fs.writeFileSync(path.join(root, "bad.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const result = materialize(document, "bad.jpg");
    assert.equal(result.stdout.toString(), "U220ERROR1\nJPEG_INVALID\n");
    assert.equal(result.stdout.includes(Buffer.from(root)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("directory-root mode retains containment for inline CLI images", () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "u220-root-"));
  try {
    fs.mkdirSync(path.join(root, "art"));
    fs.writeFileSync(path.join(root, "art/pixel.pbm"), "P4\n1 1\n\x80", "binary");
    const success = materialize(root, "art/pixel.pbm", 1024, "root");
    assert.deepEqual(success.stdout,
      Buffer.concat([Buffer.from("U220ASSET1\n"), Buffer.from("P4\n1 1\n\x80", "binary")]));
    const traversal = materialize(root, "../outside.pbm", 1024, "root");
    assert.equal(traversal.stdout.toString(), "U220ERROR1\nREFERENCE_INVALID\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
