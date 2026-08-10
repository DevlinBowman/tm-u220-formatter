// Walks JPEG markers and entropy-coded scan bytes without interpreting image samples.
// Stuffed bytes, fill bytes, and restart markers remain bounded structural input.
import { jpegError } from "./error.mjs";

export function markerAt(bytes, offset) {
  if (offset >= bytes.length || bytes[offset] !== 0xff) {
    jpegError("JPEG_MARKER_INVALID");
  }
  while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
  if (offset >= bytes.length) jpegError("JPEG_MARKER_TRUNCATED");
  const code = bytes[offset];
  if (code === 0x00) jpegError("JPEG_MARKER_INVALID");
  return { code, offset: offset + 1 };
}

export function segmentAt(bytes, offset) {
  if (offset + 2 > bytes.length) jpegError("JPEG_SEGMENT_TRUNCATED");
  const length = bytes.readUInt16BE(offset);
  if (length < 2) jpegError("JPEG_SEGMENT_INVALID");
  const end = offset + length;
  if (end > bytes.length) jpegError("JPEG_SEGMENT_TRUNCATED");
  return { offset, length, end };
}

export function isStandalone(code) {
  return code === 0x01 || (code >= 0xd0 && code <= 0xd7);
}

export function scanEntropy(bytes, offset, countStandalone) {
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const markerOffset = offset;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) jpegError("JPEG_SCAN_TRUNCATED");
    const code = bytes[offset];
    if (code === 0x00) {
      offset += 1;
      continue;
    }
    if (code === 0x01 || (code >= 0xd0 && code <= 0xd7)) {
      countStandalone();
      offset += 1;
      continue;
    }
    return markerOffset;
  }
  jpegError("JPEG_EOI_MISSING");
}
