// Reduces decoded JPEG RGB samples to the same integer-stable luminance used by
// the PNG path, keeping downstream interpretation independent of source format.
import { jpegError } from "./error.mjs";

export function rgbToGrayscale(rgb, width, height) {
  const pixels = width * height;
  if (!(rgb instanceof Uint8Array) || !Number.isSafeInteger(pixels)
      || pixels < 1 || rgb.length !== pixels * 3) {
    jpegError("JPEG_RASTER_INVALID");
  }
  const output = Buffer.allocUnsafe(pixels);
  for (let pixel = 0, at = 0; pixel < pixels; pixel += 1, at += 3) {
    output[pixel] = Math.floor(
      (299 * rgb[at] + 587 * rgb[at + 1] + 114 * rgb[at + 2] + 500) / 1000,
    );
  }
  return output;
}
