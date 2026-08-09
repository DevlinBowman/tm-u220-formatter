// Coordinates source-editor presentation, metadata, diagnostics, and editability.
// Source storage and compiler behavior remain owned by their respective domains.
import { diagnosticErrorLines, sourceLines } from "./editor/lines.js";
import { cursorLocation, documentSize } from "./editor/cursor.js";
import { replaceEditorSource } from "./editor/document.js";
import { createSyntaxHighlights } from "./editor/highlights.js";
import { createEditorGutter } from "./editor/gutter.js";

function lineNumberNode(line, errorLines) {
  const node = document.createElement("span");
  node.className = "editor-line-number";
  if (errorLines.has(line)) node.dataset.tone = "error";
  node.textContent = String(line);
  return node;
}

export function createEditorView(surface, nodes) {
  const editor = surface.element;
  const syntaxHighlights = createSyntaxHighlights(surface);
  let plain = false;
  let errorLines = new Set();
  let renderedLineCount = 0;
  let renderedErrors = new Set();
  const gutter = createEditorGutter(editor, nodes.lineNumbers);

  function renderLineNumbers() {
    const lineCount = sourceLines(surface.getSource()).length;
    const shared = Math.min(lineCount, renderedLineCount);
    for (let index = 0; index < shared; index += 1) {
      const line = index + 1;
      const errorChanged = errorLines.has(line) !== renderedErrors.has(line);
      if (errorChanged) {
        nodes.lineNumbers.replaceChild(
          lineNumberNode(line, errorLines),
          nodes.lineNumbers.children[index]);
      }
    }
    if (lineCount > renderedLineCount) {
      const lineNumbers = document.createDocumentFragment();
      for (let index = renderedLineCount; index < lineCount; index += 1) {
        lineNumbers.append(lineNumberNode(index + 1, errorLines));
      }
      nodes.lineNumbers.append(lineNumbers);
    }
    while (nodes.lineNumbers.children.length > lineCount) {
      nodes.lineNumbers.lastElementChild.remove();
    }
    renderedLineCount = lineCount;
    renderedErrors = new Set(errorLines);
    gutter.sync();
  }

  function updateCursorMeta() {
    const source = surface.getSource();
    const cursor = cursorLocation(source, surface.getSelection());
    const size = documentSize(source);
    nodes.cursor.textContent = `Ln ${cursor.line}, Col ${cursor.column}`;
    nodes.count.textContent = `${size.lines} line${size.lines === 1 ? "" : "s"} · ${size.characters} characters`;
  }

  function updateMeta() {
    updateCursorMeta();
    renderLineNumbers();
  }

  function setSource(source) {
    errorLines = new Set();
    replaceEditorSource(surface, source);
    updateMeta();
    syntaxHighlights.render(plain);
  }

  function setMode(nextPlain) {
    plain = Boolean(nextPlain);
    nodes.modeButtons.forEach((button) => {
      const active = (button.dataset.mode === "plain") === plain;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    syntaxHighlights.render(plain);
  }

  function setReadOnly(value) {
    const readOnly = Boolean(value);
    surface.setReadOnly(readOnly);
    nodes.modeButtons.forEach((button) => { button.disabled = readOnly; });
  }

  function setDiagnostics(items = [], sourceLineOffset = 0) {
    errorLines = diagnosticErrorLines(
      items, sourceLineOffset, sourceLines(surface.getSource()).length);
    renderLineNumbers();
  }

  function setFileState(name, dirty, saved, readOnly = false) {
    nodes.name.textContent = name;
    nodes.dirty.classList.toggle("is-visible", dirty);
    nodes.dirty.setAttribute("aria-hidden", String(!dirty));
    nodes.saveState.textContent = readOnly
      ? "Direct image · read-only"
      : dirty ? "Unsaved changes" : saved ? "Saved" : "Not saved";
    document.title = `${dirty ? "• " : ""}${name} — U220 Preview`;
  }

  editor.addEventListener("input", () => {
    errorLines = new Set();
    updateMeta();
    syntaxHighlights.render(plain);
  });
  surface.onSelectionChange(updateCursorMeta);
  updateMeta();
  syntaxHighlights.render(plain);
  return {
    setDiagnostics, setFileState, setMode, setReadOnly, setSource, updateMeta,
    destroy() {
      syntaxHighlights.destroy();
      gutter.destroy();
    },
  };
}
