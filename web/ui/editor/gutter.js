function scrollOffset(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function createEditorGutter(editor, lineNumbers) {
  const viewport = lineNumbers.parentElement;

  function sync() {
    viewport.scrollTop = 0;
    lineNumbers.style.transform =
      `translateY(${-scrollOffset(editor.scrollTop)}px)`;
  }

  editor.addEventListener("scroll", sync, { passive: true });
  return {
    sync,
    destroy() { editor.removeEventListener("scroll", sync); },
  };
}
