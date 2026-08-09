// Derives receipt-line frame dimensions from compiler-owned paper geometry.
export function lineFrameLayout(line, geometry) {
  const advanceUnits = line.line_advance_vertical_units
    || line.line_spacing_vertical_units || 0;
  const glyphUnits = line.glyph_height_vertical_units || 0;
  return {
    advanceHeight: advanceUnits * geometry.yUnit,
    contentHeight: glyphUnits * geometry.yUnit,
    upsideDown: Boolean(line.segments?.some(
      (segment) => segment.style?.upside_down)),
  };
}
