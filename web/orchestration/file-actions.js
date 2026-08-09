// Routes primary saves to the active writable file or fixed preview session.
// Copy actions remain explicit and never silently establish a false clean state.
export async function saveCurrentDocument(document, source, services) {
  const target = {
    documentRevision: document.documentRevision,
    handle: document.handle,
    name: document.name,
    origin: document.origin,
  };
  if (target.origin === "browser" && target.handle) {
    await services.writeBrowserFile(target.handle, source);
    return { ...target, persisted: true };
  }
  if (target.origin === "session" && services.hasSession) {
    const response = await services.saveSession(source);
    return { persisted: true, origin: "session", handle: null,
      name: response.name || target.name,
      documentRevision: target.documentRevision };
  }
  return { ...target, persisted: false, unwritable: true };
}

export function applySaveOutcome(document, source, outcome) {
  if (!outcome?.persisted) return false;
  if (outcome.documentRevision !== document.documentRevision) return false;
  document.origin = outcome.origin;
  document.handle = outcome.handle;
  document.name = outcome.name;
  document.savedSource = source;
  return true;
}

export function createExclusiveSave(action, onBusy) {
  let pending = false;
  return async function exclusiveSave() {
    if (pending) {
      onBusy();
      return false;
    }
    pending = true;
    try {
      await action();
      return true;
    } finally {
      pending = false;
    }
  };
}

export function handleSaveShortcut(event, actions) {
  if (!(event.metaKey || event.ctrlKey)
      || String(event.key).toLowerCase() !== "s") return false;
  event.preventDefault();
  if (event.repeat) return true;
  if (event.shiftKey) actions.saveCopy();
  else actions.save();
  return true;
}
