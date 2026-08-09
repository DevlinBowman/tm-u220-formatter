// Inflates one bounded zlib stream and reverses all five PNG row filters into
// deterministic, tightly packed sample bytes.
import zlib from "node:zlib";
import { pngError } from "./error.mjs";

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const cornerDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= cornerDistance) return left;
  return upDistance <= cornerDistance ? up : upperLeft;
}

function predictor(filter, left, up, upperLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upperLeft);
  pngError("PNG_FILTER_INVALID");
}

export function decodeScanlines(compressed, header) {
  let result;
  try {
    result = zlib.inflateSync(compressed, {
      info: true,
      maxOutputLength: header.inflatedBytes,
    });
  } catch {
    pngError("PNG_DEFLATE_INVALID");
  }
  if (result.buffer.length !== header.inflatedBytes
      || result.engine.bytesWritten !== compressed.length) {
    pngError("PNG_DEFLATE_LENGTH");
  }

  const output = Buffer.allocUnsafe(header.rowBytes * header.height);
  let inputAt = 0;
  for (let row = 0; row < header.height; row += 1) {
    const filter = result.buffer[inputAt];
    inputAt += 1;
    const rowAt = row * header.rowBytes;
    for (let column = 0; column < header.rowBytes; column += 1) {
      const left = column >= header.channels ? output[rowAt + column - header.channels] : 0;
      const up = row > 0 ? output[rowAt + column - header.rowBytes] : 0;
      const upperLeft = row > 0 && column >= header.channels
        ? output[rowAt + column - header.rowBytes - header.channels] : 0;
      output[rowAt + column] = (result.buffer[inputAt] + predictor(
        filter, left, up, upperLeft,
      )) & 0xff;
      inputAt += 1;
    }
  }
  return output;
}
