export const DOT_RADII = Object.freeze({
  core: 0.5 / Math.SQRT2,
  bleed: 0.61 / Math.SQRT2,
});

export function latticeOffsets(extent, pitch) {
  const offsets = [];
  for (let offset = pitch / 2; offset < extent; offset += pitch) {
    offsets.push(offset);
  }
  return offsets;
}

function circle(context, x, y, radius, color, alpha) {
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

export function paintLattice(context, bounds, pitch, color, radii = {}) {
  const xs = latticeOffsets(bounds.width, pitch);
  const ys = latticeOffsets(bounds.height, pitch);
  const coreRadius = radii.core ?? pitch * DOT_RADII.core;
  const bleedRadius = radii.bleed ?? pitch * DOT_RADII.bleed;
  for (const y of ys) {
    for (const x of xs) {
      circle(context, bounds.x + x, bounds.y + y,
        bleedRadius, color, 0.2);
      circle(context, bounds.x + x, bounds.y + y,
        coreRadius, color, 0.94);
    }
  }
  context.globalAlpha = 1;
}
