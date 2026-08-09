import { openBrowserFile, saveBrowserCopy, writeBrowserFile } from "./io/browser-files.js";
import { hasHttpSession, loadSession, saveSession } from "./io/session.js";
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
const state = { name: "untitled.u220", plain: false, origin: "draft", handle: null, savedSource: null, timer: 0, revision: 0, controller: null, hasPreview: false };
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
  ui.setFileState(state.name, isDirty(), state.savedSource !== null);
}

function setRenderState(label, tone) {
  renderState.dataset.tone = tone;
  renderState.querySelector("b").textContent = label;
}

function setDocument(document, origin, handle = null) {
  const source = String(document.source ?? "");
  state.name = document.name || "untitled.u220";
  state.plain = Boolean(document.plain);
  state.origin = origin;
  state.handle = handle;
  state.hasPreview = false;
  linkedScroll.setEnabled(false);
  state.savedSource = source;
  receipt.render(null);
  ui.setMode(state.plain);
  ui.setSource(source);
  updateFileState();
  schedulePreview(true);
}

async function renderPreview() {
  const revision = ++state.revision;
  state.controller?.abort();
  state.controller = new AbortController();
  setRenderState("Rendering", "working");
  try {
    const result = await compilePreview(currentSource(), state.plain, state.controller.signal);
    if (revision !== state.revision) return;
    const diagnostics = result?.diagnostics || [];
    const sourceLineOffset = result?.source_line_offset || 0;
    ui.setDiagnostics(diagnostics, sourceLineOffset);
    const counts = renderDiagnostics(diagnostics, sourceLineOffset);
    if (counts.errors) {
      linkedScroll.setEnabled(false);
      if (state.hasPreview) receipt.render({ ...result, valid: false });
      else receipt.showPlaceholder("Fix source errors", "The formatter needs a valid document before it can draw the receipt.");
      setRenderState(`${counts.errors} error${counts.errors === 1 ? "" : "s"}`, "error");
      return;
    }
    const lineCount = receipt.render(result || {});
    state.hasPreview = true;
    linkedScroll.setEnabled(true);
    linkedScroll.refresh();
    if (counts.warnings) setRenderState(`${counts.warnings} warning${counts.warnings === 1 ? "" : "s"}`, "ready");
    else setRenderState(`${lineCount} line${lineCount === 1 ? "" : "s"}`, "ready");
  } catch (error) {
    if (error.name === "AbortError" || revision !== state.revision) return;
    if (error instanceof PreviewUnavailableError) {
      linkedScroll.setEnabled(false);
      receipt.showPlaceholder("Preview engine isn’t connected", "Open this workspace through the U220 preview command, or attach a browser compiler.");
      ui.setDiagnostics([]);
      renderDiagnostics([]);
      setRenderState("Offline", "idle");
      return;
    }
    linkedScroll.setEnabled(false);
    if (state.hasPreview) receipt.render({ valid: false });
    else receipt.showPlaceholder("Preview unavailable", "The formatter could not render this document.");
    const diagnostics = [{ severity: "error", code: "PREVIEW_FAILED", message: error.message, span: {} }];
    ui.setDiagnostics(diagnostics);
    renderDiagnostics(diagnostics);
    setRenderState("Preview failed", "error");
  }
}

function schedulePreview(immediate = false) {
  clearTimeout(state.timer);
  state.timer = setTimeout(renderPreview, immediate ? 0 : 110);
}

async function openFile() {
  try {
    if (isDirty() && !window.confirm("Discard unsaved changes and open another file?")) return;
    const document = await openBrowserFile($("#file-input"));
    if (!document) return;
    setDocument({ ...document, plain: state.plain }, "browser", document.handle);
    toast(`Opened ${document.name}`);
  } catch (error) { toast(`Couldn’t open that file: ${error.message}`); }
}

async function saveFile() {
  try {
    if (state.origin === "browser" && state.handle) {
      await writeBrowserFile(state.handle, currentSource());
    } else if (state.origin !== "browser" && hasHttpSession) {
      const response = await saveSession(currentSource());
      if (response.name) state.name = response.name;
      state.origin = "session";
    } else {
      const saved = await saveBrowserCopy(currentSource(), state.name);
      if (!saved) return;
      state.handle = saved.handle;
      state.name = saved.name;
      state.origin = "browser";
    }
    state.savedSource = currentSource();
    updateFileState();
    toast(`Saved ${state.name}`);
  } catch (error) { toast(`Couldn’t save: ${error.message}`); }
}

async function saveCopy() {
  try {
    const copy = await saveBrowserCopy(currentSource(), state.name);
    if (copy) toast(`Saved a copy of ${copy.name}`);
  } catch (error) { toast(`Couldn’t save a copy: ${error.message}`); }
}

editor.addEventListener("input", () => {
  linkedScroll.setEnabled(false);
  updateFileState();
  schedulePreview();
});
document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
  linkedScroll.setEnabled(false);
  state.plain = button.dataset.mode === "plain";
  ui.setDiagnostics([]);
  ui.setMode(state.plain);
  schedulePreview(true);
}));
$("#open-button").addEventListener("click", openFile);
$("#save-button").addEventListener("click", saveFile);
$("#save-copy-button").addEventListener("click", saveCopy);
window.addEventListener("beforeunload", (event) => {
  if (!isDirty()) return;
  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
  event.preventDefault();
  (event.shiftKey ? saveCopy : saveFile)();
});

const shellApi = window.U220Preview = window.U220Preview || {};
shellApi.refresh = () => schedulePreview(true);
shellApi.setSource = (source, options = {}) => setDocument({ source, name: options.name, plain: options.plain }, "draft");
window.addEventListener("u220:compiler-ready", shellApi.refresh);

try {
  const session = await loadSession();
  if (session) setDocument(session, "session");
  else { updateFileState(); schedulePreview(true); }
} catch (error) {
  updateFileState();
  schedulePreview(true);
  toast(`Using a new document: ${error.message}`);
}
