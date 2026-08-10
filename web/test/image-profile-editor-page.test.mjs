// Verifies the isolated page reuses the shared shell and exposes no image-write or print action.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../image_profile_editor");

test("page has two shared-style panels, exact preview, and profile-only actions", async () => {
  const source = await readFile(resolve(root, "index.html"), "utf8");
  const styles = await readFile(resolve(root, "styles.css"), "utf8");
  for (const stylesheet of [
    "/styles/tokens.css", "/styles/shell.css", "/styles/receipt.css",
  ]) assert.match(source, new RegExp(`href="${stylesheet.replaceAll("/", "\\/")}"`));
  assert.match(source, /class="workspace image-profile-workspace"/);
  assert.match(source, /class="panel controls-panel"/);
  assert.match(source, /class="panel preview-panel"/);
  assert.match(source, /id="receipt" aria-label="Exact printer-dot preview"/);
  assert.match(source, /id="revert-button"/);
  assert.match(source, /id="save-button"/);
  assert.doesNotMatch(source, /id="print-button"|type="file"/);
  assert.match(source, /source image is read-only/i);
  assert.match(styles, /input\.integer-input:focus-visible\s*\{[^}]*outline:/s);
});

test("browser API has only fixed session, preview, and profile routes", async () => {
  const source = await readFile(resolve(root, "api.js"), "utf8");
  assert.match(source, /"\/api\/session"/);
  assert.match(source, /"\/api\/preview"/);
  assert.match(source, /"\/api\/profile"/);
  assert.doesNotMatch(source, /api\/print|arrayBuffer|FileReader|FormData/);
});

test("feature scripts remain small intent-scoped modules", async () => {
  const files = (await readdir(root)).filter((name) => name.endsWith(".js"));
  assert.ok(files.length >= 8);
  for (const name of files) {
    const source = await readFile(resolve(root, name), "utf8");
    assert.match(source, /^\/\/ .+\n\/\/ .+\n/);
    assert.ok(source.split("\n").length - 1 <= 200, `${name} exceeds 200 lines`);
  }
});
