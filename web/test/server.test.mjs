// Verifies the loopback bridge preserves compiler output and fixed-target document boundaries.
// Direct image sessions must remain read-only while exposing the exact printer dot mask.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { compileBuffer, compileTarget } from "../server/compiler.mjs";
import { parseConfig } from "../server/config.mjs";
import { EditorDocument } from "../server/document.mjs";
import { createRouter } from "../server/router.mjs";

const root = resolve(import.meta.dirname, "../..");
const aliases = resolve(root, "config/directives/aliases.u220a");
const profile = resolve(root, "config/printers/local.u220p");
const imageProfile = resolve(root, "config/images/default.u220i");
const chicken = resolve(root, "test/assets/Chicken.png");
const jpeg = resolve(root, "test/assets/jpeg/color-grid-7x5.jpg");

async function temporaryDocument(source = "ORIGINAL") {
  const directory = await mkdtemp(join(tmpdir(), "u220-editor-test-"));
  const path = join(directory, "receipt.u220");
  await writeFile(path, source, "utf8");
  return { directory, path };
}

async function routeJson(router, method, path, body, origin) {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]);
  Object.assign(request, {
    method,
    url: path,
    headers: { "content-type": "application/json", origin },
  });
  const response = {
    status: 0,
    chunks: [],
    writeHead(status) { this.status = status; },
    end(value = "") { this.chunks.push(Buffer.from(value)); },
  };
  await router(request, response);
  return {
    status: response.status,
    body: JSON.parse(Buffer.concat(response.chunks).toString("utf8")),
  };
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

test("compiler bridge resolves companion PBM images only from its fixed document", async (t) => {
  const fixture = await temporaryDocument();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  await mkdir(join(fixture.directory, "art"));
  await writeFile(join(fixture.directory, "art/pixel.pbm"),
    Buffer.concat([Buffer.from("P4\n1 1\n"), Buffer.from([0x80])]));

  const result = await compileBuffer("@image art/pixel.pbm 1 1", {
    root, profile, imageProfile, target: fixture.path, plain: false,
  });
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].kind, "image");
  assert.equal(result.lines[0].segments[0].mask_data, "0000F8F8F8F8F80000");

  const traversal = await compileBuffer("@image ../outside.pbm 1 1", {
    root, profile, imageProfile, target: fixture.path, plain: false,
  });
  assert.equal(traversal.valid, false);
  assert.equal(traversal.diagnostics[0].code, "IMAGE_ASSET_REFERENCE_INVALID");
});

test("compiler bridge renders a direct PNG from its canonical printer mask", async () => {
  const result = await compileTarget(chicken, { root, profile, imageProfile });
  const segment = result.lines[0].segments[0];

  assert.equal(result.valid, true);
  assert.equal(result.input_kind, "image");
  assert.equal(result.lines[0].kind, "image");
  assert.equal(segment.kind, "bit_image");
  assert.equal(segment.mask_width_dots, 200);
  assert.equal(segment.mask_height_dots, 126);
  assert.equal(segment.mask_data.length, 6300);
  const mask = Buffer.from(segment.mask_data, "hex");
  let strikes = 0;
  for (const byte of mask) {
    for (let bit = 0; bit < 8; bit += 1) strikes += (byte >> bit) & 1;
  }
  assert.equal(strikes, 8625);
  assert.equal(segment.width_half_dots, 400);
  assert.equal(segment.character_cell_height_vertical_units, 252);
  assert.equal(result.paper_preview.max_y_vertical_units, 260);
  assert.equal(createHash("sha256").update(mask).digest("hex"),
    "57e7f56d8ef5b7aa044976e74f4947c2db59863d6ffab6ce691bca417f50dcf5");
});

test("compiler bridge renders a direct JPEG from its canonical printer mask", async () => {
  const result = await compileTarget(jpeg, { root, profile, imageProfile });
  const segment = result.lines[0].segments[0];

  assert.equal(result.valid, true);
  assert.equal(result.input_kind, "image");
  assert.equal(segment.mask_width_dots, 200);
  assert.equal(segment.mask_height_dots, 129);
  assert.equal(segment.mask_data.length, 6450);
  assert.equal(result.paper_preview.max_y_vertical_units, 276);
  assert.equal(createHash("sha256").update(Buffer.from(segment.mask_data, "hex")).digest("hex"),
    "137e6175ceec51227b193db50c5b7f259899b2d15ae9686844e444a90b8fe045");
});

test("direct PNG sessions expose description text without making it compiler input", async () => {
  const document = await EditorDocument.open(chicken, true);
  const session = await document.read();

  assert.equal(document.immutable, true);
  assert.equal(session.source, "");
  assert.match(session.display_source, /Chicken\.png/);
  assert.equal(session.plain, false);
  assert.equal(session.input_kind, "image");
  await assert.rejects(() => document.save("not image bytes"), (error) => {
    assert.equal(error.status, 405);
    assert.match(error.message, /read-only/);
    return true;
  });
});

test("direct image routes ignore posted source and reject replacement writes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "u220-direct-route-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = join(directory, "fixed.png");
  await copyFile(chicken, target);
  const document = await EditorDocument.open(target, false);
  const config = { root, target, profile, imageProfile, plain: false };
  const origin = "http://127.0.0.1:52117";
  const router = createRouter({
    config, document, webRoot: resolve(root, "web"), origin: () => origin,
  });
  const before = createHash("sha256").update(await readFile(target)).digest("hex");

  const preview = await routeJson(router, "POST", "/api/preview", {
    source: "THIS POSTED SOURCE MUST NOT PRINT",
    path: "../another-image.png",
    plain: true,
  }, origin);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.input_kind, "image");
  assert.equal(preview.body.lines[0].image_label, "fixed.png");
  assert.equal(preview.body.lines.some(
    (line) => line.text?.includes("POSTED SOURCE")), false);

  const replacement = await routeJson(router, "PUT", "/api/file", {
    source: "replacement text",
  }, origin);
  assert.equal(replacement.status, 405);
  assert.match(replacement.body.error, /read-only/);
  assert.equal(createHash("sha256").update(await readFile(target)).digest("hex"), before);
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
  assert.equal(config.target, await realpath(fixture.path));
  assert.equal(config.plain, true);
  assert.equal(config.open, false);
  assert.equal(config.port, 0);
  assert.equal(config.aliases, aliases);
  assert.equal(config.profile, profile);
  assert.equal(config.imageProfile, imageProfile);
});

test("server config and document accept a read-only direct image", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "u220-read-only-image-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = join(directory, "readonly.png");
  await copyFile(chicken, target);
  await chmod(target, 0o444);

  const config = await parseConfig([
    target, "--no-open", "--profile", profile, "--image-profile", imageProfile,
  ], root);
  const document = await EditorDocument.open(config.target, config.plain);
  assert.equal(config.target, await realpath(target));
  assert.equal(document.immutable, true);
});
