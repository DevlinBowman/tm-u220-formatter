// Partitions compiler-authorized resident text between exact strikes and browser-backed glyphs.
// Non-ASCII cells without a page plus one encoded resident byte fail closed to a modeled question mark.
import { hasResidentGlyph } from "./atlas.js";

const SUPPORTED_CODE_PAGES = new Set([0, 2, 3, 4, 5, 16, 17, 18, 19]);

function hasResidentProof(segment, characters) {
  const bytes = segment?.resident_bytes;
  return SUPPORTED_CODE_PAGES.has(segment?.code_page)
    && Array.isArray(bytes)
    && bytes.length === characters.length
    && bytes.every((value) => Number.isInteger(value)
      && value >= 0x20 && value <= 0xff);
}

export function previewGlyphLayers(segment) {
  const characters = [...String(segment?.text ?? "")];
  const authorized = hasResidentProof(segment, characters);
  const strike = [];
  const fallback = [];
  let hasFallback = false;

  for (const character of characters) {
    const hasExactMask = hasResidentGlyph(character);
    const useFallback = !hasExactMask && authorized;
    strike.push(hasExactMask ? character : useFallback ? " " : "?");
    fallback.push(useFallback ? character : " ");
    hasFallback ||= useFallback;
  }

  return {
    strikeText: strike.join(""),
    fallbackText: fallback.join(""),
    hasFallback,
  };
}
