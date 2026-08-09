// Proves the checkout-only store validates and atomically changes one fixed preview-atlas entry.
// Temporary source copies keep tests from mutating canonical glyph definitions.
import test from "node:test";
import assert from "node:assert/strict";
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
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

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "u220-glyph-editor-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const paths = { a: join(directory, "font-a.js"), b: join(directory, "font-b.js") };
  await Promise.all(Object.entries(paths).map(([font, path]) =>
    copyFile(join(resident, `font-${font}.js`), path)));
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

test("saving a glyph changes exactly one line in its selected font", async (t) => {
  const { paths, store } = await fixture(t);
  const before = await store.read();
  const beforeA = await readFile(paths.a, "utf8");
  const beforeB = await readFile(paths.b, "utf8");
  const previousPattern = before.fonts.b.patterns.A;
  const rows = previousPattern.split("/");
  rows[0] = `${rows[0][0] === "#" ? "." : "#"}${rows[0].slice(1)}`;
  const pattern = rows.join("/");

  const saved = await store.save({
    font: "b", character: "A", pattern, previousPattern,
  });
  const afterA = await readFile(paths.a, "utf8");
  const afterB = await readFile(paths.b, "utf8");
  const changedLines = beforeB.split("\n").filter(
    (line, index) => line !== afterB.split("\n")[index]);

  assert.deepEqual(saved, { saved: true, font: "b", character: "A", pattern });
  assert.equal(afterA, beforeA);
  assert.equal(changedLines.length, 1);
  assert.equal((await store.read()).fonts.b.patterns.A, pattern);
});

test("stale, malformed, and out-of-scope saves fail without a write", async (t) => {
  const { paths, store } = await fixture(t);
  const atlas = await store.read();
  const before = await readFile(paths.b, "utf8");
  const pattern = atlas.fonts.b.patterns.A;

  await assert.rejects(store.save({
    font: "b", character: "A", pattern, previousPattern: "......./.......",
  }), /changed on disk/);
  await assert.rejects(store.save({
    font: "b", character: "☃", pattern, previousPattern: pattern,
  }), /printable ASCII/);
  await assert.rejects(store.save({
    font: "c", character: "A", pattern, previousPattern: pattern,
  }), /font must be A or B/);
  await assert.rejects(store.save({
    font: "b", character: "A", pattern: ".......", previousPattern: pattern,
  }), /7 × 9/);
  assert.equal(await readFile(paths.b, "utf8"), before);
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
