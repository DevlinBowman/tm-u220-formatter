// Verifies the PC437 selector preserves canonical byte identity and semantic grouping.
// A small DOM fake keeps authored and draft presentation tests browser-independent.
import test from "node:test";
import assert from "node:assert/strict";
import { PC437_TEXT_GLYPHS } from "../charset/page-00-pc437.js";
import { createGlyphCatalog } from "../../dev/glyph_editor/public/catalog.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = {};
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.textContent = "";
  }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  contains(target) {
    return this === target || this.children.some((child) => child.contains?.(target));
  }
  closest(selector) { return selector === "[data-byte]" && this.dataset.byte ? this : null; }
}

function descendants(root) {
  return root.children.flatMap((child) => [child, ...descendants(child)]);
}

test("catalog renders all 223 glyphs in named groups with explicit spaces", (t) => {
  const previousDocument = globalThis.document;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  globalThis.document = { createElement: (tag) => new FakeElement(tag) };
  const root = new FakeElement("div");
  let selection;
  const catalog = createGlyphCatalog(root, PC437_TEXT_GLYPHS,
    (glyph) => { selection = glyph; });
  catalog.render({
    selected: { page: 0, byte: 0xff }, dirtyBytes: new Set([0x82]),
    authoredBytes: new Set([0x20, 0x41]),
  });

  const all = descendants(root);
  const buttons = all.filter((node) => node.dataset.byte);
  assert.equal(root.children.length, 7);
  assert.equal(buttons.length, 223);
  assert.equal(buttons.find((node) => node.dataset.byte === "32").textContent, "SP");
  const nbsp = buttons.find((node) => node.dataset.byte === "255");
  assert.equal(nbsp.textContent, "NBSP");
  assert.equal(nbsp.attributes["aria-selected"], "true");
  assert.match(nbsp.title, /PC437 0xFF.*U\+00A0.*Unauthored/);
  const extended = buttons.find((node) => node.dataset.byte === "130");
  assert.equal(extended.dataset.dirty, "true");
  assert.equal(extended.dataset.authored, "false");
  assert.match(all.find((node) => node.textContent === "Lines & blocks").textContent,
    /Lines & blocks/);

  root.listeners.click({ target: extended });
  assert.deepEqual(selection, { page: 0, byte: 0x82, character: "é" });
});
