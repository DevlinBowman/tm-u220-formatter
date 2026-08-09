// Tracks preview-wide normal and double-strike dot diameters separately from glyph drafts.
// The model exposes physical millimeters only and rejects per-character appearance state.
const MINIMUM_MM = 0.1;
const MAXIMUM_MM = 0.6;

function normalize(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < MINIMUM_MM || number > MAXIMUM_MM) {
    throw new RangeError(`dot diameter must be ${MINIMUM_MM}–${MAXIMUM_MM} mm`);
  }
  return Math.round(number * 100) / 100;
}

function normalizedPair(value) {
  return { single: normalize(value.single), double: normalize(value.double) };
}

export class AppearanceModel {
  constructor(value) {
    this.saved = normalizedPair(value);
    this.initial = { ...this.saved };
    this.draft = { ...this.saved };
    this.mode = "single";
  }

  get value() { return { ...this.draft }; }
  get previous() { return { ...this.saved }; }
  get selectedDiameter() { return this.draft[this.mode]; }
  get dirty() {
    return this.draft.single !== this.saved.single
      || this.draft.double !== this.saved.double;
  }

  selectMode(mode) {
    if (mode !== "single" && mode !== "double") {
      throw new RangeError("strike study mode must be single or double");
    }
    this.mode = mode;
  }

  set(mode, value) {
    if (mode !== "single" && mode !== "double") {
      throw new RangeError("dot size is only defined for single or double strike");
    }
    this.draft[mode] = normalize(value);
  }

  revert() { this.draft = { ...this.saved }; }
  restoreInitial() { this.draft = { ...this.initial }; }

  markSaved(value) {
    this.saved = normalizedPair(value);
    this.draft = { ...this.saved };
  }
}
