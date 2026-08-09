import test from "node:test";
import assert from "node:assert/strict";
import {
  diagnosticErrorLines,
  sourceLines,
} from "../ui/editor/lines.js";

test("source lines include an empty editor line and trailing lines", () => {
  assert.deepEqual(sourceLines(""), [""]);
  assert.deepEqual(sourceLines("one\n"), ["one", ""]);
  assert.deepEqual(sourceLines("one\n\nthree"), ["one", "", "three"]);
});

test("compiler diagnostics map ranges through the source offset", () => {
  const lines = diagnosticErrorLines([
    { severity: "error", span: { start_line: 2 } },
    { span: { start_line: 4, end_line: 6 } },
    { severity: "warning", span: { start_line: 3 } },
    { severity: "error", span: { start_line: 1 } },
    { severity: "error", span: {} },
  ], 1, 4);
  assert.deepEqual([...lines], [1, 3, 4]);
});
