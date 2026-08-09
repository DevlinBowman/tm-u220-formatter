export const DEFAULT_PREVIEW_FONT = "strike";

export function normalizePreviewFont(value) {
  return value === "classic" || value === "strike"
    ? value : DEFAULT_PREVIEW_FONT;
}
