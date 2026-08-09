// Declares the preview-wide physical impact sizes for normal and double-strike text.
// These tuning values affect rendered ink only; glyph masks, layout, and printer bytes stay unchanged.
export const SINGLE_STRIKE_DOT_DIAMETER_MM = 0.30;
export const DOUBLE_STRIKE_DOT_DIAMETER_MM = 0.28;
export const RIBBON_BLEED_EXTENSION_MM = 0.05;

export function impactRadii(style = {}) {
  const diameter = style.double_strike
    ? DOUBLE_STRIKE_DOT_DIAMETER_MM : SINGLE_STRIKE_DOT_DIAMETER_MM;
  const coreRadiusMm = diameter / 2;
  return {
    coreRadiusMm,
    bleedRadiusMm: coreRadiusMm + RIBBON_BLEED_EXTENSION_MM,
  };
}
