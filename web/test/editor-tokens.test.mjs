// Verifies source highlighting spans without coupling editor paint to compilation.
// Pipe-owning directives are covered explicitly so table fields stay lexical data.
import test from "node:test";
import assert from "node:assert/strict";
import { syntaxSpans } from "../ui/editor/tokens.js";

function values(source, spans, kind) {
  return spans.filter((span) => span.kind === kind)
    .map((span) => source.slice(span.start, span.end));
}

test("returns exact directive and argument offsets", () => {
  const source = "  @align\t  center  ";
  assert.deepEqual(syntaxSpans(source), [
    { kind: "directive", start: 2, end: 8 },
    { kind: "argument", start: 11, end: 19 },
  ]);
});

test("indexes directive pipelines across lines and UTF-16 arguments", () => {
  const source = "@text 😀\n  @font a |   @emphasis on|@line";
  const spans = syntaxSpans(source);
  assert.deepEqual(values(source, spans, "directive"), [
    "@text", "@font", "@emphasis", "@line",
  ]);
  assert.deepEqual(values(source, spans, "argument"), ["😀", "a ", "on"]);
  assert.deepEqual(spans.find((span) => source.slice(span.start, span.end) === "@font"), {
    kind: "directive", start: 11, end: 16,
  });
});

test("only odd backslash runs escape a directive separator", () => {
  const odd = `@text A ${"\\".repeat(3)}| @font b`;
  const even = `@text A ${"\\".repeat(2)}| @font b`;
  assert.deepEqual(values(odd, syntaxSpans(odd), "directive"), ["@text"]);
  assert.deepEqual(values(even, syntaxSpans(even), "directive"), ["@text", "@font"]);
});

test("key-value, ordinary, and plain-mode text do not gain extra colors", () => {
  const keyValue = "@kv label | @font b";
  assert.deepEqual(values(keyValue, syntaxSpans(keyValue), "directive"), ["@kv"]);
  assert.deepEqual(values(keyValue, syntaxSpans(keyValue), "argument"), [
    "label | @font b",
  ]);
  assert.deepEqual(syntaxSpans("text @align center"), []);
  assert.deepEqual(syntaxSpans("@align center", true), []);
  assert.deepEqual(syntaxSpans(null), []);
});

test("key-value block markers use their complete underscore names", () => {
  const source = "  @kv_start\nLabel | value\n\t@kv_end  ";
  const spans = syntaxSpans(source);
  assert.deepEqual(values(source, spans, "directive"), ["@kv_start", "@kv_end"]);
  assert.deepEqual(values(source, spans, "argument"), []);
});

test("key-value block markers retain exact offsets in CRLF source", () => {
  const source = "@kv_start\r\nLabel | value\r\n  @kv_end\r\n";
  const spans = syntaxSpans(source);
  assert.deepEqual(values(source, spans, "directive"), ["@kv_start", "@kv_end"]);
  assert.deepEqual(values(source, spans, "argument"), []);
  assert.deepEqual(spans[1], {
    kind: "directive", start: source.indexOf("@kv_end"),
    end: source.indexOf("@kv_end") + "@kv_end".length,
  });
});

test("table directives own every pipe on their source line", () => {
  const cases = [
    ["@table R,9,4LR | @font b", "R,9,4LR | @font b"],
    ["@head Board | Spcs | @right Ea", "Board | Spcs | @right Ea"],
    ["@row 2x4x16 | RW | | | $29.99", "2x4x16 | RW | | | $29.99"],
    ["@end-table | @font b", "| @font b"],
  ];

  for (const [source, argument] of cases) {
    const spans = syntaxSpans(source);
    assert.deepEqual(values(source, spans, "directive"), [source.match(/@[a-z-]+/)[0]]);
    assert.deepEqual(values(source, spans, "argument"), [argument]);
  }
});
