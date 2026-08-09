#!/usr/bin/env node
// Exposes exact bounded companion-file bytes through the fixed asset-reader protocol.
// Filesystem policy is isolated in safe_file so image decoding can reuse it without duplication.
import { readAsset, readFailureCode } from "./safe_file.mjs";

const SUCCESS = Buffer.from("U220ASSET1\n", "ascii");
const FAILURE = "U220ERROR1\n";

function fail(code) {
  process.stdout.write(`${FAILURE}${code}\n`);
  process.exitCode = 0;
}

const [documentPath, reference, rawMaximum] = process.argv.slice(2);
const maximum = /^\d+$/u.test(rawMaximum || "") ? Number(rawMaximum) : 0;
if (!documentPath || reference === undefined || maximum < 1 || maximum > 8 * 1024 * 1024) {
  fail("USAGE_INVALID");
} else {
  try {
    const bytes = readAsset(documentPath, reference, maximum);
    process.stdout.write(SUCCESS);
    process.stdout.write(bytes);
  } catch (error) {
    fail(readFailureCode(error));
  }
}
