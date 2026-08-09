import test from "node:test";
import assert from "node:assert/strict";
import { createEditorGutter } from "../ui/editor/gutter.js";

function editorAt(scrollTop) {
  const listeners = new Map();
  return {
    scrollTop,
    addEventListener(event, listener) { listeners.set(event, listener); },
    removeEventListener(event) { listeners.delete(event); },
    emit(event) { listeners.get(event)?.(); },
  };
}

test("gutter translation follows the editor without a second scroll range", () => {
  const editor = editorAt(3403);
  const viewport = { scrollTop: 3425 };
  const lineNumbers = { parentElement: viewport, style: {} };
  const gutter = createEditorGutter(editor, lineNumbers);

  gutter.sync();
  assert.equal(viewport.scrollTop, 0);
  assert.equal(lineNumbers.style.transform, "translateY(-3403px)");

  editor.scrollTop = 1670.5;
  editor.emit("scroll");
  assert.equal(lineNumbers.style.transform, "translateY(-1670.5px)");
});
