// Verifies sparse PC437 mask sources remain ordered and support conflict-safe insertion or replacement.
// Store fixtures prove extended saves never rewrite the complete ASCII atlases or sibling font page.
import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  blankPattern,
  parsePagePatternSource,
  replacePagePatternSource,
} from "../../dev/glyph_editor/server/page-pattern-source.mjs";
import { GlyphPatternStore } from "../../dev/glyph_editor/server/pattern-store.mjs";

const resident = resolve(import.meta.dirname,
  "../preview/printer-font/resident");
const extendedBytes = new Set(Array.from(
  { length: 0x100 - 0x80 }, (_, index) => 0x80 + index));

function markedPattern(width, column = 0) {
  const rows = blankPattern(width).split("/");
  rows[0] = `${rows[0].slice(0, column)}#${rows[0].slice(column + 1)}`;
  return rows.join("/");
}

function emptyExtensionSource(font = "b") {
  const name = `FONT_${font.toUpperCase()}_PAGE_437_PATTERNS`;
  return `// Isolates sparse page persistence from canonical authored masks.\n`
    + `const ENTRIES = [\n];\n\n`
    + `export const ${name} = Object.freeze(Object.fromEntries(ENTRIES));\n`;
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "u220-glyph-page-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const paths = Object.fromEntries(["a", "b"].map((font) => [font, {
    ascii: join(directory, `font-${font}.js`),
    extended: join(directory, `font-${font}-page-437.js`),
  }]));
  await Promise.all(Object.entries(paths).flatMap(([font, fontPaths]) => [
    copyFile(join(resident, `font-${font}.js`), fontPaths.ascii),
    writeFile(fontPaths.extended, emptyExtensionSource(font), "utf8"),
  ]));
  return { paths, store: new GlyphPatternStore(paths) };
}

test("sparse source inserts and replaces masks in ascending byte order", async () => {
  const source = emptyExtensionSource();
  const blank = blankPattern(7);
  const pattern80 = markedPattern(7, 0);
  const pattern82 = markedPattern(7, 2);
  const patternFF = markedPattern(7, 6);
  const withFF = replacePagePatternSource(source, {
    byte: 0xFF, pattern: patternFF, previousPattern: blank,
    width: 7, allowedBytes: extendedBytes,
  });
  const with80 = replacePagePatternSource(withFF, {
    byte: 0x80, pattern: pattern80, previousPattern: blank,
    width: 7, allowedBytes: extendedBytes,
  });
  const inserted = replacePagePatternSource(with80, {
    byte: 0x82, pattern: pattern82, previousPattern: blank,
    width: 7, allowedBytes: extendedBytes,
  });
  const parsed = parsePagePatternSource(inserted, {
    width: 7, allowedBytes: extendedBytes,
  });

  assert.deepEqual(parsed.authoredBytes, [0x80, 0x82, 0xFF]);
  assert.equal(parsed.patterns[0x80], pattern80);
  assert.equal(parsed.patterns[0xFF], patternFF);
  assert.ok(inserted.indexOf('["80"') < inserted.indexOf('["82"'));
  assert.ok(inserted.indexOf('["82"') < inserted.indexOf('["FF"'));

  const replacement = markedPattern(7, 3);
  const replaced = replacePagePatternSource(inserted, {
    byte: 0x82, pattern: replacement, previousPattern: pattern82,
    width: 7, allowedBytes: extendedBytes,
  });
  const changedLines = inserted.split("\n").filter(
    (line, index) => line !== replaced.split("\n")[index]);
  assert.equal(parsePagePatternSource(replaced, {
    width: 7, allowedBytes: extendedBytes,
  }).patterns[0x82], replacement);
  assert.equal(replaced.split("\n").length, inserted.split("\n").length);
  assert.equal(changedLines.length, 1);
});

test("sparse source rejects stale, malformed, and unordered entries", async () => {
  const source = emptyExtensionSource();
  const blank = blankPattern(7);
  const pattern = markedPattern(7);
  const authored = replacePagePatternSource(source, {
    byte: 0x82, pattern, previousPattern: blank,
    width: 7, allowedBytes: extendedBytes,
  });

  assert.throws(() => replacePagePatternSource(authored, {
    byte: 0x82, pattern, previousPattern: blank,
    width: 7, allowedBytes: extendedBytes,
  }), /changed on disk/);
  assert.throws(() => replacePagePatternSource(source, {
    byte: 0x82, pattern, previousPattern: markedPattern(7, 1),
    width: 7, allowedBytes: extendedBytes,
  }), /changed on disk/);

  const entry = (key) => `  ["${key}", ${JSON.stringify(pattern)}],`;
  const pageSource = (entries) => `const ENTRIES = [\n${entries.join("\n")}\n];\n`;
  assert.throws(() => parsePagePatternSource(pageSource([
    entry("82"), entry("80"),
  ]), { width: 7, allowedBytes: extendedBytes }), /ascending byte order/);
  assert.throws(() => parsePagePatternSource(pageSource([entry("8a")]), {
    width: 7, allowedBytes: extendedBytes,
  }), /uppercase two-digit/);
  assert.throws(() => parsePagePatternSource(pageSource([entry("7F")]), {
    width: 7, allowedBytes: extendedBytes,
  }), /not selectable/);
  assert.throws(() => parsePagePatternSource(pageSource([
    '  ["82", "......."],',
  ]), { width: 7, allowedBytes: extendedBytes }), /7 × 9/);
});

test("extended save authors only its selected font page", async (t) => {
  const { paths, store } = await fixture(t);
  const blank = blankPattern(7);
  const pattern = markedPattern(7, 2);
  const before = {
    aAscii: await readFile(paths.a.ascii, "utf8"),
    aExtended: await readFile(paths.a.extended, "utf8"),
    bAscii: await readFile(paths.b.ascii, "utf8"),
    bExtended: await readFile(paths.b.extended, "utf8"),
  };

  const saved = await store.save({
    font: "b", page: 0, byte: 0x82,
    pattern, previousPattern: blank,
  });

  assert.deepEqual(saved, {
    saved: true, font: "b", page: 0, byte: 0x82, pattern,
  });
  assert.equal(await readFile(paths.a.ascii, "utf8"), before.aAscii);
  assert.equal(await readFile(paths.a.extended, "utf8"), before.aExtended);
  assert.equal(await readFile(paths.b.ascii, "utf8"), before.bAscii);
  assert.notEqual(await readFile(paths.b.extended, "utf8"), before.bExtended);
  assert.match(await readFile(paths.b.extended, "utf8"), /\["82",/);

  const atlas = await store.read();
  assert.equal(atlas.fonts.b.patterns[0x82], pattern);
  assert.equal(atlas.fonts.a.patterns[0x82], undefined);
  assert.equal(atlas.fonts.b.authoredBytes.at(-1), 0x82);

  const replacement = markedPattern(7, 3);
  const beforeReplacement = await readFile(paths.b.extended, "utf8");
  await store.save({
    font: "b", page: 0, byte: 0x82,
    pattern: replacement, previousPattern: pattern,
  });
  const afterReplacement = await readFile(paths.b.extended, "utf8");
  assert.equal(afterReplacement.split("\n").length,
    beforeReplacement.split("\n").length);
  assert.equal((await store.read()).fonts.b.patterns[0x82], replacement);
  await assert.rejects(store.save({
    font: "b", page: 0, byte: 0x82,
    pattern, previousPattern: blank,
  }), /changed on disk/);
});
