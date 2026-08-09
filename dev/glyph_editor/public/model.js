// Owns catalog-addressed draft masks independently from receipt and printer data.
// Missing PC437 masks remain editable blank drafts without pretending to be authored.
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
export function blankPattern(width, height = HEIGHT) {
  if (!Number.isInteger(width) || width < 1 || height !== HEIGHT) {
    throw new TypeError("blank glyph requires a positive width and nine rows");
  }
  return Array(height).fill(".".repeat(width)).join("/");
}
function identity(page, byte) { return `${page}:${byte}`; }
function draftKey(font, page, byte) { return `${font}:${identity(page, byte)}`; }
function cloneCatalog(catalog) {
  if (!Array.isArray(catalog) || !catalog.length) {
    throw new TypeError("glyph catalog must contain page-byte descriptors");
  }
  const seen = new Set();
  return catalog.map((entry) => {
    const glyph = {
      page: Number(entry?.page), byte: Number(entry?.byte),
      character: entry?.character,
    };
    const key = identity(glyph.page, glyph.byte);
    if (glyph.page !== 0 || !Number.isInteger(glyph.byte)
      || glyph.byte < 0x20 || glyph.byte > 0xff || glyph.byte === 0x7f
      || [...String(glyph.character ?? "")].length !== 1 || seen.has(key)) {
      throw new TypeError("invalid PC437 glyph descriptor");
    }
    seen.add(key);
    return Object.freeze(glyph);
  });
}
function cloneFonts(fonts, catalogKeys) {
  const result = {};
  for (const [name, font] of Object.entries(fonts || {})) {
    const width = Number(font.width);
    const height = Number(font.height);
    const authoredBytes = new Set((font.authoredBytes || []).map(Number));
    const patterns = {};
    if (!Number.isInteger(width) || height !== HEIGHT || !font.patterns
      || [...authoredBytes].some((byte) => !catalogKeys.has(identity(0, byte)))) {
      throw new TypeError(`invalid Font ${name.toUpperCase()} atlas`);
    }
    for (const [rawByte, pattern] of Object.entries(font.patterns)) {
      const byte = Number(rawByte);
      if (!authoredBytes.has(byte) || !catalogKeys.has(identity(0, byte))) {
        throw new TypeError(`invalid Font ${name.toUpperCase()} pattern address`);
      }
      patternRows(pattern, width, height);
      patterns[byte] = pattern;
    }
    if ([...authoredBytes].some((byte) => !Object.hasOwn(patterns, byte))) {
      throw new TypeError(`Font ${name.toUpperCase()} authored mask is missing`);
    }
    result[name] = { width, height, patterns, authoredBytes };
  }
  return result;
}
function cloneFontState(fonts) {
  return Object.fromEntries(Object.entries(fonts).map(([name, font]) => [name, {
    width: font.width, height: font.height, patterns: { ...font.patterns },
    authoredBytes: new Set(font.authoredBytes),
  }]));
}
export class GlyphEditorModel {
  constructor(catalog, fonts, font = "b", page = 0, byte = 0x41) {
    this.catalog = Object.freeze(cloneCatalog(catalog));
    this.catalogByIdentity = new Map(this.catalog.map(
      (glyph) => [identity(glyph.page, glyph.byte), glyph]));
    this.saved = cloneFonts(fonts, new Set(this.catalogByIdentity.keys()));
    this.initial = cloneFontState(this.saved);
    this.drafts = new Map();
    this.select(font, page, byte);
  }
  select(font, page, byte) {
    const glyph = this.catalogByIdentity.get(identity(Number(page), Number(byte)));
    if (!this.saved[font] || !glyph) {
      throw new RangeError("glyph selection is outside the preview atlas");
    }
    this.font = font;
    this.page = glyph.page;
    this.byte = glyph.byte;
  }

  glyphFor(page = this.page, byte = this.byte) {
    return this.catalogByIdentity.get(identity(page, byte));
  }

  get glyph() { return this.glyphFor(); }
  get character() { return this.glyph.character; }
  get fontData() { return this.saved[this.font]; }
  get width() { return this.fontData.width; }
  get height() { return this.fontData.height; }

  patternFor(font, page, byte) {
    const fontData = this.saved[font];
    if (!fontData || !this.glyphFor(page, byte)) {
      throw new RangeError("glyph selection is outside the preview atlas");
    }
    const key = draftKey(font, page, byte);
    if (this.drafts.has(key)) return this.drafts.get(key);
    return fontData.patterns[byte] ?? blankPattern(fontData.width, fontData.height);
  }

  savedPatternFor(font, page, byte) {
    const fontData = this.saved[font];
    if (!fontData || !this.glyphFor(page, byte)) {
      throw new RangeError("glyph selection is outside the preview atlas");
    }
    return fontData.patterns[byte] ?? blankPattern(fontData.width, fontData.height);
  }

  initialPatternFor(font, page, byte) {
    const fontData = this.initial[font];
    if (!fontData || !this.glyphFor(page, byte)) {
      throw new RangeError("glyph selection is outside the preview atlas");
    }
    return fontData.patterns[byte] ?? blankPattern(fontData.width, fontData.height);
  }

  get pattern() { return this.patternFor(this.font, this.page, this.byte); }
  get savedPattern() { return this.savedPatternFor(this.font, this.page, this.byte); }
  get initialPattern() { return this.initialPatternFor(this.font, this.page, this.byte); }
  get authored() { return this.fontData.authoredBytes.has(this.byte); }
  get dirty() { return this.pattern !== this.savedPattern; }
  get needsSave() { return this.dirty || !this.authored; }
  get dirtyCount() { return this.drafts.size; }
  get authoredCount() { return this.fontData.authoredBytes.size; }

  authoredBytes(font = this.font) {
    return new Set(this.saved[font]?.authoredBytes || []);
  }

  dirtyBytes(font = this.font, page = this.page) {
    const prefix = `${font}:${page}:`;
    return new Set([...this.drafts.keys()]
      .filter((value) => value.startsWith(prefix))
      .map((value) => Number(value.slice(prefix.length))));
  }

  setPattern(pattern) {
    patternRows(pattern, this.width, this.height);
    const currentKey = draftKey(this.font, this.page, this.byte);
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

  clear() { this.setPattern(blankPattern(this.width, this.height)); }
  revert() { this.setPattern(this.savedPattern); }
  restoreInitial() { this.setPattern(this.initialPattern); }

  markGlyphSaved(font, page, byte, pattern) {
    const fontData = this.saved[font];
    if (!fontData || !this.glyphFor(page, byte)) {
      throw new RangeError("saved glyph is outside the preview atlas");
    }
    patternRows(pattern, fontData.width, fontData.height);
    const current = this.patternFor(font, page, byte);
    const key = draftKey(font, page, byte);
    fontData.patterns[byte] = pattern;
    fontData.authoredBytes.add(byte);
    if (current === pattern) this.drafts.delete(key);
    else this.drafts.set(key, current);
    return current === pattern;
  }

  markSaved(pattern = this.pattern) {
    return this.markGlyphSaved(this.font, this.page, this.byte, pattern);
  }
}
