// Coordinates one selected-glyph update across button and keyboard entry points.
// Snapshot application preserves newer local dots while the fixed-target request is pending.
export function createGlyphSaveAction(options) {
  const {
    model, save, onBusy = () => {}, onChange = () => {},
    onError = () => {}, onSaved = () => {},
  } = options;
  let pending = false;

  async function run() {
    if (pending) {
      onBusy();
      return false;
    }
    if (!model.needsSave) return false;
    const snapshot = {
      font: model.font,
      page: model.page,
      byte: model.byte,
      pattern: model.pattern,
      previousPattern: model.savedPattern,
    };
    pending = true;
    onChange();
    try {
      const saved = await save(snapshot);
      for (const name of ["font", "page", "byte"]) {
        if (saved?.[name] !== undefined && saved[name] !== snapshot[name]) {
          throw new Error("glyph save response changed its selected target");
        }
      }
      const clean = model.markGlyphSaved(
        snapshot.font, snapshot.page, snapshot.byte, saved?.pattern ?? snapshot.pattern);
      onSaved({ clean, saved, snapshot });
      return true;
    } catch (error) {
      onError(error);
      return false;
    } finally {
      pending = false;
      onChange();
    }
  }

  return { get pending() { return pending; }, run };
}

export function handleGlyphSaveShortcut(event, action) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey
      || String(event.key).toLowerCase() !== "s") return false;
  event.preventDefault();
  if (!event.repeat) action();
  return true;
}

export function shouldWarnBeforeGlyphUnload({ appearanceDirty, dirtyCount, pending }) {
  return Boolean(appearanceDirty || dirtyCount || pending);
}
