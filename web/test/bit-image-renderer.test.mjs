// Verifies browser bit-image preview decodes the canonical mask and preserves printer geometry.
// Canvas assertions cover glyph dispatch plus existing ribbon and strike conventions.
import test from "node:test";
import assert from "node:assert/strict";
import { createSegmentNode } from "../preview/glyphs.js";
import { bitImagePlan } from "../preview/printhead/bit-image.js";

function imageSegment(overrides = {}) {
  return {
    kind: "bit_image",
    mask_encoding: "hex-msb-rows",
    mask_data: "A0404000",
    mask_width_dots: 10,
    mask_height_dots: 2,
    column_step_half_dots: 2,
    width_half_dots: 20,
    character_cell_height_vertical_units: 4,
    style: { color: "red" },
    ...overrides,
  };
}

test("bit-image masks decode MSB-first rows into physical dot centers", () => {
  assert.deepEqual(bitImagePlan(imageSegment()), {
    dots: [
      { xHalfDots: 1, yVerticalUnits: 1 },
      { xHalfDots: 5, yVerticalUnits: 1 },
      { xHalfDots: 19, yVerticalUnits: 1 },
      { xHalfDots: 3, yVerticalUnits: 3 },
    ],
    widthHalfDots: 20,
    heightVerticalUnits: 4,
  });
  assert.deepEqual(bitImagePlan(imageSegment({
    column_step_half_dots: 1, width_half_dots: 10,
  })).dots[0], { xHalfDots: 0.5, yVerticalUnits: 1 });
});

test("bit-image masks fail closed on non-canonical geometry and data", () => {
  assert.throws(() => bitImagePlan(imageSegment({ mask_encoding: "base64" })),
    /unsupported bit-image mask encoding/);
  assert.throws(() => bitImagePlan(imageSegment({ mask_data: "A040" })),
    /does not match the bit-image dimensions/);
  assert.throws(() => bitImagePlan(imageSegment({ width_half_dots: 10 })),
    /width_half_dots does not match/);
  assert.throws(() => bitImagePlan(imageSegment({
    character_cell_height_vertical_units: 8,
  })), /character_cell_height_vertical_units does not match/);
});

function browserRuntime() {
  const arcs = [];
  const context = {
    arc(x, y, radius) { arcs.push({ x, y, radius, color: this.fillStyle }); },
    beginPath() {}, clearRect() {}, fill() {}, setTransform() {},
  };
  const element = (tagName) => ({
    tagName,
    children: [],
    className: "",
    classList: { add(name) { this.names = [...(this.names || []), name]; } },
    dataset: {},
    style: { setProperty() {} },
    append(child) { this.children.push(child); },
    setAttribute() {},
    getContext: () => context,
  });
  return { arcs, document: { documentElement: {}, createElement: element } };
}

test("glyph dispatch paints every bit-image dot with printer ribbon impacts", (t) => {
  const previous = {
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
    window: globalThis.window,
  };
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  const runtime = browserRuntime();
  globalThis.document = runtime.document;
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "#a7332e" });
  const segment = imageSegment();
  const geometry = { scale: 4, xUnit: 0.5, yUnit: 0.75 };
  const node = createSegmentNode(segment, {
    glyph_height_vertical_units: 4,
  }, geometry, {}, 0, "classic");

  assert.equal(node.children.length, 1);
  assert.match(node.children[0].className, /receipt-bit-image-canvas/);
  assert.equal(runtime.arcs.length, 12);
  assert.equal(runtime.arcs.every((arc) => arc.color === "#a7332e"), true);
  assert.equal(node.style.width, "10px");
  assert.equal(node.style.height, "3px");
});
