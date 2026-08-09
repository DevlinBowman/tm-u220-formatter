const segmenter = globalThis.Intl?.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

export function characterCount(value) {
  const text = String(value);
  return segmenter
    ? [...segmenter.segment(text)].length
    : [...text].length;
}

export function cursorLocation(source, selection) {
  const offset = selection.direction === "backward"
    ? selection.start
    : selection.end;
  const lines = String(source).slice(0, offset).split("\n");
  return { line: lines.length, column: characterCount(lines.at(-1)) + 1 };
}

export function documentSize(source) {
  const text = String(source);
  return { lines: text.split("\n").length, characters: characterCount(text) };
}
