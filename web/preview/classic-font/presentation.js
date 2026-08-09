// Supplies visible browser representatives for legal resident glyphs that HTML intentionally hides.
// This presentation mapping never changes canonical preview text or compiled page bytes.
const GLYPH_ALIASES = Object.freeze({
  "\u00ad": "-",
});

export function browserGlyph(character) {
  return GLYPH_ALIASES[character] || character;
}
