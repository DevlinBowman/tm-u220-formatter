// Exposes verified printable-ASCII strike atlases and exact-mask detection.
// Characters outside them retain the established question-mark fallback.
import { compileAtlas, PRINTABLE_ASCII } from "./codec.js";
import { FONT_A_PATTERNS } from "./font-a.js";
import { FONT_B_PATTERNS } from "./font-b.js";

export { PRINTABLE_ASCII };
export const FONT_A = compileAtlas(FONT_A_PATTERNS, 9);
export const FONT_B = compileAtlas(FONT_B_PATTERNS, 7);
export const FONT_ATLASES = Object.freeze({ a: FONT_A, b: FONT_B });

export function hasResidentGlyph(character) {
  return typeof character === "string" && character.length === 1
    && character >= " " && character <= "~";
}

export function glyphFor(font, character) {
  const key = typeof font === "string" ? font.toLowerCase() : "";
  const atlas = FONT_ATLASES[key];
  if (!atlas) throw new RangeError("printer font must be A or B");
  if (!hasResidentGlyph(character)) return atlas["?"];
  return atlas[character];
}
