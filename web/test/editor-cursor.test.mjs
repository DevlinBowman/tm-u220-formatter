import test from "node:test";
import assert from "node:assert/strict";
import {
  cursorLocation,
  documentSize,
} from "../ui/editor/cursor.js";

function selection(start, end = start, direction = "none") {
  return { start, end, direction };
}

test("cursor location follows the active end of a selection", () => {
  assert.deepEqual(cursorLocation("ab\ncd", selection(1, 3, "forward")), {
    line: 2, column: 1,
  });
  assert.deepEqual(cursorLocation("ab\ncd", selection(1, 4, "backward")), {
    line: 1, column: 2,
  });
});

test("cursor columns and document counts use visible characters", () => {
  const value = "A😀e\u0301B";
  assert.deepEqual(cursorLocation(value, selection(5)), { line: 1, column: 4 });
  assert.deepEqual(documentSize(value), { lines: 1, characters: 4 });
  assert.deepEqual(documentSize("one\n"), { lines: 2, characters: 4 });
  assert.deepEqual(documentSize(""), { lines: 1, characters: 0 });
});
