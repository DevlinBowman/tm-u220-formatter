// Verifies the loopback editor bridge preserves compiler output, UTF-8 source, and fixed-target saves.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { compileBuffer } from "../server/compiler.mjs";
import { parseConfig } from "../server/config.mjs";
import { EditorDocument } from "../server/document.mjs";

const root = resolve(import.meta.dirname, "../..");
const aliases = resolve(root, "config/directives/aliases.u220a");
const profile = resolve(root, "config/printers/local.u220p");

async function temporaryDocument(source = "ORIGINAL") {
  const directory = await mkdtemp(join(tmpdir(), "u220-editor-test-"));
  const path = join(directory, "receipt.u220");
  await writeFile(path, source, "utf8");
  return { directory, path };
}

test("compiler bridge returns canonical physical preview geometry", async () => {
  const result = await compileBuffer("@align center\nLIVE", {
    root, profile, plain: false,
  });
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].text, "LIVE");
  assert.equal(result.source_line_offset, 1);
  assert.equal(result.lines[0].x_offset_half_dots, 180);
  assert.equal(result.lines[0].segments[0].character_advance_half_dots, 10);
  assert.equal(result.paper_preview.events[0].kind, "line");
});

test("compiler bridge preserves resident code-page glyphs for web rendering", async () => {
  const result = await compileBuffer(
    "éБŁ\n@code-page 2 | @text ¢ | @line\n"
      + "@code-page 2 | @text \u00ad | @line", {
      root, profile, plain: false,
    });
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].text, "éБŁ");
  assert.deepEqual(result.lines[0].segments.map((segment) => [
    segment.text, segment.code_page, segment.resident_bytes,
  ]), [["é", 0, [0x82]], ["Б", 17, [0x81]], ["Ł", 18, [0x9d]]]);
  assert.deepEqual(result.lines[1].segments.map((segment) => [
    segment.text, segment.code_page, segment.resident_bytes,
  ]), [["¢", 2, [0xbd]]]);
  assert.deepEqual(result.lines[2].segments.map((segment) => [
    segment.text, segment.code_page, segment.resident_bytes,
  ]), [["\u00ad", 2, [0xf0]]]);
});

test("compiler bridge substitutes Unicode without a legal resident address", async () => {
  const automatic = await compileBuffer("é☃Б", {
    root, profile, plain: false,
  });
  assert.equal(automatic.valid, true);
  assert.equal(automatic.lines[0].text, "é?Б");
  assert.deepEqual(automatic.lines[0].segments.map((segment) => [
    segment.text, segment.code_page, segment.resident_bytes,
  ]), [["é?", 0, [0x82, 0x3f]], ["Б", 17, [0x81]]]);
  assert.equal(automatic.diagnostics[0].code, "FORMAT_GLYPH_SUBSTITUTED");

  const wrongPage = await compileBuffer(
    "@code-page 17 | @text é | @line", {
      root, profile, plain: false,
    });
  assert.equal(wrongPage.lines[0].text, "?");
  assert.deepEqual([
    wrongPage.lines[0].segments[0].text,
    wrongPage.lines[0].segments[0].code_page,
    wrongPage.lines[0].segments[0].resident_bytes,
  ], ["?", 17, [0x3f]]);
  assert.equal(wrongPage.diagnostics[0].code, "FORMAT_GLYPH_SUBSTITUTED");
});

test("compiler bridge reports source errors without printer bytes", async () => {
  const result = await compileBuffer("@font definitely-not-a-font", {
    root, profile, plain: false,
  });
  assert.equal(result.valid, false);
  assert.equal(result.byte_count, 0);
  assert.match(result.diagnostics[0].code, /invalid_arguments/);
});

test("compiler bridge passes the selected alias catalog to its worker", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "u220-alias-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const customAliases = join(directory, "aliases.u220a");
  await writeFile(customAliases, [
    "!tm-u220 aliases 1",
    "@custom-heading == @align center | @color red",
    "",
  ].join("\n"), "utf8");

  const result = await compileBuffer(
    "@custom-heading | @text CONFIGURED | @line", {
      root, profile, aliases: customAliases, plain: false,
    });
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].justification, "center");
  assert.equal(result.lines[0].segments[0].style.color, "red");
});

test("editor document saves only its fixed target with an atomic replacement", async (t) => {
  const fixture = await temporaryDocument();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  const document = new EditorDocument(fixture.path, false);
  const saved = await document.save("UPDATED\n");
  assert.equal(saved.saved, true);
  assert.equal(await readFile(fixture.path, "utf8"), "UPDATED\n");
  assert.deepEqual(await readdir(fixture.directory), ["receipt.u220"]);
});

test("server config accepts a writable file and editor flags", async (t) => {
  const fixture = await temporaryDocument();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  const config = await parseConfig([
    fixture.path, "--text", "--no-open", "--profile", profile,
    "--aliases", aliases, "--port", "0",
  ], root);
  assert.equal(config.target, fixture.path);
  assert.equal(config.plain, true);
  assert.equal(config.open, false);
  assert.equal(config.port, 0);
  assert.equal(config.aliases, aliases);
  assert.equal(config.profile, profile);
});
