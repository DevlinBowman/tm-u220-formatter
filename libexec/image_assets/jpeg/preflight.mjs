// Validates bounded JPEG frame geometry before the vendored decoder may allocate.
// It admits only the Huffman-coded 8-bit frame families supported by this project.
import { jpegError } from "./error.mjs";
import { isStandalone, markerAt, scanEntropy, segmentAt } from "./markers.mjs";

export const DEFAULT_LIMITS = Object.freeze({
  maxInputBytes: 8 * 1024 * 1024,
  maxWidth: 4096,
  maxHeight: 4096,
  maxPixels: 4 * 1024 * 1024,
  maxMemoryUsageBytes: 128 * 1024 * 1024,
  maxSegments: 1024,
});

const LIMIT_NAMES = new Set(Object.keys(DEFAULT_LIMITS));
const SUPPORTED_SOF = new Map([
  [0xc0, "baseline"],
  [0xc1, "extended"],
  [0xc2, "progressive"],
]);
const UNSUPPORTED_SOF = new Set([
  0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function byteBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  jpegError("JPEG_INPUT_INVALID");
}

export function jpegLimits(overrides = {}) {
  if (overrides === null || typeof overrides !== "object" || Array.isArray(overrides)) {
    jpegError("JPEG_LIMITS_INVALID");
  }
  for (const name of Object.keys(overrides)) {
    if (!LIMIT_NAMES.has(name)) jpegError("JPEG_LIMIT_UNKNOWN");
  }
  const limits = {};
  for (const [name, fallback] of Object.entries(DEFAULT_LIMITS)) {
    const value = overrides[name] ?? fallback;
    if (!Number.isSafeInteger(value) || value < 1) jpegError("JPEG_LIMITS_INVALID");
    limits[name] = value;
  }
  return Object.freeze(limits);
}

function frameHeader(bytes, offset, length, kind, limits) {
  if (length < 8) jpegError("JPEG_SOF_INVALID");
  const precision = bytes[offset + 2];
  const height = bytes.readUInt16BE(offset + 3);
  const width = bytes.readUInt16BE(offset + 5);
  const components = bytes[offset + 7];
  if (length !== 8 + components * 3) jpegError("JPEG_SOF_INVALID");
  if (precision !== 8) jpegError("JPEG_PRECISION_UNSUPPORTED");
  if (width < 1 || height < 1 || width > limits.maxWidth || height > limits.maxHeight) {
    jpegError("JPEG_DIMENSIONS_LIMIT");
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > limits.maxPixels) {
    jpegError("JPEG_PIXELS_LIMIT");
  }
  if (![1, 3, 4].includes(components)) jpegError("JPEG_COMPONENTS_UNSUPPORTED");

  const identifiers = new Set();
  let blocksPerMcu = 0;
  for (let index = 0; index < components; index += 1) {
    const at = offset + 8 + index * 3;
    const identifier = bytes[at];
    const horizontal = bytes[at + 1] >> 4;
    const vertical = bytes[at + 1] & 0x0f;
    const quantization = bytes[at + 2];
    if (identifiers.has(identifier)) jpegError("JPEG_COMPONENTS_INVALID");
    identifiers.add(identifier);
    if (horizontal < 1 || horizontal > 4 || vertical < 1 || vertical > 4) {
      jpegError("JPEG_SAMPLING_UNSUPPORTED");
    }
    blocksPerMcu += horizontal * vertical;
    if (quantization > 3) jpegError("JPEG_QUANTIZATION_UNSUPPORTED");
  }
  if (blocksPerMcu > 10) jpegError("JPEG_SAMPLING_UNSUPPORTED");
  return Object.freeze({ kind, width, height, components, precision, pixels });
}

function withAdobeTransform(frame, adobeTransform) {
  if (frame.components === 4 && adobeTransform === null) jpegError("JPEG_ADOBE_REQUIRED");
  if (frame.components === 4 && adobeTransform !== 0 && adobeTransform !== 2) {
    jpegError("JPEG_ADOBE_TRANSFORM_UNSUPPORTED");
  }
  if (frame.components === 3 && adobeTransform !== null
      && adobeTransform !== 0 && adobeTransform !== 1) {
    jpegError("JPEG_ADOBE_TRANSFORM_UNSUPPORTED");
  }
  return Object.freeze({ ...frame, adobeTransform });
}

function readAdobeTransform(bytes, offset, length, previous) {
  const payload = bytes.subarray(offset + 2, offset + length);
  if (payload.length < 5 || payload.toString("ascii", 0, 5) !== "Adobe") return previous;
  if (previous !== null || payload.length !== 12 || payload[5] !== 0) {
    jpegError("JPEG_ADOBE_INVALID");
  }
  return payload[11];
}

export function preflightJpeg(value, limitOverrides = {}) {
  const bytes = byteBuffer(value);
  const limits = jpegLimits(limitOverrides);
  if (bytes.length > limits.maxInputBytes) jpegError("JPEG_INPUT_LIMIT");
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    jpegError("JPEG_SIGNATURE_INVALID");
  }

  let offset = 2;
  let segments = 0;
  let adobeTransform = null;
  let frame = null;
  function countMarker() {
    segments += 1;
    if (segments > limits.maxSegments) jpegError("JPEG_SEGMENTS_LIMIT");
  }
  while (offset < bytes.length) {
    const marker = markerAt(bytes, offset);
    offset = marker.offset;
    countMarker();
    if (marker.code === 0xd9) {
      if (!frame) jpegError("JPEG_SOF_MISSING");
      return Object.freeze({
        bytes, limits, frame: withAdobeTransform(frame, adobeTransform),
      });
    }
    if (marker.code === 0xd8) jpegError("JPEG_MARKER_INVALID");
    if (isStandalone(marker.code)) continue;
    if (marker.code === 0xda && !frame) jpegError("JPEG_SOF_MISSING");
    const segment = segmentAt(bytes, offset);
    if (marker.code === 0xda) {
      offset = scanEntropy(bytes, segment.end, countMarker);
      continue;
    }
    if (marker.code === 0xee) {
      adobeTransform = readAdobeTransform(
        bytes, segment.offset, segment.length, adobeTransform,
      );
    }
    const kind = SUPPORTED_SOF.get(marker.code);
    if (kind) {
      if (frame) jpegError("JPEG_FRAMES_UNSUPPORTED");
      frame = frameHeader(bytes, segment.offset, segment.length, kind, limits);
    }
    if (UNSUPPORTED_SOF.has(marker.code)) jpegError("JPEG_SOF_UNSUPPORTED");
    offset = segment.end;
  }
  jpegError(frame ? "JPEG_EOI_MISSING" : "JPEG_SOF_MISSING");
}
