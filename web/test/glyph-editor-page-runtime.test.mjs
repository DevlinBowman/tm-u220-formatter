// Crosses the checkout save boundary into the shipped sparse-atlas runtime.
// The exact mask must retain its canonical page, byte, character, and strike geometry.
import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  blankPattern,
} from "../../dev/glyph_editor/server/page-pattern-source.mjs";
import {
  GlyphPatternStore,
} from "../../dev/glyph_editor/server/pattern-store.mjs";
import {
  createResidentGlyphLookup,
} from "../preview/printer-font/resident/atlas.js";
import {
  compileSparseByteAtlas,
} from "../preview/printer-font/resident/codec.js";
import {
  planSegmentStrikes,
} from "../preview/printer-font/strike-plan.js";

const resident = resolve(import.meta.dirname,
  "../preview/printer-font/resident");

function markedPattern() {
  const rows = blankPattern(7).split("/");
  rows[0] = "..#....";
  return rows.join("/");
}

function emptySource() {
  return "// Temporary sparse Font B source for cross-boundary verification.\n"
    + "const ENTRIES = [\n];\n\n"
    + "export const FONT_B_PAGE_437_PATTERNS = "
    + "Object.freeze(Object.fromEntries(ENTRIES));\n";
}

test("a saved page mask compiles into exact aligned strikes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "u220-page-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const extended = join(directory, "font-b-page-437.js");
  await writeFile(extended, emptySource(), "utf8");
  const store = new GlyphPatternStore({
    a: { ascii: join(resident, "font-a.js"), extended },
    b: { ascii: join(resident, "font-b.js"), extended },
  });
  const pattern = markedPattern();
  await store.save({
    font: "b", page: 0, byte: 0x82,
    pattern, previousPattern: blankPattern(7),
  });

  const source = await readFile(extended, "utf8");
  assert.match(source, /\["82",/);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const patternModule = await import(moduleUrl);
  const pageAtlas = compileSparseByteAtlas(
    patternModule.FONT_B_PAGE_437_PATTERNS, 7, new Set([0x82]));
  const lookup = createResidentGlyphLookup({
    a: Object.freeze({}), b: pageAtlas,
  });
  const address = { font: "b", page: 0, byte: 0x82 };
  assert.equal(lookup.hasResidentGlyph("é", address), true);
  assert.equal(lookup.glyphFor("b", "é", address), pageAtlas["82"]);

  const plan = planSegmentStrikes({
    text: "é", code_page: 0, resident_bytes: [0x82],
    style: { font: "b", underline: "off" },
    width_half_dots: 10, character_advance_half_dots: 10,
    character_cell_height_vertical_units: 18,
  }, lookup.glyphFor);
  assert.deepEqual(plan.dots.map(({ xHalfDots, yVerticalUnits }) =>
    ({ xHalfDots, yVerticalUnits })), [
    { xHalfDots: 2.5, yVerticalUnits: 1 },
  ]);
});
