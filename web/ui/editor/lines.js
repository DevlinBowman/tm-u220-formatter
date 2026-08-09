export function sourceLines(source) {
  return String(source).split("\n");
}

export function diagnosticErrorLines(items = [], sourceLineOffset = 0,
  sourceLineCount = Infinity) {
  const lines = new Set();
  for (const item of items) {
    if (item?.severity === "warning") continue;
    const start = Number(item?.span?.start_line ?? item?.span?.line);
    if (!Number.isInteger(start)) continue;
    const candidateEnd = Number(item?.span?.end_line ?? start);
    const end = Number.isInteger(candidateEnd) ? Math.max(start, candidateEnd) : start;
    const first = Math.max(1, start - sourceLineOffset);
    const last = Math.min(sourceLineCount, end - sourceLineOffset);
    for (let line = first; line <= last; line += 1) lines.add(line);
  }
  return lines;
}
