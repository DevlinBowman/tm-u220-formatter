// Verifies comparison samples remain canonical, bounded, and draft-aware.
// The sample is presentation state only and never enters glyph persistence.
import test from "node:test";
import assert from "node:assert/strict";
import { FONT_B_PATTERNS } from "../preview/printer-font/resident/font-b.js";
import {
  MAXIMUM_COMPARISON_CHARACTERS,
  normalizeComparisonText,
  studyPatterns,
} from "../../dev/glyph_editor/public/study-text.js";

test("study leads with the selected glyph and updates its comparison matches", () => {
  const draft = "......./......./......./......./......./......./......./......./.......";
  const result = studyPatterns("Street", FONT_B_PATTERNS,
    { character: "t", pattern: draft });
  assert.equal(result.text, "Street");
  assert.equal(result.patterns.length, 7);
  assert.equal(result.patterns[0], draft);
  assert.equal(result.patterns[2], draft);
  assert.equal(result.patterns[6], draft);
  assert.equal(result.patterns[1], FONT_B_PATTERNS.S);
  assert.equal(result.patterns[3], FONT_B_PATTERNS.r);
});

test("comparison text retains spaces and rejects non-atlas input", () => {
  assert.equal(normalizeComparisonText("A B\né☃"), "A B");
  assert.equal(normalizeComparisonText("x".repeat(50)).length,
    MAXIMUM_COMPARISON_CHARACTERS);
  const result = studyPatterns("A B", FONT_B_PATTERNS,
    { character: "A", pattern: FONT_B_PATTERNS.A });
  assert.equal(result.patterns[2], FONT_B_PATTERNS[" "]);
});

test("selected glyph remains the only specimen when comparison text is empty", () => {
  const result = studyPatterns("", FONT_B_PATTERNS,
    { character: "x", pattern: FONT_B_PATTERNS.x });
  assert.equal(result.text, "");
  assert.deepEqual(result.patterns, [FONT_B_PATTERNS.x]);
});
