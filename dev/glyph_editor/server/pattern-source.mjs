// Parses and rewrites the two canonical preview-atlas entry arrays without evaluating source code.
// Validation requires complete printable-ASCII coverage and fixed Font A/B lattice dimensions.
export const PRINTABLE_ASCII = Array.from(
  { length: 0x7f - 0x20 }, (_, index) => String.fromCharCode(0x20 + index),
).join("");

export const FONT_DIMENSIONS = Object.freeze({
  a: Object.freeze({ width: 9, height: 9 }),
  b: Object.freeze({ width: 7, height: 9 }),
});

function isPrintableAscii(character) {
  return typeof character === "string" && character.length === 1
    && character >= " " && character <= "~";
}

export function validatePattern(pattern, width, height = 9) {
  const rows = typeof pattern === "string" ? pattern.split("/") : [];
  if (rows.length !== height
    || rows.some((row) => row.length !== width || /[^.#]/.test(row))) {
    throw Object.assign(new Error(`glyph pattern must be ${width} × ${height}`),
      { status: 400 });
  }
  return pattern;
}

function entryFromLine(line) {
  const match = line.match(/^\s*\[((?:"(?:\\.|[^"\\])*")\s*),\s*((?:"(?:\\.|[^"\\])*"))\],?\s*$/);
  if (!match) return null;
  try { return { character: JSON.parse(match[1]), pattern: JSON.parse(match[2]) }; }
  catch { return null; }
}

export function parsePatternSource(source, width, height = 9) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const entries = [];
  for (const [lineIndex, line] of lines.entries()) {
    const entry = entryFromLine(line);
    if (!entry || !isPrintableAscii(entry.character)) continue;
    validatePattern(entry.pattern, width, height);
    entries.push({ ...entry, lineIndex });
  }
  if (entries.map(({ character }) => character).join("") !== PRINTABLE_ASCII) {
    throw new Error("preview atlas must cover printable ASCII in code-point order");
  }
  return {
    entries,
    lines,
    newline,
    patterns: Object.fromEntries(entries.map(
      ({ character, pattern }) => [character, pattern])),
  };
}

export function replacePatternSource(
  source, { character, pattern, previousPattern, width, height = 9 },
) {
  if (!isPrintableAscii(character)) {
    throw Object.assign(new Error("character must be one printable ASCII scalar"),
      { status: 400 });
  }
  validatePattern(pattern, width, height);
  const parsed = parsePatternSource(source, width, height);
  const entry = parsed.entries.find((value) => value.character === character);
  if (!entry) throw new Error("selected preview glyph is missing from its atlas");
  if (previousPattern !== undefined && entry.pattern !== previousPattern) {
    throw Object.assign(new Error("glyph changed on disk; reload before saving"),
      { status: 409 });
  }
  parsed.lines[entry.lineIndex] = `  [${JSON.stringify(character)}, ${JSON.stringify(pattern)}],`;
  return parsed.lines.join(parsed.newline);
}
