// Guards the web domain's explicit ES-module boundary across supported Node runtimes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const webManifest = JSON.parse(fs.readFileSync(
  new URL("../package.json", import.meta.url), "utf8",
));
const glyphEditorManifest = JSON.parse(fs.readFileSync(
  new URL("../../dev/glyph_editor/package.json", import.meta.url), "utf8",
));

test("web modules have an explicit Node-compatible module boundary", () => {
  assert.deepEqual(webManifest, { private: true, type: "module" });
});

test("glyph editor modules have an explicit Node-compatible module boundary", () => {
  assert.deepEqual(glyphEditorManifest, { private: true, type: "module" });
});
