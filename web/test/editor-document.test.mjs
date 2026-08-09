import test from "node:test";
import assert from "node:assert/strict";
import { replaceEditorSource } from "../ui/editor/document.js";

class FakeSurface {
  constructor() {
    this.element = { scrollTop: 180, scrollLeft: 40 };
    this.source = "old";
  }

  replaceSource(source) {
    this.source = String(source ?? "");
  }

  setSelection(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

test("replacing a document starts its cursor and viewport at the beginning", () => {
  const surface = new FakeSurface();
  replaceEditorSource(surface, "first\nsecond");
  assert.deepEqual({
    value: surface.source,
    selectionStart: surface.selectionStart,
    selectionEnd: surface.selectionEnd,
    scrollTop: surface.element.scrollTop,
    scrollLeft: surface.element.scrollLeft,
  }, {
    value: "first\nsecond",
    selectionStart: 0,
    selectionEnd: 0,
    scrollTop: 0,
    scrollLeft: 0,
  });
});
