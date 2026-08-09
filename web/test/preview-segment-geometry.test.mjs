import test from "node:test";
import assert from "node:assert/strict";
import { segmentBox } from "../preview/glyphs.js";

test("preview renderers share compiler-derived segment geometry", () => {
  const geometry = { xUnit: 0.5, yUnit: 0.25 };
  const segment = {
    x_half_dots: 12,
    width_half_dots: 34,
    character_cell_height_vertical_units: 36,
  };
  const line = { glyph_height_vertical_units: 44 };
  assert.deepEqual(segmentBox(segment, line, geometry), {
    left: 6,
    top: 2,
    width: 17,
    height: 9,
  });
});
