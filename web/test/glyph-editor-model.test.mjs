// Verifies page-byte drafts, synthesized masks, and save completion remain isolated.
// Test fixtures model sparse authored data without importing runtime strike assets.
import test from "node:test";
import assert from "node:assert/strict";
import { PC437_TEXT_GLYPHS } from "../charset/page-00-pc437.js";
import {
  blankPattern, GlyphEditorModel, patternRows, rowsPattern,
} from "../../dev/glyph_editor/public/model.js";

function mask(width, cells = [[0, 0]]) {
  const rows = Array.from({ length: 9 }, () => Array(width).fill("."));
  for (const [row, column] of cells) rows[row][column] = "#";
  return rows.map((row) => row.join("")).join("/");
}

function fonts() {
  return {
    a: {
      width: 9, height: 9,
      patterns: { [0x3f]: mask(9), [0x41]: mask(9, [[0, 4]]) },
      authoredBytes: [0x3f, 0x41],
    },
    b: {
      width: 7, height: 9,
      patterns: {
        [0x3f]: mask(7), [0x41]: mask(7, [[0, 3]]),
        [0x42]: mask(7, [[0, 0], [0, 1]]),
      },
      authoredBytes: [0x3f, 0x41, 0x42],
    },
  };
}

function model(font = "b", byte = 0x41) {
  return new GlyphEditorModel(PC437_TEXT_GLYPHS, fonts(), font, 0, byte);
}

test("glyph patterns round-trip through fixed boolean lattices", () => {
  const pattern = fonts().b.patterns[0x41];
  const rows = patternRows(pattern, 7);
  assert.equal(rows.length, 9);
  assert.equal(rows.every((row) => row.length === 7), true);
  assert.equal(rowsPattern(rows, 7), pattern);
  assert.throws(() => patternRows(".......", 7), /7 × 9/);
  assert.throws(() => rowsPattern([[true]], 7), /7 × 9/);
});

test("unauthored PC437 bytes open as saveable blank masks", () => {
  const editor = model("b", 0x82);
  assert.equal(editor.character, "é");
  assert.equal(editor.pattern, blankPattern(7));
  assert.equal(editor.savedPattern, blankPattern(7));
  assert.equal(editor.authored, false);
  assert.equal(editor.dirty, false);
  assert.equal(editor.needsSave, true);

  assert.equal(editor.markSaved(blankPattern(7)), true);
  assert.equal(editor.authored, true);
  assert.equal(editor.needsSave, false);
  assert.equal(editor.authoredBytes().has(0x82), true);
});

test("drafts survive byte and font selection while staying page-addressed", () => {
  const editor = model();
  editor.setCell(0, 0, true);
  const editedA = editor.pattern;
  editor.select("b", 0, 0x42);
  editor.clear();
  assert.equal(editor.dirtyCount, 2);
  assert.deepEqual(editor.dirtyBytes(), new Set([0x41, 0x42]));

  editor.revert();
  assert.equal(editor.dirtyCount, 1);
  editor.select("b", 0, 0x41);
  assert.equal(editor.pattern, editedA);
  editor.markSaved();
  assert.equal(editor.savedPattern, editedA);
  assert.equal(editor.dirtyCount, 0);
});

test("Font A and Font B selections enforce dimensions for every catalog byte", () => {
  const editor = model("a", 0xff);
  assert.equal(editor.character, "\u00a0");
  assert.equal(editor.width, 9);
  assert.equal(editor.height, 9);
  editor.select("b", 0, 0xff);
  assert.equal(editor.width, 7);
  assert.throws(() => editor.select("c", 0, 0x41), /outside the preview atlas/);
  assert.throws(() => editor.select("b", 1, 0x41), /outside the preview atlas/);
  assert.throws(() => editor.select("b", 0, 0x7f), /outside the preview atlas/);
  assert.throws(() => editor.setCell(9, 0, true), /outside the editable lattice/);
});

test("a completed save preserves newer dots on the same glyph", () => {
  const editor = model();
  editor.setCell(0, 0, true);
  const submitted = editor.pattern;
  editor.setCell(1, 1, true);
  const newer = editor.pattern;

  assert.equal(editor.markGlyphSaved("b", 0, 0x41, submitted), false);
  assert.equal(editor.savedPattern, submitted);
  assert.equal(editor.pattern, newer);
  assert.equal(editor.dirty, true);
});

test("a revert during save becomes a draft against the persisted snapshot", () => {
  const editor = model();
  const original = editor.pattern;
  editor.setCell(0, 0, true);
  const submitted = editor.pattern;
  editor.revert();
  assert.equal(editor.pattern, original);
  assert.equal(editor.dirty, false);

  assert.equal(editor.markGlyphSaved("b", 0, 0x41, submitted), false);
  assert.equal(editor.savedPattern, submitted);
  assert.equal(editor.pattern, original);
  assert.equal(editor.dirty, true);
});
