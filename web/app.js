// Orchestrates the source editor, receipt view, file actions, and live preview controllers.
// Domain modules own compilation, persistence, rendering, and interaction-specific state.
import { openBrowserFile, saveBrowserCopy, writeBrowserFile } from "./io/browser-files.js";
import { loadSession, saveSession } from "./io/session.js";
import {
  applySaveOutcome,
  createExclusiveSave,
  handleSaveShortcut,
  saveCurrentDocument,
} from "./orchestration/file-actions.js";
import { createPreviewRefresh } from "./orchestration/preview-refresh.js";
import { compilePreview, PreviewUnavailableError } from "./preview/client.js";
import { createDiagnosticsView } from "./preview/diagnostics.js";
import { createPreviewFontPreference } from "./ui/preview/font-preference.js";
import { createReceiptView } from "./preview/receipt.js";
import { createEditorView } from "./ui/editor.js";
import { createSourceSurface } from "./ui/editor/surface.js";
import { createLinkedScroll } from "./orchestration/scroll-sync.js";

const $ = (selector) => document.querySelector(selector);
const sourceSurface = createSourceSurface($("#source-editor"));
const editor = sourceSurface.element;
const renderState = $("#render-state");
const ui = createEditorView(sourceSurface, {
  cursor: $("#cursor-position"), count: $("#document-count"), name: $("#file-name"),
  dirty: $("#dirty-dot"), saveState: $("#save-state"), modeButtons: [...document.querySelectorAll("[data-mode]")],
  lineNumbers: $("#source-line-numbers"),
});
const receipt = createReceiptView({
  receipt: $("#receipt"), lines: $("#receipt-lines"), finish: $("#receipt-finish"),
  placeholder: $("#receipt-placeholder"), profile: $("#profile-card"),
});
createPreviewFontPreference({
  preview: $("#receipt"),
  buttons: [...document.querySelectorAll("[data-preview-font]")],
  onChange: receipt.setPreviewFont,
});
const linkedScroll = createLinkedScroll({
  editor,
  preview: $("#preview-scroll"),
  receipt: $("#receipt"),
  getAnchors: receipt.getSourceAnchors,
});
receipt.onLayout(linkedScroll.refresh);
const renderDiagnostics = createDiagnosticsView($("#diagnostics"));
const state = { name: "untitled.u220", plain: false, origin: "draft",
  handle: null, savedSource: null, sessionAvailable: false, documentRevision: 0,
  immutable: false };
let toastTimer;

function toast(message) {
  const node = $("#toast");
  clearTimeout(toastTimer);
  node.textContent = message;
  node.hidden = false;
  toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
}

function currentSource() { return sourceSurface.getSource(); }

function isDirty() { return state.savedSource !== currentSource(); }

function updateFileState() {
  ui.setFileState(state.name, isDirty(), state.savedSource !== null, state.immutable);
}

function setImmutable(value) {
  state.immutable = Boolean(value);
  ui.setReadOnly(state.immutable);
  [$("#open-button"), $("#save-button"), $("#save-copy-button")]
    .forEach((button) => { button.disabled = state.immutable; });
}

function setRenderState(label, tone) {
  renderState.dataset.tone = tone;
  renderState.querySelector("b").textContent = label;
}

const previewRefresh = createPreviewRefresh({
  compile: compilePreview,
  getPlain: () => state.plain,
  getSource: currentSource,
  isUnavailable: (error) => error instanceof PreviewUnavailableError,
  linkedScroll,
  receipt,
  renderDiagnostics,
  setRenderState,
  ui,
});

function setDocument(document, origin, handle = null) {
  const source = String(document.displaySource ?? document.source ?? "");
  state.name = document.name || "untitled.u220";
  state.plain = Boolean(document.plain);
  state.origin = origin;
  state.handle = handle;
  setImmutable(document.immutable);
  state.documentRevision += 1;
  previewRefresh.reset();
  state.savedSource = source;
  ui.setMode(state.plain);
  ui.setSource(source);
  updateFileState();
  previewRefresh.schedule(true);
}

async function openFile() {
  try {
    if (state.immutable) return toast("Direct image previews are read-only");
    if (isDirty() && !window.confirm("Discard unsaved changes and open another file?")) return;
    const document = await openBrowserFile($("#file-input"));
    if (!document) return;
    setDocument({ ...document, plain: state.plain }, "browser", document.handle);
    toast(`Opened ${document.name}`);
  } catch (error) { toast(`Couldn’t open that file: ${error.message}`); }
}

const saveFile = createExclusiveSave(async () => {
  if (state.immutable) return toast("Direct image previews are read-only");
  const source = currentSource();
  try {
    const outcome = await saveCurrentDocument(state, source, {
      hasSession: state.sessionAvailable,
      saveSession,
      writeBrowserFile,
    });
    if (outcome.unwritable) {
      toast(`Can’t update ${outcome.name}; use Save a copy`);
      return;
    }
    if (!applySaveOutcome(state, source, outcome)) {
      toast(`Saved ${outcome.name}; current document unchanged`);
      return;
    }
    updateFileState();
    toast(`Saved ${state.name}`);
  } catch (error) { toast(`Couldn’t save: ${error.message}`); }
}, () => toast("Save already in progress"));

async function saveCopy() {
  try {
    if (state.immutable) return toast("Direct image previews are read-only");
    const copy = await saveBrowserCopy(currentSource(), state.name);
    if (copy) toast(`Saved a copy of ${copy.name}`);
  } catch (error) { toast(`Couldn’t save a copy: ${error.message}`); }
}

editor.addEventListener("input", () => {
  updateFileState();
  previewRefresh.schedule();
});
document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
  state.plain = button.dataset.mode === "plain";
  ui.setDiagnostics([]);
  ui.setMode(state.plain);
  previewRefresh.schedule(true);
}));
$("#open-button").addEventListener("click", openFile);
$("#save-button").addEventListener("click", saveFile);
$("#save-copy-button").addEventListener("click", saveCopy);
window.addEventListener("beforeunload", (event) => {
  if (!isDirty()) return;
  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("keydown", (event) => handleSaveShortcut(event, {
  save: saveFile,
  saveCopy,
}), { capture: true });

const shellApi = window.U220Preview = window.U220Preview || {};
shellApi.refresh = previewRefresh.refresh;
shellApi.setSource = (source, options = {}) => {
  if (state.immutable) return false;
  setDocument({ source, name: options.name, plain: options.plain }, "draft");
  return true;
};
window.addEventListener("u220:compiler-ready", () => previewRefresh.refresh());

try {
  const session = await loadSession();
  state.sessionAvailable = Boolean(session);
  if (session) setDocument(session, "session");
  else { updateFileState(); previewRefresh.schedule(true); }
} catch (error) {
  updateFileState();
  previewRefresh.schedule(true);
  toast(`Using a new document: ${error.message}`);
}
