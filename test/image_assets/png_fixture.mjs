// Builds small, deterministic PNG byte streams so decoder tests can target each
// color model, row filter, and structural failure without opaque binary fixtures.
import zlib from "node:zlib";
import { crc32 } from "../../libexec/image_assets/png/crc32.mjs";

export const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);

export function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const size = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32([typeBytes, data]));
  return Buffer.concat([size, typeBytes, data, checksum]);
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const distances = [
    Math.abs(estimate - left),
    Math.abs(estimate - up),
    Math.abs(estimate - upperLeft),
  ];
  const minimum = Math.min(...distances);
  return [left, up, upperLeft][distances.indexOf(minimum)];
}

function prediction(filter, left, up, upperLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upperLeft);
  throw new Error("unsupported test filter");
}

function filteredRows(rows, filters, bytesPerPixel) {
  const output = [];
  for (let row = 0; row < rows.length; row += 1) {
    const source = rows[row];
    const prior = rows[row - 1];
    const filter = filters[row] ?? 0;
    const encoded = Buffer.alloc(source.length + 1);
    encoded[0] = filter;
    for (let column = 0; column < source.length; column += 1) {
      const left = column >= bytesPerPixel ? source[column - bytesPerPixel] : 0;
      const up = prior ? prior[column] : 0;
      const upperLeft = prior && column >= bytesPerPixel
        ? prior[column - bytesPerPixel] : 0;
      encoded[column + 1] = (source[column]
        - prediction(filter, left, up, upperLeft)) & 0xff;
    }
    output.push(encoded);
  }
  return Buffer.concat(output);
}

export function buildPng({
  width, height, colorType, rows, filters = [], palette, transparency,
  beforeIdat = [], afterIdat = [], idatParts = 1,
}) {
  const channels = CHANNELS.get(colorType);
  if (!channels || rows.length !== height
      || rows.some((row) => row.length !== width * channels)) {
    throw new Error("invalid test image");
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  const compressed = zlib.deflateSync(filteredRows(rows, filters, channels));
  const idat = [];
  for (let index = 0; index < idatParts; index += 1) {
    const start = Math.floor((compressed.length * index) / idatParts);
    const end = Math.floor((compressed.length * (index + 1)) / idatParts);
    idat.push(pngChunk("IDAT", compressed.subarray(start, end)));
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    ...(palette ? [pngChunk("PLTE", palette)] : []),
    ...(transparency ? [pngChunk("tRNS", transparency)] : []),
    ...beforeIdat,
    ...idat,
    ...afterIdat,
    pngChunk("IEND"),
  ]);
}
