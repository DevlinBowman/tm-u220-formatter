// Proves the public launcher treats PNG and JPEG as complete image jobs without transport.
// Human preview and compiled-byte checks exercise the same boundary used immediately before print.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const launcher = fileURLToPath(new URL("../../bin/tm-u220", import.meta.url));
const chicken = fileURLToPath(new URL("../assets/Chicken.png", import.meta.url));
const jpeg = fileURLToPath(new URL("../assets/jpeg/color-grid-7x5.jpg", import.meta.url));

function succeed(args) {
  const result = spawnSync(launcher, args, {
    cwd: projectRoot, encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return result.stdout;
}

test("render and compile accept Chicken.png as a direct image", () => {
  assert.match(succeed(["render", chicken]),
    /\[image Chicken\.png, 200x126 dots, solid\]/);

  const tokens = succeed(["compile", chicken, "--hex"]).trim().split(" ");
  assert.equal(tokens.length, 3339);
  assert.deepEqual(tokens.slice(0, 5), ["1B", "40", "1B", "55", "01"]);
  assert.deepEqual(tokens.slice(-6), ["1B", "4A", "04", "1B", "55", "00"]);
  const bytes = Buffer.from(tokens.map((token) => Number.parseInt(token, 16)));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),
    "ea73967dc7d4a89a8f0f12cb5416aacdb8ee588acaef97ed742c72dfea06cb96");
});

test("render and compile accept JPEG as a direct image", () => {
  assert.match(succeed(["render", jpeg]),
    /\[image color-grid-7x5\.jpg, 200x129 dots, solid\]/);

  const tokens = succeed(["compile", jpeg, "--hex"]).trim().split(" ");
  assert.equal(tokens.length, 3547);
  const bytes = Buffer.from(tokens.map((token) => Number.parseInt(token, 16)));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),
    "7efec6eb13019732bfdc59a88b70ab85c8845b80250b4773ecb4d795f43f0d79");
});

test("an inline image directive resolves from the invocation directory", () => {
  const output = succeed(["render", '@image "test/assets/Chicken.png" 20 10']);
  assert.match(output,
    /\[image test\/assets\/Chicken\.png, 100x90 dots, solid\]/);
});

test("standard input does not inherit the invocation directory as an asset base", () => {
  const result = spawnSync(launcher, ["render"], {
    cwd: projectRoot, encoding: "utf8", timeout: 10000,
    input: '@image "test/assets/Chicken.png" 20 10\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /IMAGE_ASSET_BASE_REQUIRED/);
});
