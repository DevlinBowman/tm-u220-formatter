// Exposes the pure PNG-to-grayscale boundary used by image asset orchestration.
// Parsing, inflation, and color conversion remain isolated and independently testable.
import { parseChunks } from "./chunks.mjs";
import { PngDecodeError, pngError } from "./error.mjs";
import { toGrayscale } from "./grayscale.mjs";
import { pngLimits, DEFAULT_LIMITS } from "./limits.mjs";
import { decodeScanlines } from "./scanlines.mjs";

function byteBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  pngError("PNG_INPUT_INVALID");
}

export function decodePng(bytes, limitOverrides = {}) {
  const limits = pngLimits(limitOverrides);
  const structure = parseChunks(byteBuffer(bytes), limits);
  const samples = decodeScanlines(structure.compressed, structure.header);
  return Object.freeze({
    width: structure.header.width,
    height: structure.header.height,
    data: toGrayscale(samples, structure),
  });
}

export { DEFAULT_LIMITS, PngDecodeError };
