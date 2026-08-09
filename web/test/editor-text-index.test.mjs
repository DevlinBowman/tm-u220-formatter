import test from "node:test";
import assert from "node:assert/strict";
import { createTextIndex } from "../ui/editor/text-index.js";

function text(data) {
  return { nodeType: 3, nodeName: "#text", data, childNodes: [] };
}

function element(name, ...childNodes) {
  return { nodeType: 1, nodeName: name.toUpperCase(), childNodes };
}

function assertOffsetRoundTrips(index) {
  for (let offset = 0; offset <= index.text.length; offset += 1) {
    const point = index.pointAt(offset);
    assert.equal(index.offsetFromPoint(point.node, point.offset), offset);
  }
}

test("indexes UTF-16 text offsets without changing source", () => {
  const content = text("a\t😀é\nlast");
  const index = createTextIndex(element("pre", content));
  assert.equal(index.text, content.data);
  assertOffsetRoundTrips(index);
  assert.deepEqual(index.pointAt(Infinity), {
    node: content,
    offset: content.data.length,
  });
  assert.equal(index.offsetFromPoint(content, -20), 0);
  assert.equal(index.offsetFromPoint(content, 10_000), content.data.length);
});

test("serializes block lines, empty blocks, and a terminal filler break", () => {
  const root = element("pre",
    element("div", text("one")),
    element("div"),
    element("div", text("three")),
    element("div", element("br")));
  const index = createTextIndex(root);
  assert.equal(index.text, "one\n\nthree\n");
  assertOffsetRoundTrips(index);
});

test("distinguishes real breaks from the terminal contenteditable filler", () => {
  const empty = createTextIndex(element("pre", element("br")));
  const oneBreak = createTextIndex(
    element("pre", element("br"), element("br")));
  const typedLastLine = createTextIndex(
    element("pre", text("one"), element("br")));
  const trailingBreak = createTextIndex(
    element("pre", text("one"), element("br"), element("br")));
  assert.equal(empty.text, "");
  assert.equal(oneBreak.text, "\n");
  assert.equal(typedLastLine.text, "one");
  assert.equal(trailingBreak.text, "one\n");
  assertOffsetRoundTrips(oneBreak);
  assertOffsetRoundTrips(typedLastLine);
  assertOffsetRoundTrips(trailingBreak);
});

test("maps offsets across split inline text nodes", () => {
  const root = element("pre", text("@al"), element("span", text("ign")));
  const index = createTextIndex(root);
  assert.equal(index.text, "@align");
  assertOffsetRoundTrips(index);
});
