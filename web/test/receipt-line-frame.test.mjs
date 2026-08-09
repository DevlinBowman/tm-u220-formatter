// Verifies that line-frame layout preserves leading across orientation and glyph-size changes.
import test from "node:test";
import assert from "node:assert/strict";
import { lineFrameLayout } from "../preview/layout/line-frame.js";

const geometry = { yUnit: 0.5 };

test("upside-down content rotates inside the glyph cell, not its leading", () => {
  const layout = lineFrameLayout({
    line_advance_vertical_units: 24,
    glyph_height_vertical_units: 18,
    segments: [{ style: { upside_down: true } }],
  }, geometry);
  assert.deepEqual(layout, {
    advanceHeight: 12,
    contentHeight: 9,
    upsideDown: true,
  });
  assert.equal(layout.advanceHeight - layout.contentHeight, 3);
});

test("tall glyphs retain the same physical leading gap", () => {
  const layout = lineFrameLayout({
    line_advance_vertical_units: 42,
    glyph_height_vertical_units: 36,
    segments: [{ style: { upside_down: false } }],
  }, geometry);
  assert.equal(layout.advanceHeight, 21);
  assert.equal(layout.contentHeight, 18);
  assert.equal(layout.advanceHeight - layout.contentHeight, 3);
  assert.equal(layout.upsideDown, false);
});
