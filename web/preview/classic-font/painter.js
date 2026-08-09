// Rasterizes browser glyph masks through a fixed-pitch dot lattice.
// Baseline rendering and compiler-authorized resident fallbacks share this painter.
import { paintLattice } from "./lattice.js";
import { paintTextMask } from "./text-mask.js";

const DOUBLE_STRIKE_OFFSET_PX = 0.55;

function sizeCanvas(canvas, width, height, padding) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssWidth = Math.max(1, width + padding * 2);
  const cssHeight = Math.max(1, height + padding * 2);
  canvas.width = Math.ceil(cssWidth * dpr);
  canvas.height = Math.ceil(cssHeight * dpr);
  canvas.style.left = `${-padding}px`;
  canvas.style.top = `${-padding}px`;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, dpr, cssWidth, cssHeight };
}

function createLayer(canvas, dpr) {
  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const context = layer.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { layer, context };
}

function paintCharacterLattices(
  context, text, origin, metrics, color, dotRadii,
) {
  const height = metrics.fontSize * metrics.repeats.y;
  for (const [index, character] of [...text].entries()) {
    if (character === " ") continue;
    paintLattice(context, {
      x: origin.x + index * metrics.advance,
      y: origin.y,
      width: metrics.bodyWidth,
      height,
    }, metrics.dotPitch, color, dotRadii);
  }
}

function buildInkLayer(
  canvas, dpr, dimensions, segment, metrics, style, color, options,
) {
  const { layer, context } = createLayer(canvas, dpr);
  const { layer: mask, context: maskContext } = createLayer(canvas, dpr);
  paintTextMask(maskContext, segment.text || "", dimensions.origin,
    metrics, style, "#fff", options);
  context.globalAlpha = style.emphasis ? 0.42 : 0.28;
  context.fillStyle = color;
  context.fillRect(0, 0, dimensions.width, dimensions.height);
  context.globalAlpha = 1;
  paintCharacterLattices(
    context, segment.text || "", dimensions.origin, metrics, color,
    options.dotRadii);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(mask, 0, 0);
  context.globalCompositeOperation = "source-over";
  return layer;
}

export function paintClassicSegment(
  canvas, segment, geometry, metrics, style, color, options = {},
) {
  const width = (segment.width_half_dots || 0) * geometry.xUnit;
  const height = (segment.character_cell_height_vertical_units || 0)
    * geometry.yUnit;
  const padding = metrics.dotPitch * 2;
  const sized = sizeCanvas(canvas, width, height, padding);
  const dimensions = {
    width: sized.cssWidth,
    height: sized.cssHeight,
    origin: {
      x: padding,
      y: padding + height - metrics.fontSize * metrics.repeats.y,
    },
  };
  const layer = buildInkLayer(
    canvas, sized.dpr, dimensions, segment, metrics, style, color, options);
  sized.context.setTransform(1, 0, 0, 1, 0, 0);
  if (style.double_strike) {
    sized.context.globalAlpha = 0.52;
    sized.context.drawImage(layer, 0, DOUBLE_STRIKE_OFFSET_PX * sized.dpr);
  }
  sized.context.globalAlpha = 1;
  sized.context.drawImage(layer, 0, 0);
}
