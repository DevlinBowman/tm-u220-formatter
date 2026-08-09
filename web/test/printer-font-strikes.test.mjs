// Verifies resident masks become deterministic pin strikes across printer style modes.
// Byte-addressed extensions retain compiler page and resident-byte identity during lookup.
import test from "node:test";
import assert from "node:assert/strict";
import { glyphFor } from "../preview/printer-font/atlas.js";
import {
  planSegmentStrikes,
  strikePasses,
} from "../preview/printer-font/strike-plan.js";

function bitCount(value) {
  let count = 0;
  for (let bits = value; bits; bits >>= 1) count += bits & 1;
  return count;
}

function segment(style = {}, text = "A") {
  const doubled = style.double_width ? 2 : 1;
  return {
    text,
    style: { font: "b", underline: "off", ...style },
    width_half_dots: text.length * 10 * doubled,
    character_advance_half_dots: 10 * doubled,
    character_cell_height_vertical_units: style.double_height ? 36 : 18,
  };
}

test("strike plan paints the selected resident matrix without browser fonts", () => {
  const plan = planSegmentStrikes(segment());
  const expected = glyphFor("b", "A").rows.reduce(
    (total, row) => total + bitCount(row), 0);
  assert.equal(plan.dots.length, expected);
  assert.equal(plan.passes.length, 1);
  assert.equal(Math.min(...plan.dots.map((dot) => dot.xHalfDots)) >= 0.5, true);
  assert.equal(Math.max(...plan.dots.map((dot) => dot.yVerticalUnits)) <= 17, true);
});

function pointSet(plan) {
  return new Set(plan.dots.map((dot) => `${dot.xHalfDots}:${dot.yVerticalUnits}`));
}

function expectedCopies(dot, width, height) {
  const x = (dot.xHalfDots - 0.5) * width + 0.5;
  const y = (dot.yVerticalUnits - 1) * height + 1;
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, column) =>
      `${x + column * 2}:${y + row * 2}`))
    .flat();
}

test("dimension modes expand every modeled strike as 2x1, 1x2, or 2x2", () => {
  const normal = planSegmentStrikes(segment());
  for (const [style, width, height] of [
    [{ double_width: true }, 2, 1],
    [{ double_height: true }, 1, 2],
    [{ double_width: true, double_height: true }, 2, 2],
  ]) {
    const expanded = planSegmentStrikes(segment(style));
    const points = pointSet(expanded);
    assert.equal(expanded.dots.length, normal.dots.length * width * height);
    for (const dot of normal.dots) {
      for (const point of expectedCopies(dot, width, height)) {
        assert.equal(points.has(point), true, `missing ${point}`);
      }
    }
  }
});

test("emphasis and double strike add ink passes without changing geometry", () => {
  assert.equal(strikePasses({}).length, 1);
  assert.equal(strikePasses({ emphasis: true }).length, 2);
  assert.equal(strikePasses({ double_strike: true }).length, 2);
  assert.equal(strikePasses({ emphasis: true, double_strike: true }).length, 4);
  const styled = planSegmentStrikes(segment({
    emphasis: true,
    double_strike: true,
    underline: "double",
  }));
  assert.deepEqual(styled.underlineRows, [17]);
});

test("native strikes use horizontal half-dot and vertical motion-unit coordinates", () => {
  const fontB = planSegmentStrikes(segment({ font: "b" }, "["));
  const firstRow = fontB.dots.filter((dot) => dot.yVerticalUnits === 1)
    .map((dot) => dot.xHalfDots);
  assert.deepEqual(firstRow, [1.5, 3.5, 5.5]);
  assert.equal(fontB.dots.every((dot) => dot.xHalfDots % 1 === 0.5), true);
  assert.equal(fontB.dots.every((dot) => dot.yVerticalUnits % 2 === 1), true);
});

test("adjacent resident columns are full strikes one half-dot apart", () => {
  const fontB = planSegmentStrikes(segment({ font: "b" }, "N"));
  const secondRow = fontB.dots.filter((dot) => dot.yVerticalUnits === 3)
    .map((dot) => dot.xHalfDots);
  assert.deepEqual(secondRow, [0.5, 1.5, 6.5]);
  assert.equal(secondRow[1] - secondRow[0], 1);
  assert.equal(fontB.passes[0].strength, 1);
});

test("expanded strike copies use one native dot pitch on both axes", () => {
  const wide = planSegmentStrikes(segment({ double_width: true }, "!"));
  const tall = planSegmentStrikes(segment({ double_height: true }, "!"));
  const widePair = wide.dots.filter((dot) => dot.yVerticalUnits === 1)
    .map((dot) => dot.xHalfDots);
  const tallPair = tall.dots.filter((dot) => dot.xHalfDots === 3.5)
    .map((dot) => dot.yVerticalUnits).slice(0, 2);
  assert.deepEqual(widePair, [6.5, 8.5]);
  assert.deepEqual(tallPair, [1, 3]);
});

test("character origins retain the compiler-provided whole-cell advance", () => {
  const one = planSegmentStrikes(segment({}, "A"));
  const two = planSegmentStrikes(segment({}, "AA"));
  const firstCount = one.dots.length;
  for (let index = 0; index < firstCount; index += 1) {
    assert.equal(two.dots[index + firstCount].xHalfDots
      - two.dots[index].xHalfDots, 10);
  }
});

test("strike lookup receives the aligned compiler page and resident byte", () => {
  const addresses = [];
  const source = {
    ...segment({}, "é"), code_page: 0, resident_bytes: [0x82],
  };
  const plan = planSegmentStrikes(source, (font, character, address) => {
    addresses.push({ font, character, ...address });
    return Object.freeze({
      width: 7,
      height: 9,
      rows: Object.freeze([0b1000000, 0, 0, 0, 0, 0, 0, 0, 0]),
    });
  });
  assert.deepEqual(addresses, [
    { font: "b", character: "é", page: 0, byte: 0x82 },
  ]);
  assert.equal(plan.dots.length, 1);
  assert.equal(plan.dots[0].xHalfDots, 0.5);
});
