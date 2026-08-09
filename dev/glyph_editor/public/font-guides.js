// Declares the editor's explicit baseline convention for reconstructed resident glyphs.
// These authoring guides are not Epson font data and never enter masks or printer output.
const GUIDES = Object.freeze({
  a: Object.freeze({ authoringBaselineAfterRow: 8 }),
  b: Object.freeze({ authoringBaselineAfterRow: 8 }),
});

export function fontAuthoringGuide(font, matrixHeight) {
  const guide = GUIDES[font];
  if (!guide || !Number.isInteger(matrixHeight)
    || guide.authoringBaselineAfterRow >= matrixHeight) {
    throw new RangeError("font authoring guide requires a supported glyph matrix");
  }
  return Object.freeze({
    ...guide,
    alignmentEdgeAfterRow: matrixHeight,
  });
}
