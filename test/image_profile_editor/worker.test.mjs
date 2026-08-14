// Exercises the image-profile worker as the canonical draft and physical-preview boundary.
// Assertions exclude printer bytes while fixing schema, diagnostics, and raster output contracts.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const worker = path.join(root, "libexec/image_profile_editor/worker.lua");
const printerProfile = path.join(root, "config/printers/local.u220p");
const image = path.join(root, "test/assets/Chicken.png");
const defaultSource = fs.readFileSync(
  path.join(root, "config/images/default.u220i"), "utf8");

function run(args, source = defaultSource) {
  return spawnSync("lua", [worker, ...args], {
    cwd: root, input: source, encoding: "utf8", timeout: 10000,
  });
}

function succeed(args, source) {
  const result = run(args, source);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

test("inspect returns canonical typed profile and editor schema", () => {
  const source = defaultSource
    .replace("dither=ordered", "dither=floyd")
    .replace("threshold=61", "threshold=91")
    .replace("default_width_cells=page", "default_width_cells=18");
  const result = succeed(["inspect"], source);

  assert.equal(result.valid, true);
  assert.equal(result.profile_source, source);
  assert.equal(result.image_profile.dither, "floyd");
  assert.equal(result.image_profile.threshold, 91);
  assert.equal(result.image_profile.default_width_cells, 18);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.schema.version, 1);
  assert.equal(result.schema.header, "!tm-u220 image-profile 1");
  assert.equal(result.schema.fields.length, 10);
  assert.deepEqual(result.schema.fields[0], {
    name: "density", kind: "enum", default: "solid",
    choices: ["solid", "detail"],
  });
  assert.deepEqual(result.schema.fields[4], {
    name: "threshold", kind: "integer", default: 128,
    minimum: 0, maximum: 255,
  });
  assert.deepEqual(result.schema.fields[8], {
    name: "default_width_cells", kind: "integer_or_keyword",
    default: "page", minimum: 1, keyword: "page",
  });
});

test("inspect reports invalid drafts with explicit null values", () => {
  const result = succeed(["inspect"], defaultSource.replace(
    "dither=ordered", "dither=photographic"));

  assert.equal(result.valid, false);
  assert.equal(result.profile_source, null);
  assert.equal(result.image_profile, null);
  assert.equal(result.diagnostics[0].code, "IMAGE_PROFILE_FILE_INVALID_FIELD");
  assert.match(result.diagnostics[0].message, /threshold, ordered, or floyd/);
  assert.equal(result.schema.fields.length, 10);
});

test("compile emits exact preview geometry without printer bytes", () => {
  const source = defaultSource;
  const result = succeed([
    "compile", "--image", image, "--profile", printerProfile,
  ], source);
  const segment = result.lines[0].segments[0];

  assert.equal(result.valid, true);
  assert.equal(result.byte_count, 6539);
  assert.equal(result.input_kind, "image");
  assert.equal(result.image_profile.dither, "ordered");
  assert.equal(result.profile_source, source);
  assert.equal(segment.kind, "bit_image");
  assert.equal(segment.mask_width_dots, 400);
  assert.equal(segment.mask_height_dots, 126);
  assert.equal(result.paper_preview.max_y_vertical_units, 260);
  assert.equal(crypto.createHash("sha256")
    .update(Buffer.from(segment.mask_data, "hex")).digest("hex"),
  "37e8495bb8c97fce66fd3a2b48d7c4c4c004c89c9f727e3ebc3619476fc718d1");
  for (const forbidden of ["bytes", "encoded_parts", "nodes", "document", "source"]) {
    assert.equal(Object.hasOwn(result, forbidden), false, forbidden);
  }
});

test("compile returns profile diagnostics before reading the image", () => {
  const result = succeed([
    "compile", "--image", "/missing/private/image.png",
    "--profile", "/missing/private/profile.u220p",
  ], defaultSource.replace("threshold=61", "threshold=999"));

  assert.equal(result.valid, false);
  assert.equal(result.byte_count, 0);
  assert.equal(result.profile, null);
  assert.deepEqual(result.lines, []);
  assert.equal(result.profile_source, null);
  assert.equal(result.image_profile, null);
  assert.equal(result.diagnostics[0].code, "IMAGE_PROFILE_FILE_INVALID_FIELD");
});

test("worker arguments are strict usage errors", () => {
  for (const args of [
    [], ["inspect", "extra"], ["compile", "--image", image],
    ["compile", "--image", image, "--profile", printerProfile, "--extra", "x"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 64, args.join(" "));
    assert.equal(result.stdout, "");
    assert.notEqual(result.stderr, "");
  }
});
