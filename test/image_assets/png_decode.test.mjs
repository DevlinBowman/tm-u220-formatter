// Proves every supported 8-bit PNG color model and row filter produces stable,
// white-composited grayscale, including the real Chicken.png acceptance fixture.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { decodePng } from "../../libexec/image_assets/png/decode.mjs";
import { buildPng } from "./png_fixture.mjs";

const chicken = fileURLToPath(new URL("../assets/Chicken.png", import.meta.url));

function decodedData(options) {
  return [...decodePng(buildPng(options)).data];
}

test("decodes Chicken.png to deterministic grayscale", () => {
  const decoded = decodePng(fs.readFileSync(chicken));
  assert.deepEqual([decoded.width, decoded.height, decoded.data.length], [160, 112, 17920]);
  assert.equal(
    crypto.createHash("sha256").update(decoded.data).digest("hex"),
    "8e35d4cb7501a259fd34d525aa95f529339233b51b147f79703e15fcbeec78a7",
  );
});

test("supports grayscale and truecolor transparency keys", () => {
  assert.deepEqual(decodedData({
    width: 2,
    height: 1,
    colorType: 0,
    rows: [Buffer.from([0, 200])],
    transparency: Buffer.from([0, 0]),
  }), [255, 200]);
  assert.deepEqual(decodedData({
    width: 2,
    height: 1,
    colorType: 2,
    rows: [Buffer.from([255, 0, 0, 1, 2, 3])],
    transparency: Buffer.from([0, 255, 0, 0, 0, 0]),
  }), [255, 2]);
});

test("supports indexed, grayscale-alpha, and RGBA pixels", () => {
  assert.deepEqual(decodedData({
    width: 3,
    height: 1,
    colorType: 3,
    rows: [Buffer.from([0, 1, 2])],
    palette: Buffer.from([0, 0, 0, 255, 0, 0, 255, 255, 255]),
    transparency: Buffer.from([255, 128]),
  }), [0, 165, 255]);
  assert.deepEqual(decodedData({
    width: 2,
    height: 1,
    colorType: 4,
    rows: [Buffer.from([10, 0, 20, 255])],
  }), [255, 20]);
  assert.deepEqual(decodedData({
    width: 2,
    height: 1,
    colorType: 6,
    rows: [Buffer.from([0, 0, 0, 128, 255, 255, 255, 255])],
  }), [127, 255]);
});

test("reverses filters zero through four across adjacent rows", () => {
  const rows = [
    Buffer.from([1, 2, 3, 4]),
    Buffer.from([10, 20, 30, 40]),
    Buffer.from([50, 60, 70, 80]),
    Buffer.from([90, 100, 110, 120]),
    Buffer.from([130, 140, 150, 160]),
  ];
  assert.deepEqual(decodedData({
    width: 4, height: 5, colorType: 0, rows, filters: [0, 1, 2, 3, 4],
  }), [...Buffer.concat(rows)]);
});

test("accepts consecutive IDAT chunks as one zlib stream", () => {
  const decoded = decodePng(buildPng({
    width: 1, height: 1, colorType: 0, rows: [Buffer.from([42])], idatParts: 3,
  }));
  assert.deepEqual([...decoded.data], [42]);
});
