// Builds a selected-glyph specimen followed by catalog-authorized comparison text.
// Matching drafts are substituted in memory; the study never persists character data.
export const MAXIMUM_COMPARISON_CHARACTERS = 32;

function characterIndex(catalog) {
  const entries = new Map();
  for (const glyph of catalog || []) {
    if ([...String(glyph?.character ?? "")].length !== 1
      || !Number.isInteger(glyph?.byte) || entries.has(glyph.character)) {
      throw new TypeError("comparison text requires a unique glyph catalog");
    }
    entries.set(glyph.character, glyph);
  }
  if (!entries.has("?")) {
    throw new TypeError("comparison text requires a question-mark glyph");
  }
  return entries;
}

export function normalizeComparisonText(value, catalog) {
  const allowed = characterIndex(catalog);
  return [...String(value ?? "")]
    .filter((character) => allowed.has(character))
    .slice(0, MAXIMUM_COMPARISON_CHARACTERS)
    .join("");
}

export function studyPatterns(value, catalog, patternForByte, selection) {
  const entries = characterIndex(catalog);
  const text = [...String(value ?? "")]
    .filter((character) => entries.has(character))
    .slice(0, MAXIMUM_COMPARISON_CHARACTERS)
    .join("");
  if (typeof patternForByte !== "function" || !selection?.pattern) {
    throw new TypeError("comparison text requires preview masks and a selection");
  }
  const fallback = entries.get("?");
  return {
    text,
    patterns: [
      selection.pattern,
      ...[...text].map((character) => {
        const glyph = entries.get(character) || fallback;
        return glyph.page === selection.page && glyph.byte === selection.byte
          ? selection.pattern : patternForByte(glyph.page, glyph.byte);
      }),
    ],
  };
}
