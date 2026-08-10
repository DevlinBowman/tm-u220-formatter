#!/usr/bin/env node
// Safely reads one image and emits either original PBM bytes or decoded grayscale pixels.
// This is the fixed Node-to-Lua orchestration boundary; raster interpretation remains in Lua.
import { decodeJpeg } from "./jpeg/decode.mjs";
import { decodePng } from "./png/decode.mjs";
import { readAsset, readFailureCode, readRootAsset } from "./safe_file.mjs";

const RAW_SUCCESS = Buffer.from("U220ASSET1\n", "ascii");
const GRAY_SUCCESS = "U220GRAY2\n";
const FAILURE = "U220ERROR1\n";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function fail(code) {
  process.stdout.write(`${FAILURE}${code}\n`);
  process.exitCode = 0;
}

function isPng(bytes) {
  return bytes.length >= PNG_SIGNATURE.length
    && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

function isJpeg(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function emitGrayscale(format, raster, sourceBytes) {
  process.stdout.write(
    `${GRAY_SUCCESS}${format} ${raster.width} ${raster.height} ${sourceBytes}\n`,
  );
  process.stdout.write(raster.data);
}

function emitImage(bytes, maximum) {
  const format = isPng(bytes) ? "png" : (isJpeg(bytes) ? "jpeg" : null);
  if (!format) {
    process.stdout.write(RAW_SUCCESS);
    process.stdout.write(bytes);
    return;
  }
  let raster;
  try {
    if (format === "png") {
      raster = decodePng(bytes, {
        maxInputBytes: maximum,
        maxCompressedBytes: maximum,
        maxInflatedBytes: 20 * 1024 * 1024,
        maxWidth: 4096,
        maxHeight: 4096,
        maxPixels: 4 * 1024 * 1024,
        maxChunks: 1024,
      });
    } else {
      raster = decodeJpeg(bytes, {
        maxInputBytes: maximum,
        maxWidth: 4096,
        maxHeight: 4096,
        maxPixels: 4 * 1024 * 1024,
      });
    }
  } catch {
    fail(format === "png" ? "PNG_INVALID" : "JPEG_INVALID");
    return;
  }
  emitGrayscale(format, raster, bytes.length);
}

const [basePath, reference, rawMaximum, baseKind = "document"] = process.argv.slice(2);
const maximum = /^\d+$/u.test(rawMaximum || "") ? Number(rawMaximum) : 0;
if (!basePath || reference === undefined || maximum < 1 || maximum > 8 * 1024 * 1024
    || (baseKind !== "document" && baseKind !== "root")) {
  fail("USAGE_INVALID");
} else {
  try {
    const read = baseKind === "root" ? readRootAsset : readAsset;
    emitImage(read(basePath, reference, maximum), maximum);
  } catch (error) {
    fail(readFailureCode(error));
  }
}
