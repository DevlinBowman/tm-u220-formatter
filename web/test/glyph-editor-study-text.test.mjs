// Verifies comparison samples use the canonical PC437 text catalog and current draft.
// The sample remains bounded presentation state and never enters glyph persistence.
import test from "node:test";
import assert from "node:assert/strict";
import { PC437_TEXT_GLYPHS } from "../charset/page-00-pc437.js";
import {
  MAXIMUM_COMPARISON_CHARACTERS, normalizeComparisonText, studyPatterns,
} from "../../dev/glyph_editor/public/study-text.js";

const pattern = (character) => `${character}`.repeat(9).split("").join("/");
const glyph = (character) => PC437_TEXT_GLYPHS.find(
  (entry) => entry.character === character);
const masks = new Map([
  [glyph("?").byte, pattern("?")], [glyph("S").byte, pattern("S")],
  [glyph("r").byte, pattern("r")], [glyph("t").byte, pattern("t")],
  [glyph("é").byte, pattern("e")], [glyph(" ").byte, pattern(".")],
]);
const resolvePattern = (_page, byte) => masks.get(byte) || pattern(".");

test("study leads with the selected glyph and updates matching cells", () => {
  const draft = pattern("#");
  const selected = glyph("t");
  const result = studyPatterns("Street", PC437_TEXT_GLYPHS, resolvePattern,
    { ...selected, pattern: draft });
  assert.equal(result.text, "Street");
  assert.equal(result.patterns.length, 7);
  assert.equal(result.patterns[0], draft);
  assert.equal(result.patterns[2], draft);
  assert.equal(result.patterns[6], draft);
  assert.equal(result.patterns[1], masks.get(glyph("S").byte));
  assert.equal(result.patterns[3], masks.get(glyph("r").byte));
});

test("comparison text accepts PC437 extensions and rejects other Unicode", () => {
  assert.equal(normalizeComparisonText(`A é \n☃`, PC437_TEXT_GLYPHS), `A é `);
  assert.equal(normalizeComparisonText("x".repeat(50), PC437_TEXT_GLYPHS).length,
    MAXIMUM_COMPARISON_CHARACTERS);
  const selected = glyph("é");
  const draft = pattern("#");
  const result = studyPatterns("é ", PC437_TEXT_GLYPHS, resolvePattern,
    { ...selected, pattern: draft });
  assert.equal(result.patterns[1], draft);
  assert.equal(result.patterns[2], masks.get(glyph(" ").byte));
});

test("selected glyph remains the only specimen for empty comparison text", () => {
  const selected = glyph("x");
  const draft = pattern("#");
  const result = studyPatterns("", PC437_TEXT_GLYPHS, resolvePattern,
    { ...selected, pattern: draft });
  assert.equal(result.text, "");
  assert.deepEqual(result.patterns, [draft]);
});
