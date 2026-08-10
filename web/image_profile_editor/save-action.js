// Coordinates exclusive fixed-profile saves and standard primary-key shortcuts.
// A completed request updates the saved revision while preserving any newer local draft.
export function createProfileSaveAction(options) {
  const {
    model, save, onBusy = () => {}, onChange = () => {},
    onError = () => {}, onSaved = () => {},
  } = options;
  let pending = false;

  async function run() {
    if (pending) { onBusy(); return false; }
    if (!model.dirty) return false;
    const snapshot = { source: model.source, revision: model.revision };
    pending = true;
    onChange();
    try {
      const session = await save(snapshot.source, snapshot.revision);
      const clean = model.applySession(session, false, snapshot.source);
      onSaved({ clean, session, snapshot });
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

export function handleProfileSaveShortcut(event, action) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey
      || String(event.key).toLowerCase() !== "s") return false;
  event.preventDefault();
  if (!event.repeat) action();
  return true;
}

export function shouldWarnBeforeProfileUnload(model, pending) {
  return Boolean(model?.dirty || pending);
}
