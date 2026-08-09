// Verifies the generated browser descriptor preserves the canonical page-0 text repertoire.
// Its byte identities are shared by runtime exact-mask lookup and checkout-only glyph tooling.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PC437_TEXT_GLYPHS } from "../charset/page-00-pc437.js";

const byByte = new Map(PC437_TEXT_GLYPHS.map(
  (descriptor) => [descriptor.byte, descriptor.character]));

test("page-0 descriptor covers text bytes without printer controls", () => {
  const expectedBytes = [
    ...Array.from({ length: 0x7f - 0x20 }, (_, index) => 0x20 + index),
    ...Array.from({ length: 0x100 - 0x80 }, (_, index) => 0x80 + index),
  ];
  assert.equal(PC437_TEXT_GLYPHS.length, 223);
  assert.deepEqual(PC437_TEXT_GLYPHS.map(({ byte }) => byte), expectedBytes);
  assert.equal(byByte.has(0x1f), false);
  assert.equal(byByte.has(0x7f), false);
  assert.equal(Object.isFrozen(PC437_TEXT_GLYPHS), true);
  assert.equal(PC437_TEXT_GLYPHS.every((descriptor) =>
    descriptor.page === 0
      && [...descriptor.character].length === 1
      && Object.isFrozen(descriptor)), true);
});

test("page-0 descriptor preserves representative CP437 distinctions", () => {
  for (let byte = 0x20; byte <= 0x7e; byte += 1) {
    assert.equal(byByte.get(byte), String.fromCharCode(byte));
  }
  assert.equal(byByte.get(0x80), "Ç");
  assert.equal(byByte.get(0x82), "é");
  assert.equal(byByte.get(0x9e), "₧");
  assert.equal(byByte.get(0xdb), "█");
  assert.equal(byByte.get(0xe6), "µ");
  assert.equal(byByte.get(0xf9), "∙");
  assert.equal(byByte.get(0xfa), "·");
  assert.equal(byByte.get(0xff), "\u00a0");
});

test("browser and Lua page-0 descriptors stay generated in lockstep", async () => {
  const path = new URL(
    "../../src/tm_u220/charset/pages/page_00_pc437.lua", import.meta.url);
  const source = await readFile(path, "utf8");
  const canonical = [...source.matchAll(
    /\[0x([0-9A-F]{2})\] = ("(?:\\.|[^"\\])*")/g,
  )].map((match) => ({
    page: 0,
    byte: Number.parseInt(match[1], 16),
    character: JSON.parse(match[2].replace(
      /\\u\{([0-9A-F]+)\}/g,
      (_, codepoint) => `\\u${codepoint.padStart(4, "0")}`)),
  }));
  assert.deepEqual(PC437_TEXT_GLYPHS, canonical);
});
