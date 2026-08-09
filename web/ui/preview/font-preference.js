import {
  DEFAULT_PREVIEW_FONT,
  normalizePreviewFont,
} from "../../preview/font-mode.js";

export const PREVIEW_FONT_STORAGE_KEY = "u220.preview-font";

export function readPreviewFont(storage = globalThis.localStorage) {
  try {
    return normalizePreviewFont(storage?.getItem(PREVIEW_FONT_STORAGE_KEY));
  } catch {
    return DEFAULT_PREVIEW_FONT;
  }
}

export function storePreviewFont(value, storage = globalThis.localStorage) {
  const font = normalizePreviewFont(value);
  try {
    storage?.setItem(PREVIEW_FONT_STORAGE_KEY, font);
  } catch {
    // The preview switch still works when browser storage is unavailable.
  }
  return font;
}

export function createPreviewFontPreference({
  preview, buttons, onChange, storage,
}) {
  let current = DEFAULT_PREVIEW_FONT;

  function apply(value, persist = false) {
    current = persist ? storePreviewFont(value, storage)
      : normalizePreviewFont(value);
    preview.dataset.previewFont = current;
    for (const button of buttons) {
      const active = button.dataset.previewFont === current;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    onChange?.(current);
    return current;
  }

  for (const button of buttons) {
    button.addEventListener("click", () => apply(button.dataset.previewFont, true));
  }
  apply(readPreviewFont(storage));
  return {
    set: (value) => apply(value, true),
    get value() { return current; },
  };
}
