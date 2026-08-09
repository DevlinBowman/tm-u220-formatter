// Paints full impacts at the printer's 1/160-inch horizontal and 1/72-inch row pitches.
// Adjacent columns overlap by design; a half-dot is only a strike-center offset.
export const GLYPH_STUDY_GEOMETRY = Object.freeze({
  halfDotMm: 25.4 / 160,
  pinRowMm: 25.4 / 72,
  doubleStrikeOffsetMm: 0.58 * 25.4 / 144,
  verticalUnitsPerPin: 2,
  defaultLinePitchVerticalUnits: 24,
});
const { halfDotMm: HALF_DOT_MM, pinRowMm: PIN_ROW_MM,
  doubleStrikeOffsetMm: DOUBLE_STRIKE_OFFSET_MM } = GLYPH_STUDY_GEOMETRY;
const BLEED_EXTENSION_MM = 0.05;
const MAXIMUM_SCALE = 34;
const STUDY_PADDING = 16;

export function studyCellGeometry(width, height, characterSpacingHalfDots = 3) {
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || ![2, 3].includes(characterSpacingHalfDots)) {
    throw new TypeError("study geometry requires a glyph matrix and two- or three-half-dot-position character spacing");
  }
  const matrixHeightVerticalUnits = height
    * GLYPH_STUDY_GEOMETRY.verticalUnitsPerPin;
  return {
    widthHalfDots: width,
    heightPins: height,
    characterSpacingHalfDots,
    advanceHalfDots: width + characterSpacingHalfDots,
    alignmentEdgeAfterRow: height,
    matrixHeightVerticalUnits,
    defaultLinePitchVerticalUnits:
      GLYPH_STUDY_GEOMETRY.defaultLinePitchVerticalUnits,
    lineSpacingOutsideMatrixVerticalUnits: Math.max(0,
      GLYPH_STUDY_GEOMETRY.defaultLinePitchVerticalUnits
        - matrixHeightVerticalUnits),
  };
}

function circle(context, x, y, radius, alpha) {
  context.globalAlpha = alpha;
  context.fillStyle = "#25241f";
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function impact(context, x, y, diameter, scale, strength = 1) {
  const core = diameter * scale / 2;
  const bleed = (diameter / 2 + BLEED_EXTENSION_MM) * scale;
  circle(context, x, y, bleed, 0.18 * strength);
  circle(context, x, y, core, 0.94 * strength);
}

export function createGlyphStudy(canvas) {
  let current = null;

  function draw() {
    if (!current) return;
    const { rows, glyphRows, diameter, doubleStrike,
      characterSpacingHalfDots } = current;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const geometry = studyCellGeometry(
      rows[0].length, rows.length, characterSpacingHalfDots);
    const glyphs = Array.isArray(glyphRows) ? glyphRows : [rows];
    if (!glyphs.length) {
      context.globalAlpha = 1;
      return;
    }
    const widthHalfDots = geometry.widthHalfDots * glyphs.length
      + geometry.characterSpacingHalfDots * (glyphs.length - 1);
    const widthMm = widthHalfDots * HALF_DOT_MM;
    const heightMm = rows.length * PIN_ROW_MM;
    const scale = Math.min(MAXIMUM_SCALE,
      (width - STUDY_PADDING * 2) / widthMm,
      (height - STUDY_PADDING * 2) / heightMm);
    const advance = geometry.advanceHalfDots * HALF_DOT_MM * scale;
    const studyWidth = widthMm * scale;
    const studyHeight = heightMm * scale;
    const left = (width - studyWidth) / 2;
    const top = (height - studyHeight) / 2;
    for (const [copy, glyphRows] of glyphs.entries()) {
      for (const [row, values] of glyphRows.entries()) {
        for (const [column, active] of values.entries()) {
          if (!active) continue;
          const x = left + HALF_DOT_MM * scale / 2
            + copy * advance + column * HALF_DOT_MM * scale;
          const y = top + (row + 0.5) * PIN_ROW_MM * scale;
          impact(context, x, y, diameter, scale);
          if (doubleStrike) {
            impact(context, x, y + DOUBLE_STRIKE_OFFSET_MM * scale,
              diameter, scale, 0.68);
          }
        }
      }
    }
    context.globalAlpha = 1;
  }

  new ResizeObserver(draw).observe(canvas);
  return {
    render(rows, options) {
      current = { rows, diameter: options.diameter,
        glyphRows: options.glyphRows,
        characterSpacingHalfDots: options.characterSpacingHalfDots || 3,
        doubleStrike: options.mode === "double" };
      draw();
    },
  };
}
