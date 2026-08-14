// Identifies directive and argument spans for paint-only source highlighting.
// Line-owning directives keep their pipes as data instead of pipeline separators.
const FIRST_DIRECTIVE =
  /^([ \t]*)(@(?:kv_(?:start|end)(?=[ \t]*$)|[a-z][a-z-]*))/;
const LINE_OWNING_DIRECTIVES = new Set([
  "@image", "@kv", "@kv_start", "@kv_end",
  "@table", "@head", "@row", "@end-table",
]);

function addSpan(spans, kind, start, end, base) {
  if (end > start) spans.push({ kind, start: base + start, end: base + end });
}

function addArgument(spans, line, start, end, base) {
  const whitespace = line.slice(start, end).match(/^[ \t]*/)?.[0].length || 0;
  addSpan(spans, "argument", start + whitespace, end, base);
}

function pipeIsEscaped(line, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function lineSpans(line, base) {
  const first = line.match(FIRST_DIRECTIVE);
  if (!first) return [];
  const spans = [];
  const firstStart = first[1].length;
  addSpan(spans, "directive", firstStart, firstStart + first[2].length, base);
  let cursor = first[0].length;

  if (!LINE_OWNING_DIRECTIVES.has(first[2])) {
    const nextDirective = /\|([ \t]*)(@[a-z][a-z-]*)/g;
    nextDirective.lastIndex = cursor;
    let match;
    while ((match = nextDirective.exec(line))) {
      if (pipeIsEscaped(line, match.index)) continue;
      addArgument(spans, line, cursor, match.index, base);
      const start = match.index + 1 + match[1].length;
      addSpan(spans, "directive", start, start + match[2].length, base);
      cursor = start + match[2].length;
      nextDirective.lastIndex = cursor;
    }
  }

  addArgument(spans, line, cursor, line.length, base);
  return spans;
}

export function syntaxSpans(source, plain = false) {
  if (plain) return [];
  const lines = String(source ?? "").split("\n");
  const spans = [];
  let base = 0;
  lines.forEach((line, index) => {
    const lexicalLine = line.endsWith("\r") ? line.slice(0, -1) : line;
    spans.push(...lineSpans(lexicalLine, base));
    base += line.length + (index < lines.length - 1 ? 1 : 0);
  });
  return spans;
}
