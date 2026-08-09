// Verifies PNG chunk integrity with the format's standard CRC-32 polynomial.
// The incremental parts API avoids copying each chunk solely for validation.
const TABLE = new Uint32Array(256);

for (let index = 0; index < TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1
      ? (0xedb88320 ^ (value >>> 1)) >>> 0
      : value >>> 1;
  }
  TABLE[index] = value;
}

export function crc32(parts) {
  let value = 0xffffffff;
  for (const part of parts) {
    for (const byte of part) {
      value = (TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)) >>> 0;
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}
