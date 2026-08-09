// Parses and rewrites the two global dot-diameter constants used by receipt preview ink.
// Values are physical millimeters and cannot carry glyph, layout, or printer state.
const FIELDS = Object.freeze({
  single: "SINGLE_STRIKE_DOT_DIAMETER_MM",
  double: "DOUBLE_STRIKE_DOT_DIAMETER_MM",
});

export const DOT_DIAMETER_RANGE_MM = Object.freeze({ minimum: 0.1, maximum: 0.6 });

function validateDiameter(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)
    || value < DOT_DIAMETER_RANGE_MM.minimum
    || value > DOT_DIAMETER_RANGE_MM.maximum) {
    throw Object.assign(new Error(
      `${label} dot diameter must be ${DOT_DIAMETER_RANGE_MM.minimum}–${DOT_DIAMETER_RANGE_MM.maximum} mm`),
    { status: 400 });
  }
  return Math.round(value * 100) / 100;
}

export function validateAppearance(value) {
  return {
    single: validateDiameter(value?.single, "single-strike"),
    double: validateDiameter(value?.double, "double-strike"),
  };
}

export function parseAppearanceSource(source) {
  const value = {};
  for (const [key, name] of Object.entries(FIELDS)) {
    const match = source.match(new RegExp(
      `^export const ${name} = (\\d+(?:\\.\\d+)?);$`, "m"));
    if (!match) throw new Error(`preview appearance is missing ${name}`);
    value[key] = Number(match[1]);
  }
  return validateAppearance(value);
}

export function replaceAppearanceSource(source, value, previous) {
  const next = validateAppearance(value);
  const current = parseAppearanceSource(source);
  if (previous && (current.single !== previous.single
    || current.double !== previous.double)) {
    throw Object.assign(new Error(
      "dot sizes changed on disk; reload before saving"), { status: 409 });
  }
  let updated = source;
  for (const [key, name] of Object.entries(FIELDS)) {
    updated = updated.replace(
      new RegExp(`^export const ${name} = \\d+(?:\\.\\d+)?;$`, "m"),
      `export const ${name} = ${next[key].toFixed(2)};`);
  }
  return updated;
}
