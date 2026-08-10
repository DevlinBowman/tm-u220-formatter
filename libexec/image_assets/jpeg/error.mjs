// Defines stable JPEG failure codes so callers never receive parser internals or
// partially decoded image details from the third-party codec boundary.
export class JpegDecodeError extends Error {
  constructor(code) {
    super(code);
    this.name = "JpegDecodeError";
    this.code = code;
  }
}

export function jpegError(code) {
  throw new JpegDecodeError(code);
}
