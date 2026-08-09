// Presents textarea and enhanced contenteditable implementations behind one source-surface API.
// Read-only state is applied without exposing either DOM implementation to orchestration code.
import { createTextIndex } from "./text-index.js";

function bounded(value, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(maximum, Math.max(0, Math.trunc(number)));
}

function normalizedSelection(start, end, direction, length) {
  const first = bounded(start, length);
  const last = bounded(end, length);
  const low = Math.min(first, last);
  const high = Math.max(first, last);
  const validDirection = direction === "backward" || direction === "forward"
    ? direction : "none";
  return {
    start: low,
    end: high,
    direction: low === high ? "none" : validDirection,
  };
}

function textareaSurface(element) {
  return {
    element,
    enhanced: false,
    getSource: () => element.value,
    replaceSource(source) { element.value = String(source ?? ""); },
    getSelection() {
      return {
        start: element.selectionStart,
        end: element.selectionEnd,
        direction: element.selectionDirection || "none",
      };
    },
    setSelection(start, end, direction = "none") {
      element.setSelectionRange(start, end, direction);
    },
    onSelectionChange(callback) {
      const events = ["click", "keyup", "select", "selectionchange"];
      events.forEach((event) => element.addEventListener(event, callback));
      return () => events.forEach((event) => element.removeEventListener(event, callback));
    },
    getTextIndex: () => null,
    setReadOnly(value) {
      element.readOnly = Boolean(value);
      element.setAttribute("aria-readonly", String(Boolean(value)));
    },
  };
}

function supportsEnhancedSurface(element) {
  const document = element?.ownerDocument;
  const view = document?.defaultView;
  if (!document || !view) return false;
  const registry = view.CSS?.highlights;
  if (!registry || typeof registry.set !== "function"
      || typeof registry.delete !== "function") return false;
  const probe = document.createElement("div");
  probe.contentEditable = "plaintext-only";
  return probe.contentEditable === "plaintext-only"
    && typeof view.Highlight === "function"
    && typeof view.StaticRange === "function";
}

function enhancedSurface(textarea) {
  const document = textarea.ownerDocument;
  const editor = document.createElement("pre");
  for (const attribute of textarea.attributes) {
    if (attribute.name !== "wrap") editor.setAttribute(attribute.name, attribute.value);
  }
  editor.contentEditable = "plaintext-only";
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-multiline", "true");
  editor.dataset.editorSurface = "enhanced";
  editor.textContent = textarea.value;
  let cached = normalizedSelection(
    textarea.selectionStart, textarea.selectionEnd,
    textarea.selectionDirection, editor.textContent.length);

  function liveSelection() {
    const selection = document.getSelection();
    if (!selection?.anchorNode || !selection.focusNode
        || !(editor === selection.anchorNode || editor.contains(selection.anchorNode))
        || !(editor === selection.focusNode || editor.contains(selection.focusNode))) {
      return null;
    }
    const index = createTextIndex(editor);
    const anchor = index.offsetFromPoint(selection.anchorNode, selection.anchorOffset);
    const focus = index.offsetFromPoint(selection.focusNode, selection.focusOffset);
    return {
      start: Math.min(anchor, focus),
      end: Math.max(anchor, focus),
      direction: anchor === focus ? "none" : focus < anchor ? "backward" : "forward",
    };
  }

  function setSelection(start, end, direction = "none") {
    const index = createTextIndex(editor);
    const next = normalizedSelection(start, end, direction, index.text.length);
    const anchorOffset = next.direction === "backward" ? next.end : next.start;
    const focusOffset = next.direction === "backward" ? next.start : next.end;
    const anchor = index.pointAt(anchorOffset);
    const focus = index.pointAt(focusOffset);
    const selection = document.getSelection();
    if (selection?.setBaseAndExtent) {
      selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    } else if (selection) {
      selection.removeAllRanges();
      const range = document.createRange();
      range.setStart(anchor.node, anchor.offset);
      range.collapse(true);
      selection.addRange(range);
      if (focusOffset !== anchorOffset) selection.extend(focus.node, focus.offset);
    }
    cached = next;
  }

  const surface = {
    element: editor,
    enhanced: true,
    getSource: () => createTextIndex(editor).text,
    replaceSource(source) {
      const value = String(source ?? "");
      if (value) editor.replaceChildren(document.createTextNode(value));
      else editor.replaceChildren();
      cached = { start: 0, end: 0, direction: "none" };
    },
    getSelection() {
      cached = liveSelection() || cached;
      return { ...cached };
    },
    setSelection,
    onSelectionChange(callback) {
      const handler = () => {
        const selection = liveSelection();
        if (!selection && document.activeElement !== editor) return;
        if (selection) cached = selection;
        callback();
      };
      document.addEventListener("selectionchange", handler);
      editor.addEventListener("click", handler);
      editor.addEventListener("keyup", handler);
      return () => {
        document.removeEventListener("selectionchange", handler);
        editor.removeEventListener("click", handler);
        editor.removeEventListener("keyup", handler);
      };
    },
    getTextIndex: () => createTextIndex(editor),
    setReadOnly(value) {
      const readOnly = Boolean(value);
      editor.contentEditable = readOnly ? "false" : "plaintext-only";
      editor.setAttribute("aria-readonly", String(readOnly));
    },
  };
  textarea.replaceWith(editor);
  return surface;
}

export function createSourceSurface(textarea) {
  if (!supportsEnhancedSurface(textarea)) return textareaSurface(textarea);
  try { return enhancedSurface(textarea); }
  catch { return textareaSurface(textarea); }
}
