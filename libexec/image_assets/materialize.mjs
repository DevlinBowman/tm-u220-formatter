#!/usr/bin/env node
// Safely reads one image and emits either original PBM-candidate bytes or decoded grayscale PNG.
// This is the fixed Node-to-Lua orchestration boundary; raster interpretation remains in Lua.
import { decodePng } from "./png/decode.mjs";
import { readAsset, readFailureCode, readRootAsset } from "./safe_file.mjs";

const RAW_SUCCESS = Buffer.from("U220ASSET1\n", "ascii");
const GRAY_SUCCESS = "U220GRAY1\n";
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

function emitImage(bytes, maximum) {
  if (!isPng(bytes)) {
    process.stdout.write(RAW_SUCCESS);
    process.stdout.write(bytes);
    return;
  }
  let raster;
  try {
    raster = decodePng(bytes, {
      maxInputBytes: maximum,
      maxCompressedBytes: maximum,
      maxInflatedBytes: 20 * 1024 * 1024,
      maxWidth: 4096,
      maxHeight: 4096,
      maxPixels: 4 * 1024 * 1024,
      maxChunks: 1024,
    });
  } catch {
    fail("PNG_INVALID");
    return;
  }
  process.stdout.write(`${GRAY_SUCCESS}${raster.width} ${raster.height} ${bytes.length}\n`);
  process.stdout.write(raster.data);
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
