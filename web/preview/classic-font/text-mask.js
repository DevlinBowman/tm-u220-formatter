// Paints calibrated browser text into the dotted Baseline mask.
// Code-page fallbacks may fit and clip each glyph to its compiler-owned printer cell.
import { browserGlyph } from "./presentation.js";

const FONT_FAMILY = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

function weightFor(style) {
  if (style.emphasis) return 800;
  return style.font === "a" ? 550 : 500;
}

export function paintTextMask(
  context, text, origin, metrics, style, fillStyle = "#fff", options = {},
) {
  context.save();
  context.fillStyle = fillStyle;
  context.font = `${weightFor(style)} ${metrics.fontSize}px ${FONT_FAMILY}`;
  context.textBaseline = "bottom";
  for (const [index, character] of [...text].entries()) {
    if (character === " ") continue;
    const visibleCharacter = browserGlyph(character);
    const cellX = origin.x + index * metrics.advance;
    let offsetX = 0;
    let scaleX = metrics.glyphScaleX;
    if (options.fitToCell) {
      const measured = Math.max(1, context.measureText(visibleCharacter).width);
      scaleX = Math.min(scaleX, metrics.bodyWidth / measured);
      offsetX = Math.max(0, (metrics.bodyWidth - measured * scaleX) / 2);
    }
    context.save();
    if (options.fitToCell) {
      context.beginPath();
      context.rect(
        cellX, origin.y, metrics.advance, metrics.fontSize * metrics.yScale);
      context.clip();
    }
    context.translate(cellX + offsetX, origin.y);
    context.scale(scaleX, metrics.yScale);
    context.fillText(visibleCharacter, 0, metrics.fontSize);
    context.restore();
  }
  context.restore();
}
