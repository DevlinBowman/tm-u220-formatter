import test from "node:test";
import assert from "node:assert/strict";
import {
  PREVIEW_FONT_STORAGE_KEY,
  createPreviewFontPreference,
  readPreviewFont,
  storePreviewFont,
} from "../ui/preview/font-preference.js";
import {
  DEFAULT_PREVIEW_FONT,
  normalizePreviewFont,
} from "../preview/font-mode.js";

function memoryStorage(value) {
  return {
    value,
    getItem(key) { assert.equal(key, PREVIEW_FONT_STORAGE_KEY); return this.value; },
    setItem(key, next) { assert.equal(key, PREVIEW_FONT_STORAGE_KEY); this.value = next; },
  };
}

function fakeButton(value) {
  const classes = new Set();
  const attributes = new Map();
  let click;
  return {
    dataset: { previewFont: value },
    classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); } },
    setAttribute(name, valueToSet) { attributes.set(name, valueToSet); },
    addEventListener(name, listener) { if (name === "click") click = listener; },
    click() { click(); },
    classes,
    attributes,
  };
}

test("preview appearance defaults to the 9-pin renderer", () => {
  assert.equal(DEFAULT_PREVIEW_FONT, "strike");
  assert.equal(normalizePreviewFont("classic"), "classic");
  assert.equal(normalizePreviewFont("strike"), "strike");
  assert.equal(normalizePreviewFont("unknown"), "strike");
});

test("preview appearance round trips and tolerates blocked storage", () => {
  const storage = memoryStorage(null);
  assert.equal(readPreviewFont(storage), "strike");
  assert.equal(storePreviewFont("classic", storage), "classic");
  assert.equal(readPreviewFont(storage), "classic");
  assert.equal(storePreviewFont("strike", storage), "strike");
  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.equal(readPreviewFont(blocked), "strike");
  assert.equal(storePreviewFont("classic", blocked), "classic");
});

test("preview appearance controller restores and switches renderers", () => {
  const storage = memoryStorage(null);
  const preview = { dataset: {} };
  const classic = fakeButton("classic");
  const strike = fakeButton("strike");
  const changes = [];
  const preference = createPreviewFontPreference({
    preview, buttons: [classic, strike], storage,
    onChange: (value) => changes.push(value),
  });
  assert.equal(preference.value, "strike");
  assert.equal(preview.dataset.previewFont, "strike");
  assert.equal(strike.attributes.get("aria-pressed"), "true");
  assert.equal(classic.attributes.get("aria-pressed"), "false");
  classic.click();
  assert.equal(preference.value, "classic");
  assert.equal(storage.value, "classic");
  assert.deepEqual(changes, ["strike", "classic"]);
});
