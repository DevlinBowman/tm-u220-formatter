// Owns draft glyph-mask state independently from receipt and printer data.
// Pattern conversion keeps the atlas's left-to-right row notation explicit and testable.
const HEIGHT = 9;

function assertDimensions(rows, width, height = HEIGHT) {
  if (!Array.isArray(rows) || rows.length !== height
    || rows.some((row) => !Array.isArray(row) || row.length !== width
      || row.some((value) => typeof value !== "boolean"))) {
    throw new TypeError(`glyph rows must be a ${width} × ${height} boolean matrix`);
  }
}

export function patternRows(pattern, width, height = HEIGHT) {
  const rows = String(pattern).split("/");
  if (rows.length !== height
    || rows.some((row) => row.length !== width || /[^.#]/.test(row))) {
    throw new TypeError(`glyph pattern must be ${width} × ${height}`);
  }
  return rows.map((row) => [...row].map((value) => value === "#"));
}

export function rowsPattern(rows, width, height = HEIGHT) {
  assertDimensions(rows, width, height);
  return rows.map((row) => row.map((value) => value ? "#" : ".").join("")).join("/");
}

function cloneFonts(fonts) {
  const result = {};
  for (const [name, font] of Object.entries(fonts || {})) {
    const width = Number(font.width);
    const height = Number(font.height);
    if (!Number.isInteger(width) || height !== HEIGHT || !font.patterns) {
      throw new TypeError(`invalid Font ${name.toUpperCase()} atlas`);
    }
    const patterns = { ...font.patterns };
    for (const pattern of Object.values(patterns)) patternRows(pattern, width, height);
    result[name] = { width, height, patterns };
  }
  return result;
}

function key(font, character) { return `${font}:${character}`; }

export class GlyphEditorModel {
  constructor(fonts, font = "b", character = "A") {
    this.saved = cloneFonts(fonts);
    this.initial = cloneFonts(fonts);
    this.drafts = new Map();
    this.select(font, character);
  }

  select(font, character) {
    if (!this.saved[font] || !Object.hasOwn(this.saved[font].patterns, character)) {
      throw new RangeError("glyph selection is outside the preview atlas");
    }
    this.font = font;
    this.character = character;
  }

  get fontData() { return this.saved[this.font]; }
  get width() { return this.fontData.width; }
  get height() { return this.fontData.height; }
  get pattern() {
    return this.drafts.get(key(this.font, this.character))
      || this.fontData.patterns[this.character];
  }
  get savedPattern() { return this.fontData.patterns[this.character]; }
  get initialPattern() { return this.initial[this.font].patterns[this.character]; }
  get dirty() { return this.pattern !== this.savedPattern; }
  get dirtyCount() { return this.drafts.size; }

  dirtyCharacters(font = this.font) {
    return new Set([...this.drafts.keys()]
      .filter((value) => value.startsWith(`${font}:`))
      .map((value) => value.slice(2)));
  }

  setPattern(pattern) {
    patternRows(pattern, this.width, this.height);
    const currentKey = key(this.font, this.character);
    if (pattern === this.savedPattern) this.drafts.delete(currentKey);
    else this.drafts.set(currentKey, pattern);
  }

  setCell(row, column, value) {
    const rows = patternRows(this.pattern, this.width, this.height);
    if (!rows[row] || typeof rows[row][column] !== "boolean") {
      throw new RangeError("glyph cell is outside the editable lattice");
    }
    rows[row][column] = Boolean(value);
    this.setPattern(rowsPattern(rows, this.width, this.height));
  }

  clear() {
    this.setPattern(Array(this.height).fill(".".repeat(this.width)).join("/"));
  }

  revert() { this.setPattern(this.savedPattern); }
  restoreInitial() { this.setPattern(this.initialPattern); }

  markGlyphSaved(font, character, pattern) {
    const fontData = this.saved[font];
    if (!fontData || !Object.hasOwn(fontData.patterns, character)) {
      throw new RangeError("saved glyph is outside the preview atlas");
    }
    patternRows(pattern, fontData.width, fontData.height);
    fontData.patterns[character] = pattern;
    this.drafts.delete(key(font, character));
  }

  markSaved(pattern = this.pattern) {
    this.markGlyphSaved(this.font, this.character, pattern);
  }
}
