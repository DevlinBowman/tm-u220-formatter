// Composes exact ASCII strikes with browser-backed resident code-page glyphs.
// The compiler owns Unicode eligibility and every cell's geometry.
import { paintClassicSegment } from "../classic-font/painter.js";
import { classicMetrics } from "../classic-font/metrics.js";
import { paintSegment } from "../printer-font/painter.js";
import { impactRadii } from "../printer-font/appearance.js";
import { previewGlyphLayers } from "../printer-font/glyph-layers.js";
import { ribbonColor } from "./ink.js";

function canvas(className) {
  const node = document.createElement("canvas");
  node.className = className;
  node.setAttribute("aria-hidden", "true");
  return node;
}

export function renderStrikeSegment(
  node, segment, geometry, profile, style,
) {
  if (segment.preview_only) return;
  const layers = previewGlyphLayers(segment);
  const color = ribbonColor(style);
  const strikes = canvas("receipt-strike-canvas");
  paintSegment(strikes, { ...segment, text: layers.strikeText }, geometry, color);
  node.append(strikes);

  if (!layers.hasFallback) return;
  const fallbackSegment = { ...segment, text: layers.fallbackText };
  const fallback = canvas("receipt-strike-canvas receipt-code-page-canvas");
  const metrics = classicMetrics(fallbackSegment, geometry, profile, style);
  const physical = impactRadii(style);
  paintClassicSegment(
    fallback, fallbackSegment, geometry, metrics, style, color,
    { fitToCell: true, dotRadii: {
      core: physical.coreRadiusMm * geometry.scale,
      bleed: physical.bleedRadiusMm * geometry.scale,
    } });
  node.append(fallback);
}
