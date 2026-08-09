// Exposes complete ASCII atlases plus sparse, byte-addressed PC437 extensions.
// An extended mask is exact only when compiler page, byte, and Unicode identity agree.
import { PC437_TEXT_GLYPHS } from "../../../charset/page-00-pc437.js";
import {
  compileAtlas,
  compileSparseByteAtlas,
  page437ByteKey,
  PRINTABLE_ASCII,
} from "./codec.js";
import { FONT_A_PATTERNS } from "./font-a.js";
import { FONT_A_PAGE_437_PATTERNS } from "./font-a-page-437.js";
import { FONT_B_PATTERNS } from "./font-b.js";
import { FONT_B_PAGE_437_PATTERNS } from "./font-b-page-437.js";

const PC437_CHARACTER_BY_BYTE = Object.freeze(Object.fromEntries(
  PC437_TEXT_GLYPHS.map(({ byte, character }) => [byte, character]),
));
const PC437_EXTENDED_BYTES = new Set(PC437_TEXT_GLYPHS
  .filter(({ byte }) => byte >= 0x80)
  .map(({ byte }) => byte));

export { PRINTABLE_ASCII };
export const FONT_A = compileAtlas(FONT_A_PATTERNS, 9);
export const FONT_B = compileAtlas(FONT_B_PATTERNS, 7);
export const FONT_ATLASES = Object.freeze({ a: FONT_A, b: FONT_B });
export const FONT_A_PAGE_437 = compileSparseByteAtlas(
  FONT_A_PAGE_437_PATTERNS, 9, PC437_EXTENDED_BYTES);
export const FONT_B_PAGE_437 = compileSparseByteAtlas(
  FONT_B_PAGE_437_PATTERNS, 7, PC437_EXTENDED_BYTES);
export const PAGE_437_ATLASES = Object.freeze({
  a: FONT_A_PAGE_437,
  b: FONT_B_PAGE_437,
});

function isPrintableAscii(character) {
  return typeof character === "string" && character.length === 1
    && character >= " " && character <= "~";
}

function fontKey(font) {
  const key = typeof font === "string" ? font.toLowerCase() : "";
  return Object.hasOwn(FONT_ATLASES, key) ? key : null;
}

export function createResidentGlyphLookup(page437Atlases) {
  const extensions = Object.freeze({
    a: page437Atlases?.a ?? Object.freeze({}),
    b: page437Atlases?.b ?? Object.freeze({}),
  });

  function has(character, address = {}) {
    if (isPrintableAscii(character)) return true;
    const key = fontKey(address.font);
    const { byte, page } = address;
    if (!key || page !== 0 || !PC437_EXTENDED_BYTES.has(byte)
      || PC437_CHARACTER_BY_BYTE[byte] !== character) return false;
    return Object.hasOwn(extensions[key], page437ByteKey(byte));
  }

  function glyph(font, character, address = {}) {
    const key = fontKey(font);
    if (!key) throw new RangeError("printer font must be A or B");
    if (isPrintableAscii(character)) return FONT_ATLASES[key][character];
    if (has(character, { ...address, font: key })) {
      return extensions[key][page437ByteKey(address.byte)];
    }
    return FONT_ATLASES[key]["?"];
  }

  return Object.freeze({ hasResidentGlyph: has, glyphFor: glyph });
}

const RESIDENT_GLYPHS = createResidentGlyphLookup(PAGE_437_ATLASES);

export function hasResidentGlyph(character, address) {
  return RESIDENT_GLYPHS.hasResidentGlyph(character, address);
}

export function glyphFor(font, character, address) {
  return RESIDENT_GLYPHS.glyphFor(font, character, address);
}
