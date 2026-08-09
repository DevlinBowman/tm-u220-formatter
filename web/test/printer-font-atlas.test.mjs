// Verifies resident font coverage, lattice bounds, observed anchors, and physical strike geometry.
import test from "node:test";
import assert from "node:assert/strict";
import {
  FONT_A,
  FONT_B,
  PRINTABLE_ASCII,
  glyphFor,
} from "../preview/printer-font/atlas.js";

function patternRows(pattern) {
  return pattern.split("/").map((row) => [...row].reduce(
    (mask, value) => (mask << 1) | (value === "#" ? 1 : 0), 0,
  ));
}

test("custom printer atlases cover every printable ASCII character", () => {
  assert.equal(PRINTABLE_ASCII.length, 95);
  assert.equal(PRINTABLE_ASCII[0], " ");
  assert.equal(PRINTABLE_ASCII.at(-1), "~");
  assert.equal(Object.keys(FONT_A).length, 95);
  assert.equal(Object.keys(FONT_B).length, 95);
  for (const character of PRINTABLE_ASCII) {
    assert.equal(Object.hasOwn(FONT_A, character), true);
    assert.equal(Object.hasOwn(FONT_B, character), true);
  }
});

test("resident masks stay inside their fixed nine-pin lattices", () => {
  for (const [font, width] of [["a", 9], ["b", 7]]) {
    for (const character of PRINTABLE_ASCII) {
      const glyph = glyphFor(font, character);
      assert.equal(glyph.width, width);
      assert.equal(glyph.height, 9);
      assert.equal(glyph.rows.length, 9);
      for (const row of glyph.rows) {
        assert.equal(Number.isInteger(row), true);
        assert.equal(row >= 0 && row <= (1 << width) - 1, true);
      }
      if (character !== " ") assert.equal(glyph.rows.some(Boolean), true);
    }
  }
  assert.deepEqual(glyphFor("A", " ").rows, Array(9).fill(0));
});

test("manually observed TM-U220 printouts anchor corrected resident details", () => {
  const expected = {
    a: {
      "0": "..#.#.#../#.......#/#.......#/#.......#/#.......#/#.......#/#.......#/..#.#.#../.........",
      "4": "......#../....#.#../..#...#../#.....#../#.#.#.#.#/......#../......#../......#../.........",
      "6": ".....#.../....#..../...#...../..#....../#.#.#.#../#.......#/#.......#/..#.#.#../.........",
      "7": "#.#.#.#.#/#.......#/.......#./......#../.....#.../....#..../...#...../...#...../.........",
      "9": "..#.#.#../#.......#/#.......#/..#.#.#.#/......#../.....#.../....#..../...#...../.........",
      A: "....#..../...#.#.../..#...#../.#.....#./.#.#.#.#./#.......#/#.......#/#.......#/.........",
      b: "#......../#......../#.#.#.#../#.......#/#.......#/#.......#/#.......#/#.#.#.#../.........",
      B: "#.#.#.#../.#......#/.#......#/.#.#.#.#./.#......#/.#......#/.#......#/#.#.#.#../.........",
      D: "#.#.#.#../.#......#/.#......#/.#......#/.#......#/.#......#/.#......#/#.#.#.#../.........",
      N: "#.......#/##......#/#.#.....#/#..#....#/#....#..#/#.....#.#/#......##/#.......#/.........",
    },
    b: {
      "0": ".#.#.#./#.....#/#.....#/#.....#/#.....#/#.....#/.#.#.#./......./.......",
      "4": "....#../...#.#./..#..#./.#...#./#.#.#.#/.....#./.....#./......./.......",
      "6": "....#../...#.../..#..../.#.#.#./#.....#/#.....#/.#.#.#./......./.......",
      "7": "#.#.#.#/#.....#/.....#./....#../...#.../..#..../..#..../......./.......",
      "9": ".#.#.#./#.....#/#.....#/.#.#.#./....#../...#.../..#..../......./.......",
      A: "...#.../..#.#../.#...#./.#.#.#./#.....#/#.....#/#.....#/......./.......",
      b: "#....../#....../#.#.#../#.....#/#.....#/#.....#/#.#.#../......./.......",
      a: "......./......./.#.#.#./......#/.#.#.#./#.....#/.#.#..#/......./.......",
      B: "#.#.#../.#....#/.#....#/.#.#.#./.#....#/.#....#/#.#.#../......./.......",
      D: "#.#.#../.#....#/.#....#/.#....#/.#....#/.#....#/#.#.#../......./.......",
      N: "#.....#/##....#/#.#...#/#..#..#/#...#.#/#....##/#.....#/......./.......",
    },
  };

  for (const [font, patterns] of Object.entries(expected)) {
    for (const [character, pattern] of Object.entries(patterns)) {
      assert.deepEqual(glyphFor(font, character).rows, patternRows(pattern));
    }
  }
});

test("the most significant lattice bit represents the left edge", () => {
  assert.equal(glyphFor("b", "A").rows[4], 0b1000001);
  assert.equal(glyphFor("a", "A").rows[5], 0b100000001);
  assert.equal(glyphFor("b", "\u2603"), glyphFor("b", "?"));
  assert.throws(() => glyphFor("c", "A"), /font must be A or B/);
});

test("outer matrix columns remain glyph data rather than implicit spacing", () => {
  for (const [font, width] of [["a", 9], ["b", 7]]) {
    const row = glyphFor(font, "H").rows[0];
    assert.notEqual(row & (1 << (width - 1)), 0);
    assert.notEqual(row & 1, 0);
  }
});

test("ninth pin row remains glyph data rather than implicit leading", () => {
  for (const font of ["a", "b"]) {
    assert.equal(glyphFor(font, "H").rows[8], 0);
    assert.notEqual(glyphFor(font, "g").rows[8], 0);
    assert.notEqual(glyphFor(font, "_").rows[8], 0);
  }
});
