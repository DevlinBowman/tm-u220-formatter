// Defines stable PNG failure codes so callers can report safe diagnostics without
// exposing zlib internals or partially parsed image data.
export class PngDecodeError extends Error {
  constructor(code) {
    super(code);
    this.name = "PngDecodeError";
    this.code = code;
  }
}

export function pngError(code) {
  throw new PngDecodeError(code);
}
