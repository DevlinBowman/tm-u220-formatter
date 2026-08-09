// Exercises hostile PNG envelopes and explicit allocation ceilings so malformed
// assets fail before they can influence downstream raster or printer commands.
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { decodePng, PngDecodeError } from "../../libexec/image_assets/png/decode.mjs";
import { buildPng, pngChunk, PNG_SIGNATURE } from "./png_fixture.mjs";

function tiny(overrides = {}) {
  return buildPng({
    width: 1, height: 1, colorType: 0, rows: [Buffer.from([7])], ...overrides,
  });
}

function failure(bytes, code, limits) {
  assert.throws(() => decodePng(bytes, limits), (error) => {
    assert.equal(error instanceof PngDecodeError, true);
    assert.equal(error.code, code);
    return true;
  });
}

test("rejects bad signatures, truncation, and CRC changes", () => {
  const valid = tiny();
  const badSignature = Buffer.from(valid);
  badSignature[0] = 0;
  failure(badSignature, "PNG_SIGNATURE_INVALID");
  failure(valid.subarray(0, valid.length - 1), "PNG_CHUNK_TRUNCATED");
  const badCrc = Buffer.from(valid);
  badCrc[29] ^= 1;
  failure(badCrc, "PNG_CRC_INVALID");
});

test("rejects unknown critical chunks and nonconsecutive IDAT", () => {
  failure(tiny({ beforeIdat: [pngChunk("ABCD")] }), "PNG_CRITICAL_UNKNOWN");
  const base = tiny();
  const firstIdat = base.indexOf(Buffer.from("IDAT")) - 4;
  const idatLength = base.readUInt32BE(firstIdat);
  const idatEnd = firstIdat + 12 + idatLength;
  const separated = Buffer.concat([
    base.subarray(0, idatEnd),
    pngChunk("tEXt", Buffer.from("safe")),
    pngChunk("IDAT"),
    base.subarray(idatEnd),
  ]);
  failure(separated, "PNG_IDAT_ORDER");
});

test("rejects missing palettes, invalid palette indexes, and invalid filters", () => {
  failure(tiny({ colorType: 3 }), "PNG_PLTE_REQUIRED");
  failure(tiny({
    colorType: 3,
    rows: [Buffer.from([1])],
    palette: Buffer.from([0, 0, 0]),
  }), "PNG_PALETTE_INDEX_INVALID");

  const raw = Buffer.from([5, 7]);
  const compressed = zlib.deflateSync(raw);
  const valid = tiny();
  const idatAt = valid.indexOf(Buffer.from("IDAT")) - 4;
  const idatLength = valid.readUInt32BE(idatAt);
  const end = idatAt + 12 + idatLength;
  const invalidFilter = Buffer.concat([
    valid.subarray(0, idatAt), pngChunk("IDAT", compressed), valid.subarray(end),
  ]);
  failure(invalidFilter, "PNG_FILTER_INVALID");
});

test("rejects duplicate or reversed palette and transparency chunks", () => {
  const palette = Buffer.from([0, 0, 0]);
  failure(tiny({
    colorType: 3, palette, beforeIdat: [pngChunk("PLTE", palette)],
  }), "PNG_PLTE_ORDER");
  failure(tiny({
    transparency: Buffer.from([0, 7]),
    beforeIdat: [pngChunk("tRNS", Buffer.from([0, 8]))],
  }), "PNG_TRNS_ORDER");
  failure(tiny({
    colorType: 2,
    rows: [Buffer.from([1, 2, 3])],
    beforeIdat: [
      pngChunk("tRNS", Buffer.alloc(6)),
      pngChunk("PLTE", palette),
    ],
  }), "PNG_PLTE_ORDER");
});

test("rejects trailing zlib data and an unexpected inflated length", () => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  const stream = zlib.deflateSync(Buffer.from([0, 9]));
  const trailing = Buffer.concat([
    PNG_SIGNATURE, pngChunk("IHDR", header),
    pngChunk("IDAT", Buffer.concat([stream, Buffer.from([1])])), pngChunk("IEND"),
  ]);
  failure(trailing, "PNG_DEFLATE_LENGTH");
  const short = Buffer.concat([
    PNG_SIGNATURE, pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(Buffer.from([0]))), pngChunk("IEND"),
  ]);
  failure(short, "PNG_DEFLATE_LENGTH");
});

test("enforces input, dimensions, pixels, inflation, compression, and chunk limits", () => {
  const image = buildPng({
    width: 2, height: 2, colorType: 0,
    rows: [Buffer.from([1, 2]), Buffer.from([3, 4])],
    beforeIdat: [pngChunk("tEXt", Buffer.from("note"))],
  });
  failure(image, "PNG_INPUT_LIMIT", { maxInputBytes: image.length - 1 });
  failure(image, "PNG_DIMENSIONS_LIMIT", { maxWidth: 1 });
  failure(image, "PNG_DIMENSIONS_LIMIT", { maxHeight: 1 });
  failure(image, "PNG_PIXELS_LIMIT", { maxPixels: 3 });
  failure(image, "PNG_INFLATED_LIMIT", { maxInflatedBytes: 5 });
  failure(image, "PNG_COMPRESSED_LIMIT", { maxCompressedBytes: 1 });
  failure(image, "PNG_CHUNKS_LIMIT", { maxChunks: 2 });
});

test("rejects unknown or invalid limit controls", () => {
  failure(tiny(), "PNG_LIMIT_UNKNOWN", { maximumPixels: 2 });
  failure(tiny(), "PNG_LIMITS_INVALID", { maxPixels: 0 });
});
