// Orchestrates schema controls, conflict-safe profile saves, and exact live dot previews.
// Feature modules keep image bytes, compilation, persistence, and printer access outside this page.
import {
  compileImageProfile, loadImageProfileSession, saveImageProfile,
} from "./api.js";
import { createProfileControls } from "./controls.js";
import { ImageProfileModel } from "./model.js";
import { createImagePreviewRefresh } from "./preview-refresh.js";
import { renderImageMetrics } from "./preview.js";
import {
  createProfileSaveAction, handleProfileSaveShortcut,
  shouldWarnBeforeProfileUnload,
} from "./save-action.js";
import { createDiagnosticsView } from "/preview/diagnostics.js";
import { createReceiptView } from "/preview/receipt.js";

const $ = (selector) => document.querySelector(selector);
const receipt = createReceiptView({
  receipt: $("#receipt"), lines: $("#receipt-lines"), finish: $("#receipt-finish"),
  placeholder: $("#receipt-placeholder"), profile: $("#image-metrics"),
});
const renderDiagnostics = createDiagnosticsView($("#diagnostics"));
const metricNodes = {
  root: $("#image-metrics"), target: $("#metric-target"),
  density: $("#metric-density"), dots: $("#metric-dots"),
  bands: $("#metric-bands"), bytes: $("#metric-bytes"),
};
const renderState = $("#render-state");
let model;
let saveAction;
let previewRefresh;
let toastTimer;

function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => { $("#toast").hidden = true; }, 2600);
}

function setRenderState(label, tone) {
  renderState.dataset.tone = tone;
  renderState.querySelector("b").textContent = label;
}

function renderShell() {
  if (!model) return;
  $("#profile-name").textContent = model.profileName;
  $("#preview-title").textContent = model.imageName;
  $("#profile-version").textContent = `Profile version ${model.schema.version}`;
  $("#dirty-dot").classList.toggle("is-visible", model.dirty);
  $("#dirty-dot").setAttribute("aria-hidden", String(!model.dirty));
  $("#save-button").disabled = saveAction.pending || !model.dirty;
  $("#save-button").textContent = saveAction.pending ? "Saving…" : "Save profile";
  $("#revert-button").disabled = saveAction.pending || !model.dirty;
  $("#save-state").textContent = saveAction.pending ? "Saving fixed profile"
    : model.dirty ? "Unsaved profile changes" : "Profile saved";
  document.title = `${model.dirty ? "• " : ""}${model.profileName} — U220 Image Profile`;
}

try {
  const session = await loadImageProfileSession();
  model = new ImageProfileModel(session);
  const controls = createProfileControls({
    mask: $("#mask-fields"), print: $("#print-fields"), fitNote: $("#fit-note"),
  }, {
    onEdit(name, value) {
      model.set(name, value);
      controls.render(model);
      renderShell();
      previewRefresh.schedule();
    },
    onError: (error) => toast(`Couldn’t change profile: ${error.message}`),
  });
  previewRefresh = createImagePreviewRefresh({
    compile: compileImageProfile,
    getSource: () => model.source,
    receipt,
    renderDiagnostics,
    renderMetrics: (metrics, stale) => renderImageMetrics(metricNodes, metrics, stale),
    setState: setRenderState,
  });
  saveAction = createProfileSaveAction({
    model,
    save: saveImageProfile,
    onBusy: () => toast("A profile save is already in progress"),
    onChange() { controls.render(model); renderShell(); },
    onError: (error) => toast(`Couldn’t save profile: ${error.message}`),
    onSaved({ clean }) {
      controls.render(model);
      toast(clean ? `Saved ${model.profileName}`
        : `Saved ${model.profileName}; newer changes remain unsaved`);
    },
  });
  controls.render(model);
  renderShell();
  previewRefresh.schedule(true);

  $("#revert-button").addEventListener("click", () => {
    model.revert();
    controls.render(model);
    renderShell();
    previewRefresh.schedule(true);
  });
  $("#save-button").addEventListener("click", saveAction.run);
  window.addEventListener("keydown", (event) =>
    handleProfileSaveShortcut(event, saveAction.run), { capture: true });
  window.addEventListener("beforeunload", (event) => {
    if (!shouldWarnBeforeProfileUnload(model, saveAction.pending)) return;
    event.preventDefault();
    event.returnValue = "";
  });
} catch (error) {
  $("#save-state").textContent = "Image-profile editor unavailable";
  setRenderState("Unavailable", "error");
  receipt.showPlaceholder("Editor unavailable", "The fixed image-profile session could not be loaded.");
  toast(`Couldn’t load image profile: ${error.message}`);
}
