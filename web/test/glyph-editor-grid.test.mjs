// Verifies the editor's baseline and matrix-bottom guides remain presentation-only.
// A tiny DOM fake keeps the lattice test independent from a browser runtime.
import test from "node:test";
import assert from "node:assert/strict";
import { fontAuthoringGuide } from
  "../../dev/glyph_editor/public/font-guides.js";
import { createDotGrid } from "../../dev/glyph_editor/public/grid.js";

test("both fonts share an authoring baseline while retaining matrix alignment", () => {
  assert.deepEqual(fontAuthoringGuide("a", 9), {
    authoringBaselineAfterRow: 7,
    alignmentEdgeAfterRow: 9,
  });
  assert.deepEqual(fontAuthoringGuide("b", 9), {
    authoringBaselineAfterRow: 7,
    alignmentEdgeAfterRow: 9,
  });
});

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = {};
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.style = {
      values: {},
      setProperty: (name, value) => { this.style.values[name] = value; },
    };
  }

  addEventListener(name, listener) { this.listeners[name] = listener; }
  contains(node) { return this.children.includes(node); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

function cells(root) {
  return root.children.filter((child) => child.dataset.row !== undefined);
}

test("matrix guide follows row nine without creating or editing a cell", (t) => {
  const previousDocument = globalThis.document;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    elementFromPoint: () => null,
  };
  const root = new FakeElement("div");
  let editCount = 0;
  const grid = createDotGrid(root, () => { editCount += 1; });
  const fontB = Array.from({ length: 9 }, () => Array(7).fill(false));
  fontB[8][3] = true;
  grid.render(fontB, fontAuthoringGuide("b", 9));

  assert.equal(cells(root).length, 63);
  assert.equal(cells(root).filter(
    (cell) => cell.dataset.alignmentEdge === "true").length, 7);
  assert.equal(cells(root).filter(
    (cell) => cell.dataset.alignmentEdge === "true")
    .every((cell) => Number(cell.dataset.row) === 8), true);
  assert.equal(cells(root).filter(
    (cell) => cell.dataset.authoringBaseline === "true").length, 7);
  assert.equal(cells(root).filter(
    (cell) => cell.dataset.authoringBaseline === "true")
    .every((cell) => Number(cell.dataset.row) === 6), true);
  assert.equal(cells(root).filter(
    (cell) => cell.dataset.active === "true").length, 1);
  assert.match(cells(root).at(-1).attributes["aria-label"],
    /matrix alignment edge follows this row/);
  assert.equal(root.style.values["--glyph-columns"], 7);
  assert.equal(editCount, 0);

  const fontA = Array.from({ length: 9 }, () => Array(9).fill(false));
  grid.render(fontA, fontAuthoringGuide("a", 9));
  assert.equal(cells(root).length, 81);
  assert.equal(cells(root).filter(
    (cell) => cell.dataset.alignmentEdge === "true").length, 9);
  assert.equal(cells(root).filter(
    (cell) => cell.dataset.authoringBaseline === "true").length, 9);
  assert.equal(cells(root).filter(
    (cell) => cell.dataset.authoringBaseline === "true")
    .every((cell) => Number(cell.dataset.row) === 6), true);
  assert.equal(editCount, 0);
  assert.throws(() => fontAuthoringGuide("c", 9),
    /supported glyph matrix/);
});
