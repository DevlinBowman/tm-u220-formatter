// Verifies schema-bound profile drafts serialize canonically and preserve profile semantics.
import test from "node:test";
import assert from "node:assert/strict";
import { controlKind, MASK_FIELDS, PRINT_FIELDS } from "../image_profile_editor/controls.js";
import { ImageProfileModel, normalizeFieldValue } from "../image_profile_editor/model.js";
import { serializeProfile } from "../image_profile_editor/profile-source.js";

function schema() {
  return {
    version: 1, header: "!tm-u220 image-profile 1",
    fields: [
      { name: "density", kind: "enum", default: "solid", choices: ["solid", "detail"] },
      { name: "fit", kind: "enum", default: "contain", choices: ["contain", "cover", "stretch"] },
      { name: "resample", kind: "enum", default: "bilinear", choices: ["nearest", "area", "bilinear"] },
      { name: "dither", kind: "enum", default: "floyd", choices: ["threshold", "ordered", "floyd"] },
      { name: "threshold", kind: "integer", default: 128, minimum: 0, maximum: 255 },
      { name: "invert", kind: "boolean", default: false },
      { name: "unidirectional", kind: "boolean", default: true },
      { name: "trailing_gap_vertical_units", kind: "integer", default: 4, minimum: 0, maximum: 255 },
      { name: "default_width_cells", kind: "integer_or_keyword", default: "page", minimum: 1, keyword: "page" },
      { name: "default_height_cells", kind: "integer_or_keyword", default: "auto", minimum: 1, keyword: "auto" },
    ],
  };
}

function profile(overrides = {}) {
  return {
    density: "solid", fit: "contain", resample: "bilinear", dither: "floyd",
    threshold: 128, invert: false, unidirectional: true,
    trailing_gap_vertical_units: 4, default_width_cells: "page",
    default_height_cells: "auto", ...overrides,
  };
}

function session(overrides = {}) {
  const nextSchema = overrides.schema || schema();
  const nextProfile = overrides.image_profile || profile();
  return {
    image_name: "Chicken.png", profile_name: "default.u220i",
    revision: "r1", image_profile: nextProfile, schema: nextSchema,
    source: serializeProfile(nextSchema, nextProfile), ...overrides,
  };
}

test("all ten canonical fields are grouped by mask and print behavior", () => {
  const names = schema().fields.map(({ name }) => name);
  assert.equal(names.length, 10);
  assert.deepEqual(new Set([...MASK_FIELDS, ...PRINT_FIELDS]), new Set(names));
  assert.equal(MASK_FIELDS.length, 8);
  assert.deepEqual(PRINT_FIELDS, ["unidirectional", "trailing_gap_vertical_units"]);
  assert.equal(controlKind(schema().fields[0]), "choices");
  assert.equal(controlKind(schema().fields[4]), "integer");
  assert.equal(controlKind(schema().fields[5]), "boolean");
  assert.equal(controlKind(schema().fields[8]), "keyword");
});

test("draft changes serialize in canonical field order and revert cleanly", () => {
  const model = new ImageProfileModel(session());
  assert.equal(model.dirty, false);
  assert.equal(model.fitDisabled, true);
  model.set("density", "detail");
  model.set("dither", "floyd");
  model.set("threshold", "172");
  model.set("invert", true);
  model.set("default_height_cells", "12");
  assert.equal(model.fitDisabled, false);
  assert.equal(model.dirty, true);
  assert.equal(model.source, [
    "!tm-u220 image-profile 1", "density=detail", "fit=contain",
    "resample=bilinear", "dither=floyd", "threshold=172", "invert=on",
    "unidirectional=on", "trailing_gap_vertical_units=4",
    "default_width_cells=page", "default_height_cells=12", "",
  ].join("\n"));
  model.revert();
  assert.equal(model.dirty, false);
  assert.equal(model.source.includes("density=solid\n"), true);
  assert.equal(model.source.includes("resample=bilinear\ndither=floyd\n"), true);
  assert.equal(model.fitDisabled, true);
});

test("choices, flags, bounds, keywords, and unknown fields fail closed", () => {
  const fields = Object.fromEntries(schema().fields.map((field) => [field.name, field]));
  assert.throws(() => normalizeFieldValue(fields.density, "photo"), /outside its choices/);
  assert.throws(() => normalizeFieldValue(fields.invert, "on"), /must be boolean/);
  assert.throws(() => normalizeFieldValue(fields.threshold, "1.5"), /must be an integer/);
  assert.throws(() => normalizeFieldValue(fields.threshold, 256), /0 through 255/);
  assert.equal(normalizeFieldValue(fields.default_width_cells, "page"), "page");
  assert.equal(normalizeFieldValue(fields.default_width_cells, "18"), 18);
  const model = new ImageProfileModel(session());
  assert.throws(() => model.set("quality", "high"), /unknown profile field/);
  assert.throws(() => new ImageProfileModel(session({
    image_profile: { ...profile(), threshold: "128" },
  })), /must be an integer/);
  assert.throws(() => new ImageProfileModel(session({ source: "not canonical\n" })),
    /session is not canonical/);
});

test("save sessions advance revision while preserving a newer local draft", () => {
  const model = new ImageProfileModel(session());
  model.set("dither", "ordered");
  const submitted = model.source;
  model.set("threshold", 166);
  const newer = model.source;
  const clean = model.applySession(session({
    revision: "r2", image_profile: profile({ dither: "ordered" }),
  }), false, submitted);
  assert.equal(clean, false);
  assert.equal(model.revision, "r2");
  assert.equal(model.value("dither"), "ordered");
  assert.equal(model.value("threshold"), 166);
  assert.equal(model.source, newer);
  assert.equal(model.dirty, true);
});
