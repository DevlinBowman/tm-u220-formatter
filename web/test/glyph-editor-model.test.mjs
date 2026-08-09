// Verifies the development editor's drafts preserve canonical atlas dimensions and isolation.
// These tests never write a preview source or enter the receipt rendering path.
import test from "node:test";
import assert from "node:assert/strict";
import { FONT_A_PATTERNS } from "../preview/printer-font/resident/font-a.js";
import { FONT_B_PATTERNS } from "../preview/printer-font/resident/font-b.js";
import {
  GlyphEditorModel,
  patternRows,
  rowsPattern,
} from "../../dev/glyph_editor/public/model.js";

function fonts() {
  return {
    a: { width: 9, height: 9, patterns: FONT_A_PATTERNS },
    b: { width: 7, height: 9, patterns: FONT_B_PATTERNS },
  };
}

test("glyph patterns round-trip through fixed boolean lattices", () => {
  const pattern = FONT_B_PATTERNS.A;
  const rows = patternRows(pattern, 7);
  assert.equal(rows.length, 9);
  assert.equal(rows.every((row) => row.length === 7), true);
  assert.equal(rowsPattern(rows, 7), pattern);
  assert.throws(() => patternRows(".......", 7), /7 × 9/);
  assert.throws(() => rowsPattern([[true]], 7), /7 × 9/);
});

test("editing one dot creates one preview-only draft", () => {
  const canonical = FONT_B_PATTERNS.A;
  const model = new GlyphEditorModel(fonts());
  const rows = patternRows(canonical, 7);
  const original = rows[0][0];

  model.setCell(0, 0, !original);
  const edited = patternRows(model.pattern, 7);
  assert.equal(edited[0][0], !original);
  assert.equal(edited.flat().filter((value, index) =>
    value !== rows.flat()[index]).length, 1);
  assert.equal(model.dirty, true);
  assert.equal(model.dirtyCount, 1);
  assert.equal(FONT_B_PATTERNS.A, canonical);
  assert.equal(FONT_A_PATTERNS.A, fonts().a.patterns.A);
});

test("drafts survive selection while revert and save stay glyph-scoped", () => {
  const model = new GlyphEditorModel(fonts());
  model.setCell(0, 0, true);
  const editedA = model.pattern;
  model.select("b", "B");
  model.clear();
  assert.equal(model.dirtyCount, 2);
  assert.deepEqual(model.dirtyCharacters("b"), new Set(["A", "B"]));

  model.revert();
  assert.equal(model.dirtyCount, 1);
  model.select("b", "A");
  assert.equal(model.pattern, editedA);
  model.markSaved();
  assert.equal(model.savedPattern, editedA);
  assert.equal(model.dirtyCount, 0);
});

test("Font A and Font B selections enforce their own dimensions", () => {
  const model = new GlyphEditorModel(fonts(), "a", "?");
  assert.equal(model.width, 9);
  assert.equal(model.height, 9);
  model.select("b", "?");
  assert.equal(model.width, 7);
  assert.throws(() => model.select("c", "?"), /outside the preview atlas/);
  assert.throws(() => model.select("b", "☃"), /outside the preview atlas/);
  assert.throws(() => model.setCell(9, 0, true), /outside the editable lattice/);
});

test("adjacent columns remain full-impact half-dot positions", () => {
  const model = new GlyphEditorModel(fonts(), "b", "N");
  assert.match(model.pattern, /##/);
  const rows = patternRows(model.pattern, 7);
  assert.equal(rows[1][0], true);
  assert.equal(rows[1][1], true);
  assert.equal(rowsPattern(rows, 7), FONT_B_PATTERNS.N);
});
