// Derives browser-glyph dimensions from compiler geometry and the selected printer font profile.
// Both the Baseline renderer and code-page fallback consume this shared, presentation-neutral model.
import { repeatFactors } from "./dot-plan.js";

const MONO_ADVANCE_EM = 0.6;
const VISUAL_HEIGHT_SCALE = 1.1;
const DOT_PATTERN_PX = 1.45;
const EMPHASIS_DOT_PATTERN_PX = 1.2;

export function classicMetrics(segment, geometry, profile, style = {}) {
  const fontName = style.font || profile.defaults?.font
    || profile.default_font || "b";
  const font = profile.fonts?.[fontName] || {};
  const repeats = repeatFactors(style);
  const dotPitch = style.emphasis
    ? EMPHASIS_DOT_PATTERN_PX : DOT_PATTERN_PX;
  const advance = (segment.character_advance_half_dots || 10) * geometry.xUnit;
  const fontSize = (font.character_height_micrometers || 3100)
    / 1000 * geometry.scale * VISUAL_HEIGHT_SCALE;
  const normalBodyWidth = (font.character_width_micrometers || 1200)
    / 1000 * geometry.scale;
  const normalGlyphScaleX = normalBodyWidth / (fontSize * MONO_ADVANCE_EM);
  return {
    advance,
    bodyWidth: normalBodyWidth * repeats.x,
    normalBodyWidth,
    fontSize,
    glyphScaleX: normalGlyphScaleX * repeats.x,
    normalGlyphScaleX,
    yScale: repeats.y,
    repeats,
    xRepeat: repeats.x,
    yRepeat: repeats.y,
    expanded: repeats.x > 1 || repeats.y > 1,
    dotPitch,
  };
}
