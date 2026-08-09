import test from "node:test";
import assert from "node:assert/strict";
import { DOT_RADII, latticeOffsets } from "../preview/classic-font/lattice.js";
import { classicMetrics } from "../preview/renderers/classic.js";

const geometry = { scale: 5, xUnit: 25.4 / 160 * 5 };
const normalSegment = { character_advance_half_dots: 10 };
const profile = {
  defaults: { font: "b" },
  fonts: {
    a: { character_width_micrometers: 1600, character_height_micrometers: 3100 },
    b: { character_width_micrometers: 1200, character_height_micrometers: 3100 },
  },
};

test("classic preview preserves the historical calibrated glyph metrics", () => {
  const normal = classicMetrics(normalSegment, geometry, profile, { font: "b" });
  assert.equal(normal.advance, 10 * geometry.xUnit);
  assert.equal(normal.bodyWidth, 6);
  assert.equal(normal.fontSize, 17.05);
  assert.equal(normal.yScale, 1);
  assert.deepEqual([normal.xRepeat, normal.yRepeat], [1, 1]);
  assert.equal(normal.expanded, false);
  assert.equal(normal.dotPitch, 1.45);
  const doubled = classicMetrics({ character_advance_half_dots: 20 },
    geometry, profile, {
    font: "b", double_width: true, double_height: true,
  });
  assert.equal(doubled.bodyWidth, 12);
  assert.equal(doubled.normalBodyWidth, 6);
  assert.deepEqual([doubled.xRepeat, doubled.yRepeat], [2, 2]);
  assert.equal(doubled.advance, normal.advance * 2);
  assert.equal(doubled.dotPitch, normal.dotPitch);
  assert.equal(doubled.glyphScaleX, normal.glyphScaleX * 2);
  assert.equal(doubled.yScale, normal.yScale * 2);
  assert.equal(doubled.expanded, true);
});

test("classic enlarged masks expose a fixed-pitch final-size lattice", () => {
  const normal = classicMetrics(normalSegment, geometry, profile, {
    font: "b",
  });
  const wideOffsets = latticeOffsets(normal.bodyWidth * 2, normal.dotPitch);
  const normalOffsets = latticeOffsets(normal.bodyWidth, normal.dotPitch);
  assert.equal(normalOffsets.length, 4);
  assert.equal(wideOffsets.length, 8);
  assert.equal(Math.abs(
    wideOffsets[1] - wideOffsets[0] - normal.dotPitch) < 1e-9, true);
  assert.equal(DOT_RADII.core, 0.5 / Math.SQRT2);
  assert.equal(DOT_RADII.bleed, 0.61 / Math.SQRT2);
  assert.equal(DOT_RADII.bleed * 2 < 1, true);
});

test("classic emphasis keeps the same physical lattice pitch when enlarged", () => {
  const normal = classicMetrics(normalSegment, geometry, profile, {
    font: "a", emphasis: true,
  });
  const doubled = classicMetrics({ character_advance_half_dots: 20 },
    geometry, profile, {
      font: "a", emphasis: true, double_width: true,
    });
  assert.equal(normal.dotPitch, 1.2);
  assert.equal(doubled.dotPitch, normal.dotPitch);
});
