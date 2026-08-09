// Renders the optional Baseline preview with browser glyphs calibrated to printer geometry.
import { paintClassicSegment } from "../classic-font/painter.js";
import { classicMetrics } from "../classic-font/metrics.js";
import { browserGlyph } from "../classic-font/presentation.js";
import { ribbonColor } from "./ink.js";

export { classicMetrics } from "../classic-font/metrics.js";

function glyphNode(character, metrics) {
  const glyph = document.createElement("span");
  glyph.className = "receipt-glyph";
  glyph.textContent = browserGlyph(character);
  glyph.style.fontSize = `${metrics.fontSize}px`;
  glyph.style.setProperty("--glyph-scale-x", metrics.glyphScaleX);
  glyph.style.setProperty("--glyph-scale-y", metrics.yScale);
  return glyph;
}

function characterNode(character, index, metrics) {
  const cell = document.createElement("span");
  cell.className = "receipt-character";
  cell.style.left = `${index * metrics.advance}px`;
  cell.style.width = `${metrics.advance}px`;
  if (character !== " ") cell.append(glyphNode(character, metrics));
  return cell;
}

export function renderClassicSegment(node, segment, geometry, profile, style) {
  const metrics = classicMetrics(segment, geometry, profile, style);
  if (metrics.expanded) {
    const canvas = document.createElement("canvas");
    canvas.className = "receipt-strike-canvas receipt-classic-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.dotRepeat = `${metrics.repeats.x}x${metrics.repeats.y}`;
    paintClassicSegment(
      canvas, segment, geometry, metrics, style, ribbonColor(style));
    node.append(canvas);
    return;
  }
  const ink = document.createElement("span");
  ink.className = "receipt-ink";
  ink.setAttribute("aria-hidden", "true");
  for (const [index, character] of [...(segment.text || "")].entries()) {
    ink.append(characterNode(character, index, metrics));
  }
  node.append(ink);
}
