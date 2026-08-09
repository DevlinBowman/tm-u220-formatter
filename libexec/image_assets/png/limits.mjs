// Normalizes decoder resource limits at one trust boundary and rejects misspelled
// controls, keeping allocation checks consistent across parsing and inflation.
import { pngError } from "./error.mjs";

export const DEFAULT_LIMITS = Object.freeze({
  maxInputBytes: 8 * 1024 * 1024,
  maxCompressedBytes: 8 * 1024 * 1024,
  maxInflatedBytes: 32 * 1024 * 1024,
  maxWidth: 4096,
  maxHeight: 4096,
  maxPixels: 4 * 1024 * 1024,
  maxChunks: 1024,
});

const NAMES = new Set(Object.keys(DEFAULT_LIMITS));

export function pngLimits(overrides = {}) {
  if (overrides === null || typeof overrides !== "object" || Array.isArray(overrides)) {
    pngError("PNG_LIMITS_INVALID");
  }
  for (const name of Object.keys(overrides)) {
    if (!NAMES.has(name)) pngError("PNG_LIMIT_UNKNOWN");
  }

  const result = {};
  for (const [name, fallback] of Object.entries(DEFAULT_LIMITS)) {
    const value = overrides[name] ?? fallback;
    if (!Number.isSafeInteger(value) || value < 1) pngError("PNG_LIMITS_INVALID");
    result[name] = value;
  }
  return Object.freeze(result);
}

export function checkedProduct(left, right, code = "PNG_DIMENSIONS_INVALID") {
  const result = left * right;
  if (!Number.isSafeInteger(result)) pngError(code);
  return result;
}
