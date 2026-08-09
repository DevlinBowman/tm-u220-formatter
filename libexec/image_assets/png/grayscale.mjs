// Converts supported 8-bit PNG samples to printer-neutral grayscale while
// compositing every transparency form onto white with integer-stable math.
import { pngError } from "./error.mjs";

function luminance(red, green, blue) {
  return Math.floor((299 * red + 587 * green + 114 * blue + 500) / 1000);
}

function onWhite(gray, alpha) {
  return Math.floor((gray * alpha + 255 * (255 - alpha) + 127) / 255);
}

function transparencyKey(header, transparency) {
  if (!transparency) return null;
  if (header.colorType === 0) return [transparency.readUInt16BE(0)];
  if (header.colorType === 2) {
    return [0, 2, 4].map((at) => transparency.readUInt16BE(at));
  }
  return null;
}

export function toGrayscale(samples, structure) {
  const { header, palette, transparency } = structure;
  const output = Buffer.allocUnsafe(header.width * header.height);
  const key = transparencyKey(header, transparency);

  for (let pixel = 0, at = 0; pixel < output.length; pixel += 1) {
    let gray;
    let alpha = 255;
    if (header.colorType === 0) {
      gray = samples[at];
      alpha = key && samples[at] === key[0] ? 0 : 255;
      at += 1;
    } else if (header.colorType === 2) {
      gray = luminance(samples[at], samples[at + 1], samples[at + 2]);
      alpha = key && samples[at] === key[0] && samples[at + 1] === key[1]
        && samples[at + 2] === key[2] ? 0 : 255;
      at += 3;
    } else if (header.colorType === 3) {
      const index = samples[at];
      const paletteAt = index * 3;
      if (paletteAt + 2 >= palette.length) pngError("PNG_PALETTE_INDEX_INVALID");
      gray = luminance(palette[paletteAt], palette[paletteAt + 1], palette[paletteAt + 2]);
      alpha = transparency && index < transparency.length ? transparency[index] : 255;
      at += 1;
    } else if (header.colorType === 4) {
      gray = samples[at];
      alpha = samples[at + 1];
      at += 2;
    } else {
      gray = luminance(samples[at], samples[at + 1], samples[at + 2]);
      alpha = samples[at + 3];
      at += 4;
    }
    output[pixel] = onWhite(gray, alpha);
  }
  return output;
}
