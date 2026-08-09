export const PRINTABLE_ASCII = Array.from(
  { length: 0x7f - 0x20 }, (_, index) => String.fromCharCode(0x20 + index),
).join("");

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
