export function replaceEditorSource(surface, source) {
  surface.replaceSource(source);
  surface.setSelection(0, 0);
  surface.element.scrollTop = 0;
  surface.element.scrollLeft = 0;
}
