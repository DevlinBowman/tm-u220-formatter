// Places compiler-owned preview segments and delegates each segment to its domain renderer.
// Text font selection never changes the physical geometry supplied by the compiler.
import { normalizePreviewFont } from "./font-mode.js";
import { renderBitImageSegment } from "./printhead/bit-image.js";
import { renderClassicSegment } from "./renderers/classic.js";
import { renderStrikeSegment } from "./renderers/strike.js";

function addClass(node, name, condition) {
  if (condition) node.classList.add(name);
}

export function normalizedSourceLine(span, offset = 0) {
  const line = Number(span?.start_line);
  return Number.isFinite(line) ? Math.max(1, line - offset) : null;
}

export function segmentBox(segment, line, geometry) {
  const height = (segment.character_cell_height_vertical_units || 0)
    * geometry.yUnit;
  const lineHeight = (line.glyph_height_vertical_units || 0) * geometry.yUnit;
  return {
    left: (segment.x_half_dots || 0) * geometry.xUnit,
    top: Math.max(0, lineHeight - height),
    width: (segment.width_half_dots || 0) * geometry.xUnit,
    height,
  };
}

export function createSegmentNode(
  segment, line, geometry, profile, sourceOffset, previewFont,
) {
  const style = segment.style || {};
  const box = segmentBox(segment, line, geometry);
  const node = document.createElement("span");

  node.className = "receipt-segment";
  node.style.left = `${box.left}px`;
  node.style.top = `${box.top}px`;
  node.style.width = `${box.width}px`;
  node.style.height = `${box.height}px`;
  node.style.setProperty("--ribbon", style.color === "red"
    ? "var(--paper-red)" : "var(--paper-ink)");
  node.dataset.sourceLine = normalizedSourceLine(
    segment.source_span, sourceOffset) || "";
  addClass(node, "font-a", style.font === "a");
  addClass(node, "is-emphasis", style.emphasis);
  addClass(node, "is-double-strike", style.double_strike);
  addClass(node, "is-underlined", !segment.preview_only
    && style.underline && style.underline !== "off");

  if (segment.kind === "bit_image") {
    node.classList.add("is-bit-image");
    renderBitImageSegment(node, segment, geometry);
  } else if (normalizePreviewFont(previewFont) === "strike") {
    renderStrikeSegment(node, segment, geometry, profile, style);
  } else {
    renderClassicSegment(node, segment, geometry, profile, style);
  }
  return node;
}
