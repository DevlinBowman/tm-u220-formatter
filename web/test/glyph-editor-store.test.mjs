// Proves the checkout-only store exposes canonical byte identities and safely updates base masks.
// Temporary source copies keep tests from mutating canonical glyph definitions.
import test from "node:test";
import assert from "node:assert/strict";
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GlyphPatternStore } from "../../dev/glyph_editor/server/pattern-store.mjs";
import {
  parsePatternSource,
  replacePatternSource,
} from "../../dev/glyph_editor/server/pattern-source.mjs";
import {
  parseGlyphServerConfig,
} from "../../dev/glyph_editor/server/config.mjs";

const resident = resolve(import.meta.dirname,
  "../preview/printer-font/resident");

function emptyExtensionSource(font) {
  const name = `FONT_${font.toUpperCase()}_PAGE_437_PATTERNS`;
  return `// Isolates sparse page persistence from canonical authored masks.\n`
    + `const ENTRIES = [\n];\n\n`
    + `export const ${name} = Object.freeze(Object.fromEntries(ENTRIES));\n`;
}

async function fixture(t, { canonicalExtensions = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "u220-glyph-editor-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const paths = Object.fromEntries(["a", "b"].map((font) => [font, {
    ascii: join(directory, `font-${font}.js`),
    extended: join(directory, `font-${font}-page-437.js`),
  }]));
  await Promise.all(Object.entries(paths).flatMap(([font, fontPaths]) => [
    copyFile(join(resident, `font-${font}.js`), fontPaths.ascii),
    canonicalExtensions
      ? copyFile(join(resident, `font-${font}-page-437.js`), fontPaths.extended)
      : writeFile(fontPaths.extended, emptyExtensionSource(font), "utf8"),
  ]));
  return { paths, store: new GlyphPatternStore(paths) };
}

test("pattern source parser retains complete canonical order", async () => {
  const source = await readFile(join(resident, "font-a.js"), "utf8");
  const parsed = parsePatternSource(source, 9);
  assert.equal(parsed.entries.length, 95);
  assert.equal(parsed.entries[0].character, " ");
  assert.equal(parsed.entries.at(-1).character, "~");
  assert.equal(parsed.patterns.A.split("/").length, 9);
});

test("store reads canonical PC437 descriptors with authored byte metadata", async (t) => {
  const { paths, store } = await fixture(t, { canonicalExtensions: true });
  const atlas = await store.read();
  const asciiBytes = Array.from({ length: 95 }, (_, index) => 0x20 + index);

  assert.equal(atlas.catalog.length, 223);
  assert.deepEqual(atlas.catalog[0], { page: 0, byte: 0x20, character: " " });
  assert.deepEqual(atlas.catalog.at(-1), {
    page: 0, byte: 0xFF, character: "\u00A0",
  });
  assert.equal(atlas.catalog.some(({ byte }) => byte === 0x7F), false);
  assert.equal(atlas.fonts.a.patterns[0x41],
    parsePatternSource(await readFile(paths.a.ascii, "utf8"), 9).patterns.A);
  for (const font of [atlas.fonts.a, atlas.fonts.b]) {
    assert.deepEqual(font.authoredBytes.slice(0, asciiBytes.length), asciiBytes);
    const extended = font.authoredBytes.slice(asciiBytes.length);
    assert.ok(extended.every((byte) => byte >= 0x80 && byte <= 0xFF));
    assert.deepEqual(extended, [...extended].sort((left, right) => left - right));
    assert.deepEqual(Object.keys(font.patterns).map(Number), font.authoredBytes);
    assert.ok(extended.every((byte) => typeof font.patterns[byte] === "string"));
  }
});

test("saving a glyph changes exactly one line in its selected font", async (t) => {
  const { paths, store } = await fixture(t);
  const before = await store.read();
  const beforeA = await readFile(paths.a.ascii, "utf8");
  const beforeB = await readFile(paths.b.ascii, "utf8");
  const previousPattern = before.fonts.b.patterns[0x41];
  const rows = previousPattern.split("/");
  rows[0] = `${rows[0][0] === "#" ? "." : "#"}${rows[0].slice(1)}`;
  const pattern = rows.join("/");

  const saved = await store.save({
    font: "b", page: 0, byte: 0x41, pattern, previousPattern,
  });
  const afterA = await readFile(paths.a.ascii, "utf8");
  const afterB = await readFile(paths.b.ascii, "utf8");
  const changedLines = beforeB.split("\n").filter(
    (line, index) => line !== afterB.split("\n")[index]);

  assert.deepEqual(saved, {
    saved: true, font: "b", page: 0, byte: 0x41, pattern,
  });
  assert.equal(afterA, beforeA);
  assert.equal(changedLines.length, 1);
  assert.equal((await store.read()).fonts.b.patterns[0x41], pattern);
});

test("stale, malformed, and out-of-scope saves fail without a write", async (t) => {
  const { paths, store } = await fixture(t);
  const atlas = await store.read();
  const beforeAscii = await readFile(paths.b.ascii, "utf8");
  const beforeExtended = await readFile(paths.b.extended, "utf8");
  const pattern = atlas.fonts.b.patterns[0x41];
  const blank = Array.from({ length: 9 }, () => ".......").join("/");

  await assert.rejects(store.save({
    font: "b", page: 0, byte: 0x41,
    pattern, previousPattern: blank,
  }), /changed on disk/);
  await assert.rejects(store.save({
    font: "b", page: 0, byte: 0x41, pattern,
  }), /previousPattern is required/);
  await assert.rejects(store.save({
    font: "b", page: 0, byte: 0x7F, pattern, previousPattern: pattern,
  }), /selectable PC437/);
  await assert.rejects(store.save({
    font: "b", page: 2, byte: 0x41, pattern, previousPattern: pattern,
  }), /page must be 0/);
  await assert.rejects(store.save({
    font: "c", page: 0, byte: 0x41, pattern, previousPattern: pattern,
  }), /font must be A or B/);
  await assert.rejects(store.save({
    font: "b", page: 0, byte: 0x41,
    pattern: ".......", previousPattern: pattern,
  }), /7 × 9/);
  assert.equal(await readFile(paths.b.ascii, "utf8"), beforeAscii);
  assert.equal(await readFile(paths.b.extended, "utf8"), beforeExtended);
});

test("replacement rejects incomplete atlas sources and preserves formatting", async () => {
  assert.throws(() => parsePatternSource("const ENTRIES = [];\n", 7),
    /cover printable ASCII/);
  const source = await readFile(join(resident, "font-b.js"), "utf8");
  const current = parsePatternSource(source, 7).patterns["?"];
  const replaced = replacePatternSource(source, {
    character: "?", pattern: current, previousPattern: current, width: 7,
  });
  assert.equal(replaced, source);
});

test("developer command keeps a fixed loopback while accepting one receipt", async () => {
  const root = resolve(import.meta.dirname, "../..");
  const defaults = await parseGlyphServerConfig([], root);
  assert.equal(defaults.host, "127.0.0.1");
  assert.equal(defaults.port, 0);
  assert.equal(defaults.open, true);
  assert.equal(defaults.plain, false);
  assert.equal(defaults.target, resolve(root, "examples/plain_receipt.u220"));
  assert.equal(defaults.profile, resolve(root, "config/printers/local.u220p"));

  const explicit = await parseGlyphServerConfig([
    "--no-open", "--port", "8123", "--text", defaults.target,
  ], root);
  assert.equal(explicit.port, 8123);
  assert.equal(explicit.open, false);
  assert.equal(explicit.plain, true);
  assert.equal(explicit.target, defaults.target);
  await assert.rejects(parseGlyphServerConfig(
    [defaults.target, defaults.target], root), /at most one receipt/);
  await assert.rejects(parseGlyphServerConfig(
    ["--port", "70000"], root), /0 through 65535/);
});
