import { syntaxSpans } from "./tokens.js";

const NAMES = {
  directive: "u220-source-directive",
  argument: "u220-source-argument",
};

export function createSyntaxHighlights(surface) {
  if (!surface.enhanced) return { render() {}, destroy() {} };
  const view = surface.element.ownerDocument.defaultView;
  const registry = view.CSS.highlights;
  const owned = new Map();
  let composing = false;
  let plain = false;

  function remove() {
    for (const [name, highlight] of owned) {
      if (typeof registry.get !== "function" || registry.get(name) === highlight) {
        registry.delete(name);
      }
    }
    owned.clear();
  }

  function render(nextPlain = plain) {
    plain = Boolean(nextPlain);
    if (composing) return;
    remove();
    if (plain) return;
    const index = surface.getTextIndex();
    const groups = { directive: [], argument: [] };
    for (const span of syntaxSpans(index.text)) {
      const start = index.pointAt(span.start);
      const end = index.pointAt(span.end);
      groups[span.kind].push(new view.StaticRange({
        startContainer: start.node, startOffset: start.offset,
        endContainer: end.node, endOffset: end.offset,
      }));
    }
    for (const [kind, ranges] of Object.entries(groups)) {
      if (!ranges.length) continue;
      const highlight = new view.Highlight(...ranges);
      highlight.priority = 1;
      registry.set(NAMES[kind], highlight);
      owned.set(NAMES[kind], highlight);
    }
  }

  const compositionStart = () => { composing = true; remove(); };
  const compositionEnd = () => { composing = false; render(); };
  surface.element.addEventListener("compositionstart", compositionStart);
  surface.element.addEventListener("compositionend", compositionEnd);

  return {
    render,
    destroy() {
      remove();
      surface.element.removeEventListener("compositionstart", compositionStart);
      surface.element.removeEventListener("compositionend", compositionEnd);
    },
  };
}
