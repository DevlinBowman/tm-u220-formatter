// Verifies sparse PC437 masks compile by byte and require matching compiler-owned identity.
// Unauthored bytes must continue to use the representative fallback layer.
import test from "node:test";
import assert from "node:assert/strict";
import { PC437_TEXT_GLYPHS } from "../charset/page-00-pc437.js";
import { previewGlyphLayers } from "../preview/printer-font/glyph-layers.js";
import {
  createResidentGlyphLookup,
  glyphFor,
} from "../preview/printer-font/resident/atlas.js";
import {
  compileSparseByteAtlas,
  page437ByteKey,
} from "../preview/printer-font/resident/codec.js";
import {
  FONT_A_PAGE_437_PATTERNS,
} from "../preview/printer-font/resident/font-a-page-437.js";
import {
  FONT_B_PAGE_437_PATTERNS,
} from "../preview/printer-font/resident/font-b-page-437.js";

const SAMPLE_PATTERN = [
  ".#.....", "..#....", "...#...", ".......", ".......",
  ".......", ".......", ".......", ".......",
].join("/");
const extendedBytes = new Set(PC437_TEXT_GLYPHS
  .filter(({ byte }) => byte >= 0x80)
  .map(({ byte }) => byte));

function fixtureLookup() {
  const extended = compileSparseByteAtlas({ "82": SAMPLE_PATTERN }, 7,
    new Set([0x82]));
  return { extended, lookup: createResidentGlyphLookup({
    a: Object.freeze({}), b: extended,
  }) };
}

test("canonical page-437 sources remain valid sparse byte subsets", () => {
  for (const [patterns, width] of [
    [FONT_A_PAGE_437_PATTERNS, 9],
    [FONT_B_PAGE_437_PATTERNS, 7],
  ]) {
    const compiled = compileSparseByteAtlas(patterns, width, extendedBytes);
    assert.deepEqual(Object.keys(compiled), Object.keys(patterns));
    assert.equal(Object.isFrozen(patterns), true);
  }
});

test("Font B anchors the authored B0 and B2 through B5 masks exactly", () => {
  assert.deepEqual(FONT_B_PAGE_437_PATTERNS, {
    B0: "..#...#/#...#../..#...#/#...#../..#...#/#...#../..#...#/#...#../..#...#",
    B2: "#######/#######/#######/#######/#######/#######/#######/#######/#######",
    B3: "..#..../..#..../..#..../..#..../..#..../..#..../..#..../..#..../..#....",
    B4: "..#..../..#..../..#..../..#..../#.#..../..#..../..#..../..#..../..#....",
    B5: "..#..../..#..../..#..../###..../###..../..#..../..#..../..#..../..#....",
  });
  assert.equal(Object.hasOwn(FONT_B_PAGE_437_PATTERNS, "B1"), false);
});

test("an unauthored byte retains the exact question-mark fallback", () => {
  const empty = createResidentGlyphLookup({
    a: Object.freeze({}), b: Object.freeze({}),
  });
  const address = { font: "b", page: 0, byte: 0x82 };
  assert.equal(empty.hasResidentGlyph("é", address), false);
  assert.equal(empty.glyphFor("b", "é", address), glyphFor("b", "?"));
});

test("sparse page-437 masks use strict hexadecimal byte keys", () => {
  const { extended } = fixtureLookup();
  assert.equal(page437ByteKey(0x82), "82");
  assert.equal(extended["82"].width, 7);
  assert.equal(extended["82"].rows[0], 0b0100000);
  assert.throws(() => page437ByteKey(0x7f), /0x80 through 0xFF/);
  assert.throws(() => compileSparseByteAtlas({ "8a": SAMPLE_PATTERN }, 7),
    /invalid.*byte key/);
  assert.throws(() => compileSparseByteAtlas({ "82": SAMPLE_PATTERN }, 7,
    new Set([0x81])), /unexpected.*0x82/);
  assert.throws(() => compileSparseByteAtlas({ "7F": SAMPLE_PATTERN }, 7),
    /unexpected.*0x7F/);
});

test("an authored mask requires matching font, page, byte, and character", () => {
  const { extended, lookup } = fixtureLookup();
  const address = { font: "b", page: 0, byte: 0x82 };
  assert.equal(lookup.hasResidentGlyph("é", address), true);
  assert.equal(lookup.glyphFor("b", "é", address), extended["82"]);
  assert.equal(lookup.hasResidentGlyph("é", { ...address, page: 2 }), false);
  assert.equal(lookup.hasResidentGlyph("é", { ...address, byte: 0x81 }), false);
  assert.equal(lookup.hasResidentGlyph("Ç", address), false);
  assert.equal(lookup.hasResidentGlyph("é", { ...address, font: "a" }), false);
  assert.equal(lookup.glyphFor("b", "é", { ...address, page: 2 }),
    glyphFor("b", "?"));
});

test("glyph layers keep other pages representative when page zero is exact", () => {
  const { lookup } = fixtureLookup();
  const pageZero = {
    text: "AéB", code_page: 0, resident_bytes: [0x41, 0x82, 0x42],
    style: { font: "b" },
  };
  assert.deepEqual(previewGlyphLayers(pageZero, lookup.hasResidentGlyph), {
    strikeText: "AéB", fallbackText: "   ", hasFallback: false,
  });
  assert.deepEqual(previewGlyphLayers(
    { ...pageZero, code_page: 2 }, lookup.hasResidentGlyph), {
    strikeText: "A B", fallbackText: " é ", hasFallback: true,
  });
  assert.deepEqual(previewGlyphLayers(
    { ...pageZero, resident_bytes: [0x41, 0x81, 0x42] },
    lookup.hasResidentGlyph), {
    strikeText: "A B", fallbackText: " é ", hasFallback: true,
  });
});
