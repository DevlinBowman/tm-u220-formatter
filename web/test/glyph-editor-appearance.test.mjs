// Verifies preview-wide impact sizing stays global, physical, and fixed-target persisted.
// Glyph patterns and receipt layout are deliberately absent from this settings domain.
import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AppearanceModel } from "../../dev/glyph_editor/public/appearance-model.js";
import { AppearanceStore } from "../../dev/glyph_editor/server/appearance-store.mjs";
import {
  GLYPH_STUDY_GEOMETRY,
  studyCellGeometry,
} from "../../dev/glyph_editor/public/preview.js";
import {
  parseAppearanceSource,
  replaceAppearanceSource,
} from "../../dev/glyph_editor/server/appearance-source.mjs";
import {
  DOUBLE_STRIKE_DOT_DIAMETER_MM,
  SINGLE_STRIKE_DOT_DIAMETER_MM,
  impactRadii,
} from "../preview/printer-font/appearance.js";

const appearancePath = resolve(import.meta.dirname,
  "../preview/printer-font/appearance.js");

test("receipt ink selects one global diameter by strike style", () => {
  assert.equal(impactRadii({}).coreRadiusMm,
    SINGLE_STRIKE_DOT_DIAMETER_MM / 2);
  assert.equal(impactRadii({ double_strike: true }).coreRadiusMm,
    DOUBLE_STRIKE_DOT_DIAMETER_MM / 2);
  assert.equal(impactRadii({ emphasis: true }).coreRadiusMm,
    SINGLE_STRIKE_DOT_DIAMETER_MM / 2);
  assert.equal(impactRadii({ double_strike: true }).bleedRadiusMm
    > impactRadii({ double_strike: true }).coreRadiusMm, true);
});

test("study geometry treats half dots as full-impact offsets", () => {
  assert.equal(GLYPH_STUDY_GEOMETRY.halfDotMm, 25.4 / 160);
  assert.equal(GLYPH_STUDY_GEOMETRY.pinRowMm, 25.4 / 72);
  assert.equal(Math.abs(GLYPH_STUDY_GEOMETRY.pinRowMm
    / GLYPH_STUDY_GEOMETRY.halfDotMm - 160 / 72) < 1e-12, true);
  assert.equal(SINGLE_STRIKE_DOT_DIAMETER_MM
    > GLYPH_STUDY_GEOMETRY.halfDotMm, true);
});

test("study geometry keeps matrix data separate from printer spacing", () => {
  const fontA = studyCellGeometry(9, 9, 3);
  const fontB = studyCellGeometry(7, 9, 2);
  assert.equal(fontA.advanceHalfDots, 12);
  assert.equal(fontB.advanceHalfDots, 9);
  assert.equal(fontA.alignmentEdgeAfterRow, 9);
  assert.equal(fontB.alignmentEdgeAfterRow, 9);
  assert.equal(fontA.matrixHeightVerticalUnits, 18);
  assert.equal(fontA.defaultLinePitchVerticalUnits, 24);
  assert.equal(fontA.lineSpacingOutsideMatrixVerticalUnits, 6);
  assert.throws(() => studyCellGeometry(9, 9, 1),
    /two- or three-half-dot-position character spacing/);
});

test("appearance drafts are global and independently revertible", () => {
  const model = new AppearanceModel({ single: 0.28, double: 0.31 });
  model.set("single", 0.24);
  assert.deepEqual(model.value, { single: 0.24, double: 0.31 });
  assert.equal(model.dirty, true);
  model.selectMode("double");
  assert.equal(model.selectedDiameter, 0.31);
  model.revert();
  assert.deepEqual(model.value, { single: 0.28, double: 0.31 });
  assert.throws(() => model.set("A", 0.2), /only defined for single or double/);
});

test("appearance store changes only its fixed preview source", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "u220-appearance-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "appearance.js");
  await copyFile(appearancePath, path);
  const store = new AppearanceStore(path);
  const previous = await store.read();
  const value = {
    single: previous.single === 0.2 ? 0.21 : 0.2,
    double: previous.double === 0.3 ? 0.31 : 0.3,
  };
  const result = await store.save({ value, previous });
  assert.deepEqual(result, { saved: true, value });
  assert.deepEqual(await store.read(), value);
  await assert.rejects(store.save({ value, previous }), /changed on disk/);
});

test("appearance source rejects nonphysical or malformed tuning", async () => {
  const source = await readFile(appearancePath, "utf8");
  const parsed = parseAppearanceSource(source);
  assert.deepEqual(parsed, {
    single: SINGLE_STRIKE_DOT_DIAMETER_MM,
    double: DOUBLE_STRIKE_DOT_DIAMETER_MM,
  });
  assert.throws(() => replaceAppearanceSource(source,
    { single: 0, double: 0.2 }, parsed), /0.1–0.6 mm/);
  assert.throws(() => parseAppearanceSource("export const nope = 1;"),
    /missing SINGLE_STRIKE/);
});
