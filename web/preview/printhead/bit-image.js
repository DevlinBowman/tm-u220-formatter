// Decodes compiler-authorized printhead masks and paints their exact physical strike cells.
// This keeps bit-image interpretation separate from resident-font preview rendering.
import { impactRadii } from "../printer-font/appearance.js";
import { ribbonColor } from "../renderers/ink.js";

function integer(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function dimensions(segment) {
  const widthDots = integer(segment.mask_width_dots, "mask_width_dots");
  const heightDots = integer(segment.mask_height_dots, "mask_height_dots");
  const step = integer(segment.column_step_half_dots, "column_step_half_dots");
  if (step !== 1 && step !== 2) {
    throw new TypeError("column_step_half_dots must be 1 or 2");
  }
  if (segment.width_half_dots !== widthDots * step) {
    throw new TypeError("width_half_dots does not match the printhead mask");
  }
  if (segment.character_cell_height_vertical_units !== heightDots * 2) {
    throw new TypeError(
      "character_cell_height_vertical_units does not match the printhead mask",
    );
  }
  return { widthDots, heightDots, step, stride: Math.ceil(widthDots / 8) };
}

function maskBytes(segment, expected) {
  if (segment.mask_encoding !== "hex-msb-rows") {
    throw new TypeError("unsupported bit-image mask encoding");
  }
  const hex = segment.mask_data;
  if (typeof hex !== "string" || !/^[0-9a-f]*$/i.test(hex)
      || hex.length !== expected * 2) {
    throw new TypeError("mask_data does not match the bit-image dimensions");
  }
  return Uint8Array.from(
    { length: expected }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

export function bitImagePlan(segment) {
  const { widthDots, heightDots, step, stride } = dimensions(segment);
  const bytes = maskBytes(segment, stride * heightDots);
  const dots = [];
  for (let row = 0; row < heightDots; row += 1) {
    for (let column = 0; column < widthDots; column += 1) {
      const byte = bytes[row * stride + Math.floor(column / 8)];
      if ((byte & (0x80 >> (column % 8))) === 0) continue;
      dots.push({
        xHalfDots: column * step + step / 2,
        yVerticalUnits: row * 2 + 1,
      });
    }
  }
  return {
    dots,
    widthHalfDots: widthDots * step,
    heightVerticalUnits: heightDots * 2,
  };
}

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
  return context;
}

function circle(context, x, y, radius, color, alpha) {
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

export function paintBitImage(canvas, segment, geometry, color) {
  const plan = bitImagePlan(segment);
  const radii = impactRadii(segment.style);
  const core = radii.coreRadiusMm * geometry.scale;
  const bleed = radii.bleedRadiusMm * geometry.scale;
  const padding = bleed + geometry.xUnit;
  const width = plan.widthHalfDots * geometry.xUnit;
  const height = plan.heightVerticalUnits * geometry.yUnit;
  const context = sizeCanvas(canvas, width, height, padding);
  context.clearRect(0, 0, width + padding * 2, height + padding * 2);
  for (const dot of plan.dots) {
    const x = padding + dot.xHalfDots * geometry.xUnit;
    const y = padding + dot.yVerticalUnits * geometry.yUnit;
    circle(context, x, y, bleed, color, 0.18);
    circle(context, x, y, core, color, 0.94);
    circle(context, x - core * 0.12, y - core * 0.1, core * 0.56, color, 0.18);
  }
  context.globalAlpha = 1;
  return plan;
}

export function renderBitImageSegment(node, segment, geometry) {
  const canvas = document.createElement("canvas");
  canvas.className = "receipt-strike-canvas receipt-bit-image-canvas";
  canvas.setAttribute("aria-hidden", "true");
  paintBitImage(canvas, segment, geometry, ribbonColor(segment.style || {}));
  node.append(canvas);
}
