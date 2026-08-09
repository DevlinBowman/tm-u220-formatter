// Parses and validates the structural PNG envelope before any compressed bytes
// are trusted, including CRCs, critical ordering, and palette transparency rules.
import { crc32 } from "./crc32.mjs";
import { pngError } from "./error.mjs";
import { parseHeader } from "./header.mjs";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunkName(bytes) {
  for (const byte of bytes) {
    const letter = (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122);
    if (!letter) pngError("PNG_CHUNK_TYPE_INVALID");
  }
  if (bytes[2] >= 97) pngError("PNG_CHUNK_TYPE_INVALID");
  return bytes.toString("ascii");
}

function validatePalette(data, header) {
  if (header.colorType === 0 || header.colorType === 4
      || data.length < 3 || data.length > 768 || data.length % 3 !== 0) {
    pngError("PNG_PLTE_INVALID");
  }
  return Buffer.from(data);
}

function validateTransparency(data, header, palette) {
  if (header.colorType === 0) {
    if (data.length !== 2 || data.readUInt16BE(0) > 255) pngError("PNG_TRNS_INVALID");
  } else if (header.colorType === 2) {
    if (data.length !== 6 || [0, 2, 4].some((at) => data.readUInt16BE(at) > 255)) {
      pngError("PNG_TRNS_INVALID");
    }
  } else if (header.colorType === 3) {
    if (!palette || data.length < 1 || data.length > palette.length / 3) {
      pngError("PNG_TRNS_INVALID");
    }
  } else {
    pngError("PNG_TRNS_INVALID");
  }
  return Buffer.from(data);
}

export function parseChunks(bytes, limits) {
  if (bytes.length > limits.maxInputBytes) pngError("PNG_INPUT_LIMIT");
  if (bytes.length < SIGNATURE.length || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    pngError("PNG_SIGNATURE_INVALID");
  }

  let offset = 8;
  let count = 0;
  let header;
  let palette;
  let transparency;
  let idatClosed = false;
  const idat = [];
  let compressedBytes = 0;

  while (offset < bytes.length) {
    count += 1;
    if (count > limits.maxChunks || offset + 12 > bytes.length) {
      pngError(count > limits.maxChunks ? "PNG_CHUNKS_LIMIT" : "PNG_CHUNK_TRUNCATED");
    }
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (!Number.isSafeInteger(end) || end > bytes.length) pngError("PNG_CHUNK_TRUNCATED");
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = chunkName(typeBytes);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32([typeBytes, data]) !== bytes.readUInt32BE(offset + 8 + length)) {
      pngError("PNG_CRC_INVALID");
    }
    if (!header && type !== "IHDR") pngError("PNG_IHDR_ORDER");

    if (type === "IHDR") {
      if (header || count !== 1) pngError("PNG_IHDR_ORDER");
      header = parseHeader(data, limits);
    } else if (type === "PLTE") {
      if (palette || transparency || idat.length > 0) pngError("PNG_PLTE_ORDER");
      palette = validatePalette(data, header);
    } else if (type === "tRNS") {
      if (transparency || idat.length > 0) pngError("PNG_TRNS_ORDER");
      transparency = validateTransparency(data, header, palette);
    } else if (type === "IDAT") {
      if (idatClosed) pngError("PNG_IDAT_ORDER");
      if (header.colorType === 3 && !palette) pngError("PNG_PLTE_REQUIRED");
      compressedBytes += data.length;
      if (compressedBytes > limits.maxCompressedBytes) pngError("PNG_COMPRESSED_LIMIT");
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      if (length !== 0 || idat.length === 0 || end !== bytes.length) {
        pngError("PNG_IEND_INVALID");
      }
      if (compressedBytes === 0) pngError("PNG_IDAT_INVALID");
      return { header, palette, transparency, compressed: Buffer.concat(idat) };
    } else {
      if ((typeBytes[0] & 0x20) === 0) pngError("PNG_CRITICAL_UNKNOWN");
      if (idat.length > 0) idatClosed = true;
    }
    if (type !== "IDAT" && idat.length > 0) idatClosed = true;
    offset = end;
  }
  pngError("PNG_IEND_MISSING");
}
