// Compiles authored dot-pattern sources into immutable resident glyph atlases.
// ASCII remains complete while page-437 extensions are sparse and byte-addressed.
export const PRINTABLE_ASCII = Array.from(
  { length: 0x7f - 0x20 }, (_, index) => String.fromCharCode(0x20 + index),
).join("");

const PAGE_437_EXTENDED_BYTES = new Set(Array.from(
  { length: 0x100 - 0x80 }, (_, index) => 0x80 + index,
));

function compileRow(row, width, character) {
  if (row.length !== width || /[^.#]/.test(row)) {
    throw new Error(`invalid ${width}-column row for ${JSON.stringify(character)}`);
  }
  return [...row].reduce((mask, value, column) =>
    value === "#" ? mask | (1 << (width - column - 1)) : mask, 0);
}

function compileGlyph(pattern, width, character) {
  if (typeof pattern !== "string") {
    throw new Error(`missing resident glyph ${JSON.stringify(character)}`);
  }
  const rows = pattern.split("/");
  if (rows.length !== 9) {
    throw new Error(`resident glyph ${JSON.stringify(character)} needs 9 rows`);
  }
  return Object.freeze({
    width,
    height: 9,
    rows: Object.freeze(rows.map((row) => compileRow(row, width, character))),
  });
}

export function compileAtlas(patterns, width) {
  const expected = new Set(PRINTABLE_ASCII);
  const extras = Object.keys(patterns).filter((character) => !expected.has(character));
  if (extras.length) throw new Error(`unexpected resident glyph ${extras[0]}`);
  return Object.freeze(Object.fromEntries([...PRINTABLE_ASCII].map(
    (character) => [character, compileGlyph(patterns[character], width, character)],
  )));
}

export function page437ByteKey(byte) {
  if (!Number.isInteger(byte) || !PAGE_437_EXTENDED_BYTES.has(byte)) {
    throw new RangeError("page-437 extension byte must be 0x80 through 0xFF");
  }
  return byte.toString(16).toUpperCase().padStart(2, "0");
}

export function compileSparseByteAtlas(
  patterns, width, allowedBytes = PAGE_437_EXTENDED_BYTES,
) {
  if (!patterns || typeof patterns !== "object" || Array.isArray(patterns)) {
    throw new TypeError("sparse resident patterns must be a byte-keyed object");
  }
  const entries = Object.entries(patterns).map(([key, pattern]) => {
    if (!/^[0-9A-F]{2}$/.test(key)) {
      throw new Error(`invalid page-437 resident byte key ${JSON.stringify(key)}`);
    }
    const byte = Number.parseInt(key, 16);
    if (!PAGE_437_EXTENDED_BYTES.has(byte) || !allowedBytes.has(byte)) {
      throw new Error(`unexpected page-437 resident byte 0x${key}`);
    }
    return [key, compileGlyph(pattern, width, `byte 0x${key}`)];
  });
  return Object.freeze(Object.fromEntries(entries));
}
