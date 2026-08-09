import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function webSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function ruleBody(css, selector) {
  return css.match(new RegExp(`${selector}\\s*\\{([^}]+)\\}`))?.[1] || "";
}

test("the editor keeps one visible editable surface with a textarea fallback", async () => {
  const [html, css, editor, surface] = await Promise.all([
    webSource("index.html"),
    webSource("styles/shell.css"),
    webSource("ui/editor.js"),
    webSource("ui/editor/surface.js"),
  ]);
  assert.match(html, /<textarea\s+id="source-editor"/);
  assert.doesNotMatch(html, /source-highlights|editor-highlights/);
  assert.doesNotMatch(editor, /tokenizeSourceLine|nodes\.highlights/);
  assert.match(surface, /contentEditable\s*=\s*"plaintext-only"/);
  assert.match(surface, /return textareaSurface\(textarea\)/);

  const editorRule = ruleBody(css, "#source-editor");
  assert.match(editorRule, /display:\s*block/);
  assert.match(editorRule, /margin:\s*0/);
  assert.match(editorRule, /overflow:\s*auto/);
  assert.match(editorRule, /white-space:\s*pre/);
  assert.match(editorRule, /color:\s*var\(--ink\)/);
  assert.doesNotMatch(editorRule, /color:\s*transparent|text-fill-color/);
  assert.match(css, /--editor-line-height:\s*22px/);
  assert.doesNotMatch(css, /\.editor-highlights|#source-highlights|\.editor-token|\.editor-source-line/);

  const gutterRule = ruleBody(css, "\\.editor-line-numbers");
  assert.match(gutterRule, /overflow-anchor:\s*none/);

  const lineNumberRule = ruleBody(css, "\\.editor-line-number");
  assert.match(lineNumberRule, /position:\s*relative/);
  assert.match(lineNumberRule, /top:\s*2px/);
});

test("syntax highlights are paint-only and cannot become chip geometry", async () => {
  const [css, highlights] = await Promise.all([
    webSource("styles/shell.css"),
    webSource("ui/editor/highlights.js"),
  ]);
  const directive = ruleBody(css, "::highlight\\(u220-source-directive\\)");
  const argument = ruleBody(css, "::highlight\\(u220-source-argument\\)");
  const layoutProperty = /\b(?:display|position|inset|width|height|margin|padding|border(?:-[a-z-]+)?|box-shadow|font(?:-[a-z-]+)?|letter-spacing|line-height|transform)\s*:/;

  assert.match(directive, /color:\s*var\(--accent-hover\)/);
  assert.match(argument, /color:\s*var\(--warning\)/);
  assert.doesNotMatch(`${directive}\n${argument}`, /background(?:-color)?\s*:/);
  assert.doesNotMatch(`${directive}\n${argument}`, layoutProperty);
  assert.match(highlights, /"u220-source-directive"/);
  assert.match(highlights, /"u220-source-argument"/);
  assert.doesNotMatch(highlights, /createElement|innerHTML|appendChild/);
});
