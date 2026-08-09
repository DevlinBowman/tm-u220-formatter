function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function closest(values, target) {
  return values.reduce((best, value) => (
    Math.abs(value - target) < Math.abs(best - target) ? value : best
  ));
}

function groupedAnchors(anchors) {
  const groups = new Map();
  for (const anchor of anchors) {
    if (!Number.isFinite(anchor.sourceLine) || !Number.isFinite(anchor.paperY)) continue;
    const values = groups.get(anchor.sourceLine) || [];
    values.push(anchor.paperY);
    groups.set(anchor.sourceLine, values);
  }
  return [...groups].map(([sourceLine, paperYs]) => ({ sourceLine, paperYs }))
    .sort((a, b) => a.sourceLine - b.sourceLine);
}

export function paperYForSourceLine(anchors, sourceLine, currentPaperY = 0) {
  const groups = groupedAnchors(anchors);
  if (!groups.length) return null;
  const exact = groups.find((group) => group.sourceLine === sourceLine);
  if (exact) return closest(exact.paperYs, currentPaperY);
  const lower = [...groups].reverse().find((group) => group.sourceLine < sourceLine);
  const upper = groups.find((group) => group.sourceLine > sourceLine);
  if (!lower) return closest(upper.paperYs, currentPaperY);
  if (!upper) return closest(lower.paperYs, currentPaperY);
  const start = closest(lower.paperYs, currentPaperY);
  const finish = closest(upper.paperYs, currentPaperY);
  const ratio = (sourceLine - lower.sourceLine) / (upper.sourceLine - lower.sourceLine);
  return start + (finish - start) * ratio;
}

export function nearestSourceLine(anchors, paperY, currentSourceLine = 1) {
  const ranked = [...anchors].filter((anchor) =>
    Number.isFinite(anchor.sourceLine) && Number.isFinite(anchor.paperY));
  ranked.sort((a, b) => Math.abs(a.paperY - paperY) - Math.abs(b.paperY - paperY)
    || Math.abs(a.sourceLine - currentSourceLine)
      - Math.abs(b.sourceLine - currentSourceLine));
  return ranked[0]?.sourceLine || null;
}

export function editorLineAtCenter(metrics) {
  return Math.max(1, 1 + (metrics.scrollTop + metrics.clientHeight / 2
    - metrics.paddingTop) / metrics.lineHeight);
}

export function editorScrollForLine(line, metrics) {
  const target = metrics.paddingTop + (line - 1) * metrics.lineHeight
    - metrics.clientHeight / 2;
  return clamp(target, 0, metrics.maxScroll);
}

export function createLinkedScroll({ editor, preview, receipt, getAnchors }) {
  let enabled = false;
  let editorFrame = 0;
  let previewFrame = 0;
  const pendingScrolls = new WeakMap();

  function editorMetrics() {
    const style = getComputedStyle(editor);
    const fontSize = parseFloat(style.fontSize) || 13;
    return {
      scrollTop: editor.scrollTop,
      clientHeight: editor.clientHeight,
      paddingTop: parseFloat(style.paddingTop) || 0,
      lineHeight: parseFloat(style.lineHeight) || fontSize * 1.72,
      maxScroll: Math.max(0, editor.scrollHeight - editor.clientHeight),
    };
  }

  function receiptOffset() {
    const previewBox = preview.getBoundingClientRect();
    const receiptBox = receipt.getBoundingClientRect();
    return receiptBox.top - previewBox.top + preview.scrollTop;
  }

  function consumeProgrammaticScroll(node) {
    const pending = pendingScrolls.get(node);
    if (!pending) return false;
    pendingScrolls.delete(node);
    return Math.abs(node.scrollTop - pending.top) < 1;
  }

  function setScroll(node, value) {
    if (Math.abs(node.scrollTop - value) < 1) return;
    const pending = { top: value };
    pendingScrolls.set(node, pending);
    node.scrollTop = value;
    if (pendingScrolls.get(node) === pending) pending.top = node.scrollTop;
  }

  function fromEditor() {
    if (!enabled) return;
    const metrics = editorMetrics();
    const sourceLine = editorLineAtCenter(metrics);
    const offset = receiptOffset();
    const currentPaperY = preview.scrollTop + preview.clientHeight / 2 - offset;
    const paperY = paperYForSourceLine(getAnchors(), sourceLine, currentPaperY);
    if (paperY == null) return;
    const maximum = Math.max(0, preview.scrollHeight - preview.clientHeight);
    setScroll(preview,
      clamp(offset + paperY - preview.clientHeight / 2, 0, maximum));
  }

  function fromPreview() {
    if (!enabled) return;
    const metrics = editorMetrics();
    const paperY = preview.scrollTop + preview.clientHeight / 2 - receiptOffset();
    const line = nearestSourceLine(
      getAnchors(), paperY, editorLineAtCenter(metrics));
    if (line == null) return;
    setScroll(editor, editorScrollForLine(line, metrics));
  }

  editor.addEventListener("scroll", () => {
    if (consumeProgrammaticScroll(editor) || !enabled) return;
    cancelAnimationFrame(editorFrame);
    editorFrame = requestAnimationFrame(fromEditor);
  }, { passive: true });
  preview.addEventListener("scroll", () => {
    if (consumeProgrammaticScroll(preview) || !enabled) return;
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(fromPreview);
  }, { passive: true });

  return {
    setEnabled(value) {
      enabled = Boolean(value);
      if (enabled) return;
      cancelAnimationFrame(editorFrame);
      cancelAnimationFrame(previewFrame);
      editorFrame = 0;
      previewFrame = 0;
    },
    refresh() { if (enabled) fromEditor(); },
  };
}
