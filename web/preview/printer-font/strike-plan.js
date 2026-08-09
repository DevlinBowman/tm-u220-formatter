import { glyphFor } from "./atlas.js";

const ROW_PITCH_VERTICAL_UNITS = 2;
// Wide mode repeats a full impact one nominal dot pitch away. Authored atlas
// columns themselves remain consecutive half-dot positions through `column`.
const WIDE_COPY_PITCH_HALF_DOTS = 2;

function bitIsSet(mask, width, column) {
  return Boolean(mask & (1 << (width - column - 1)));
}

export function strikePasses(style = {}) {
  const passes = [{ xHalfDots: 0, yVerticalUnits: 0, strength: 1 }];
  if (style.emphasis) {
    passes.push({ xHalfDots: 0.46, yVerticalUnits: 0, strength: 0.72 });
  }
  if (style.double_strike) {
    passes.push({ xHalfDots: 0, yVerticalUnits: 0.58, strength: 0.68 });
  }
  if (style.emphasis && style.double_strike) {
    passes.push({ xHalfDots: 0.46, yVerticalUnits: 0.58, strength: 0.42 });
  }
  return passes;
}

function glyphDots(character, font, origin, repeats) {
  const glyph = glyphFor(font, character);
  const dots = [];
  for (const [row, mask] of glyph.rows.entries()) {
    for (let column = 0; column < glyph.width; column += 1) {
      if (!bitIsSet(mask, glyph.width, column)) continue;
      for (let copyY = 0; copyY < repeats.y; copyY += 1) {
        for (let copyX = 0; copyX < repeats.x; copyX += 1) {
          dots.push({
            xHalfDots: origin + column * repeats.x
              + copyX * WIDE_COPY_PITCH_HALF_DOTS + 0.5,
            yVerticalUnits: row * ROW_PITCH_VERTICAL_UNITS * repeats.y
              + copyY * ROW_PITCH_VERTICAL_UNITS + 1,
            key: character.charCodeAt(0) * 131 + row * 17 + column * 7
              + copyY * 3 + copyX + Math.round(origin * 11),
          });
        }
      }
    }
  }
  return dots;
}

function underlineRows(segment, style) {
  if (segment.preview_only || !style.underline || style.underline === "off") {
    return [];
  }
  const bottom = Math.max(1,
    (segment.character_cell_height_vertical_units || 18) - 1);
  // TM-U220 treats both supported underline-on values as one dot thick.
  return [bottom];
}

export function planSegmentStrikes(segment) {
  const style = segment.style || {};
  const font = style.font === "a" ? "a" : "b";
  const repeats = {
    x: style.double_width ? 2 : 1,
    y: style.double_height ? 2 : 1,
  };
  const advance = segment.character_advance_half_dots || 10;
  const dots = [];
  for (const [index, character] of [...(segment.text || "")].entries()) {
    if (character !== " ") {
      dots.push(...glyphDots(character, font, index * advance, repeats));
    }
  }
  return {
    dots,
    passes: strikePasses(style),
    underlineRows: underlineRows(segment, style),
    widthHalfDots: segment.width_half_dots || 0,
  };
}
