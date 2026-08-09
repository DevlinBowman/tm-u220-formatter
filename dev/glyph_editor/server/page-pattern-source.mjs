// Parses and rewrites sparse byte-keyed pattern entries for one resident code page.
// Missing entries remain implicit blank glyphs while authored entries stay ordered and conflict-safe.
import { validatePattern } from "./pattern-source.mjs";

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function byteKey(byte) {
  return byte.toString(16).toUpperCase().padStart(2, "0");
}

function allowedByteSet(allowedBytes) {
  return allowedBytes instanceof Set ? allowedBytes : new Set(allowedBytes);
}

function entryFromLine(line) {
  const match = line.match(/^\s*\[((?:"(?:\\.|[^"\\])*")\s*),\s*((?:"(?:\\.|[^"\\])*"))\],?\s*$/);
  if (!match) return null;
  try {
    return { key: JSON.parse(match[1]), pattern: JSON.parse(match[2]) };
  } catch {
    return null;
  }
}

function entriesBlock(lines) {
  const openLineIndex = lines.findIndex(
    (line) => /^\s*const ENTRIES = \[\s*$/.test(line));
  if (openLineIndex < 0) throw new Error("page pattern source is missing ENTRIES");
  const closeOffset = lines.slice(openLineIndex + 1).findIndex(
    (line) => /^\s*\];\s*$/.test(line));
  if (closeOffset < 0) throw new Error("page pattern source has an open ENTRIES block");
  return { openLineIndex, closeLineIndex: openLineIndex + closeOffset + 1 };
}

export function blankPattern(width, height = 9) {
  return Array.from({ length: height }, () => ".".repeat(width)).join("/");
}

export function parsePagePatternSource(
  source, { width, height = 9, allowedBytes },
) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const { openLineIndex, closeLineIndex } = entriesBlock(lines);
  const allowed = allowedByteSet(allowedBytes);
  const entries = [];
  let previousByte = -1;

  for (let lineIndex = openLineIndex + 1;
    lineIndex < closeLineIndex; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const entry = entryFromLine(line);
    if (!entry || !/^[0-9A-F]{2}$/.test(entry.key)) {
      throw new Error("page pattern entries need uppercase two-digit hexadecimal keys");
    }
    const byte = Number.parseInt(entry.key, 16);
    if (!allowed.has(byte)) {
      throw new Error(`page pattern byte 0x${entry.key} is not selectable`);
    }
    if (byte <= previousByte) {
      throw new Error("page pattern entries must be in ascending byte order");
    }
    validatePattern(entry.pattern, width, height);
    entries.push({ byte, pattern: entry.pattern, lineIndex });
    previousByte = byte;
  }

  return {
    authoredBytes: entries.map(({ byte }) => byte),
    closeLineIndex,
    entries,
    lines,
    newline,
    patterns: Object.fromEntries(entries.map(
      ({ byte, pattern }) => [byte, pattern])),
  };
}

export function replacePagePatternSource(source, options) {
  const { byte, pattern, previousPattern, width, height = 9 } = options;
  const allowed = allowedByteSet(options.allowedBytes);
  if (!Number.isInteger(byte) || !allowed.has(byte)) {
    throw badRequest("byte must identify a selectable extended page glyph");
  }
  validatePattern(pattern, width, height);
  if (previousPattern !== undefined) validatePattern(previousPattern, width, height);

  const parsed = parsePagePatternSource(source, {
    allowedBytes: allowed, width, height,
  });
  const entry = parsed.entries.find((value) => value.byte === byte);
  const currentPattern = entry?.pattern ?? blankPattern(width, height);
  if (previousPattern !== undefined && currentPattern !== previousPattern) {
    throw Object.assign(new Error("glyph changed on disk; reload before saving"),
      { status: 409 });
  }

  const line = `  ["${byteKey(byte)}", ${JSON.stringify(pattern)}],`;
  if (entry) {
    parsed.lines[entry.lineIndex] = line;
  } else {
    const next = parsed.entries.find((value) => value.byte > byte);
    parsed.lines.splice(next?.lineIndex ?? parsed.closeLineIndex, 0, line);
  }
  return parsed.lines.join(parsed.newline);
}
