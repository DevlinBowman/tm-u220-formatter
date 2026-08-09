import { planSegmentStrikes } from "./strike-plan.js";
import { impactRadii } from "./appearance.js";

const JITTER_MM = 0.006;

function noise(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value) - 0.5;
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

function paintImpact(
  context, x, y, coreRadius, bleedRadius, color, strength, seed,
) {
  const variation = 1 + noise(seed) * 0.05;
  const core = coreRadius * variation;
  const bleed = bleedRadius * variation;
  circle(context, x, y, bleed, color, 0.18 * strength);
  circle(context, x, y, core, color, 0.94 * strength);
  circle(context, x - core * 0.12, y - core * 0.1,
    core * 0.56, color, 0.18 * strength);
}

function paintUnderlines(
  context, plan, geometry, padding, coreRadius, bleedRadius, color,
) {
  for (const row of plan.underlineRows) {
    for (let halfDot = 0; halfDot < plan.widthHalfDots; halfDot += 1) {
      paintImpact(context,
        padding + (halfDot + 0.5) * geometry.xUnit,
        padding + row * geometry.yUnit,
        coreRadius, bleedRadius, color, 0.9, row * 409 + halfDot);
    }
  }
}

export function paintSegment(canvas, segment, geometry, color) {
  const plan = planSegmentStrikes(segment);
  const radii = impactRadii(segment.style);
  const coreRadius = radii.coreRadiusMm * geometry.scale;
  const bleedRadius = radii.bleedRadiusMm * geometry.scale;
  const padding = bleedRadius + geometry.xUnit;
  const width = (segment.width_half_dots || 0) * geometry.xUnit;
  const height = (segment.character_cell_height_vertical_units || 0)
    * geometry.yUnit;
  const context = sizeCanvas(canvas, width, height, padding);
  context.clearRect(0, 0, width + padding * 2, height + padding * 2);

  for (const dot of plan.dots) {
    for (const [index, pass] of plan.passes.entries()) {
      const jitterX = noise(dot.key + index * 41) * JITTER_MM * geometry.scale;
      const jitterY = noise(dot.key + index * 67) * JITTER_MM * geometry.scale;
      paintImpact(context,
        padding + (dot.xHalfDots + pass.xHalfDots) * geometry.xUnit + jitterX,
        padding + (dot.yVerticalUnits + pass.yVerticalUnits) * geometry.yUnit
          + jitterY,
        coreRadius, bleedRadius, color, pass.strength, dot.key + index * 97);
    }
  }
  paintUnderlines(
    context, plan, geometry, padding, coreRadius, bleedRadius, color);
}
