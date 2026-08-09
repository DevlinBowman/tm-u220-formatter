// Verifies code-page glyphs use a browser-backed layer without disturbing exact ASCII strike cells.
import test from "node:test";
import assert from "node:assert/strict";
import { browserGlyph } from "../preview/classic-font/presentation.js";
import { previewGlyphLayers } from "../preview/printer-font/glyph-layers.js";
import { renderStrikeSegment } from "../preview/renderers/strike.js";

test("compiler-addressed glyphs retain aligned cells in both layers", () => {
  assert.deepEqual(previewGlyphLayers({
    text: "AéB", code_page: 0, resident_bytes: [0x41, 0x82, 0x42],
  }), {
    strikeText: "A B",
    fallbackText: " é ",
    hasFallback: true,
  });
  assert.deepEqual(previewGlyphLayers({
    text: "AБB", code_page: 17, resident_bytes: [0x41, 0x81, 0x42],
  }), {
    strikeText: "A B",
    fallbackText: " Б ",
    hasFallback: true,
  });
});

test("unverified Unicode fails closed while ASCII retains exact strikes", () => {
  assert.deepEqual(previewGlyphLayers({ text: "A? ~" }), {
    strikeText: "A? ~",
    fallbackText: "    ",
    hasFallback: false,
  });
  for (const segment of [
    { text: "☃" },
    { text: "☃", resident_bytes: [0x80] },
    { text: "☃", code_page: 0, resident_bytes: [] },
    { text: "☃", code_page: 0, resident_bytes: [0x100] },
    { text: "☃", code_page: -1, resident_bytes: [0x80] },
    { text: "☃", code_page: 9, resident_bytes: [0x80] },
  ]) {
    assert.deepEqual(previewGlyphLayers(segment), {
      strikeText: "?", fallbackText: " ", hasFallback: false,
    });
  }
});

test("legal soft hyphen has a visible browser representative", () => {
  assert.equal(browserGlyph("\u00ad"), "-");
  assert.equal(browserGlyph("Б"), "Б");
});

function canvasRuntime() {
  const log = { text: [], clips: [] };
  const canvases = [];
  function context(audit) {
    let translation = { x: 0, y: 0 };
    let scale = { x: 1, y: 1 };
    const stack = [];
    return {
      arc() {}, beginPath() {}, clearRect() {}, clip() {}, fill() {},
      drawImage() { audit.drawImages += 1; },
      fillRect() {}, measureText: (character) => ({
        width: character === "Б" ? 20 : 8,
      }),
      rect(x, y, width, height) { log.clips.push({ x, y, width, height }); },
      restore() {
        const saved = stack.pop();
        if (saved) ({ translation, scale } = saved);
      },
      save() {
        stack.push({ translation: { ...translation }, scale: { ...scale } });
      },
      scale(x, y) { scale = { x: scale.x * x, y: scale.y * y }; },
      setTransform() {
        translation = { x: 0, y: 0 };
        scale = { x: 1, y: 1 };
      },
      translate(x, y) {
        translation = { x: translation.x + x, y: translation.y + y };
      },
      fillText(character) {
        log.text.push({
          character, x: translation.x, y: translation.y, scaleX: scale.x,
        });
      },
    };
  }
  return {
    log,
    document: {
      documentElement: {},
      createElement() {
        const audit = { drawImages: 0 };
        const drawingContext = context(audit);
        const node = {
          _audit: audit,
          className: "", style: {}, setAttribute() {},
          getContext: () => drawingContext,
        };
        canvases.push(node);
        return node;
      },
    },
  };
}

function segment(text, residentBytes) {
  return {
    text,
    code_page: 17,
    resident_bytes: residentBytes,
    style: { font: "b", color: "black", underline: "off" },
    width_half_dots: [...text].length * 10,
    character_advance_half_dots: 10,
    character_cell_height_vertical_units: 18,
  };
}

test("strike renderer paints only authorized Unicode inside its cell", (t) => {
  const previous = {
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
    window: globalThis.window,
  };
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  const runtime = canvasRuntime();
  globalThis.document = runtime.document;
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "#25241f" });
  const geometry = { scale: 5, xUnit: 25.4 / 160 * 5, yUnit: 25.4 / 144 * 5 };
  const profile = {
    defaults: { font: "b" },
    fonts: {
      b: {
        character_width_micrometers: 1200,
        character_height_micrometers: 3100,
      },
    },
  };
  const rendered = { children: [], append(node) { this.children.push(node); } };
  const authorized = segment("AБB", [0x41, 0x81, 0x42]);
  renderStrikeSegment(
    rendered, authorized, geometry, profile, authorized.style);
  assert.equal(rendered.children.length, 2);
  assert.match(rendered.children[1].className, /receipt-code-page-canvas/);
  assert.deepEqual(runtime.log.text.map((item) => item.character), ["Б"]);
  const advance = authorized.character_advance_half_dots * geometry.xUnit;
  assert.equal(runtime.log.text[0].x >= advance, true);
  assert.equal(runtime.log.text[0].x < advance * 2, true);
  assert.equal(runtime.log.text[0].scaleX <= 6 / 20, true);
  assert.equal(runtime.log.clips.some((clip) => clip.width === advance), true);
  assert.equal(rendered.children[1]._audit.drawImages > 0, true);

  const aliased = { children: [], append(node) { this.children.push(node); } };
  const softHyphen = segment("A\u00adB", [0x41, 0xf0, 0x42]);
  softHyphen.code_page = 2;
  renderStrikeSegment(
    aliased, softHyphen, geometry, profile, softHyphen.style);
  assert.equal(runtime.log.text.at(-1).character, "-");

  const rejected = { children: [], append(node) { this.children.push(node); } };
  const unsupported = segment("☃", []);
  renderStrikeSegment(
    rejected, unsupported, geometry, profile, unsupported.style);
  assert.equal(rejected.children.length, 1);
  assert.deepEqual(
    runtime.log.text.map((item) => item.character), ["Б", "-"]);
});
