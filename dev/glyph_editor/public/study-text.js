// Builds a selected-glyph specimen followed by user-entered canonical preview text.
// Matching drafts are substituted in-memory; the study is never persisted with a mask.
export const MAXIMUM_COMPARISON_CHARACTERS = 32;

function isPrintableAscii(character) {
  return character >= " " && character <= "~";
}

export function normalizeComparisonText(value) {
  return [...String(value || "")]
    .filter(isPrintableAscii)
    .slice(0, MAXIMUM_COMPARISON_CHARACTERS)
    .join("");
}

export function studyPatterns(value, patterns, selection) {
  const text = normalizeComparisonText(value);
  if (!patterns || !patterns["?"] || !selection?.pattern) {
    throw new TypeError("comparison text requires a preview atlas and selection");
  }
  return {
    text,
    patterns: [
      selection.pattern,
      ...[...text].map((character) => character === selection.character
        ? selection.pattern : patterns[character] || patterns["?"]),
    ],
  };
}
