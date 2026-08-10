// Exposes a strict JPEG-to-grayscale boundary around the pinned third-party decoder.
// Geometry and memory ceilings are validated before any image-sized allocation.
import decodeVendor from "./vendor/jpeg-js-0.4.4/decoder.cjs";
import { JpegDecodeError, jpegError } from "./error.mjs";
import { rgbToGrayscale } from "./grayscale.mjs";
import { DEFAULT_LIMITS, preflightJpeg } from "./preflight.mjs";

export function decodeJpeg(bytes, limitOverrides = {}) {
  const inspected = preflightJpeg(bytes, limitOverrides);
  let decoded;
  try {
    decoded = decodeVendor(inspected.bytes, {
      useTArray: true,
      formatAsRGBA: false,
      tolerantDecoding: false,
      maxResolutionInMP: inspected.limits.maxPixels / 1_000_000,
      maxMemoryUsageInMB: inspected.limits.maxMemoryUsageBytes / (1024 * 1024),
    });
  } catch {
    jpegError("JPEG_DECODE_INVALID");
  }
  const { width, height } = inspected.frame;
  if (!decoded || decoded.width !== width || decoded.height !== height
      || !(decoded.data instanceof Uint8Array) || decoded.data.length !== width * height * 3) {
    jpegError("JPEG_RASTER_INVALID");
  }
  return Object.freeze({
    width,
    height,
    data: rgbToGrayscale(decoded.data, width, height),
  });
}

export { DEFAULT_LIMITS, JpegDecodeError };
