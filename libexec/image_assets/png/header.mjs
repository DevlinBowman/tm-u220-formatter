// Validates the PNG header and derives the exact byte geometry used by the
// bounded inflater, scanline filters, and pixel converter.
import { checkedProduct } from "./limits.mjs";
import { pngError } from "./error.mjs";

const CHANNELS = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);

export function parseHeader(data, limits) {
  if (data.length !== 13) pngError("PNG_IHDR_INVALID");
  const width = data.readUInt32BE(0);
  const height = data.readUInt32BE(4);
  const bitDepth = data[8];
  const colorType = data[9];
  const channels = CHANNELS.get(colorType);

  if (width < 1 || height < 1 || width > limits.maxWidth
      || height > limits.maxHeight) pngError("PNG_DIMENSIONS_LIMIT");
  if (checkedProduct(width, height) > limits.maxPixels) {
    pngError("PNG_PIXELS_LIMIT");
  }
  if (bitDepth !== 8 || channels === undefined || data[10] !== 0
      || data[11] !== 0 || data[12] !== 0) pngError("PNG_IHDR_UNSUPPORTED");

  const rowBytes = checkedProduct(width, channels);
  const inflatedBytes = checkedProduct(height, rowBytes + 1);
  if (inflatedBytes > limits.maxInflatedBytes) pngError("PNG_INFLATED_LIMIT");
  return Object.freeze({
    width, height, bitDepth, colorType, channels, rowBytes, inflatedBytes,
  });
}
