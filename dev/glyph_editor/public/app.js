// Orchestrates PC437 selection, draft masks, study preview, and fixed-target updates.
// Receipt compilation and persistence details remain in their independent domains.
import { AppearanceModel } from "./appearance-model.js";
import {
  loadGlyphAtlas, loadPreviewAppearance, saveGlyphPattern, savePreviewAppearance,
} from "./api.js";
import {
  byteHex, createGlyphCatalog, glyphName, unicodeCode,
} from "./catalog.js";
import { fontAuthoringGuide } from "./font-guides.js";
import { createDotGrid } from "./grid.js";
import { GlyphEditorModel, patternRows } from "./model.js";
import { createGlyphStudy, studyCellGeometry } from "./preview.js";
import {
  createGlyphSaveAction, handleGlyphSaveShortcut, shouldWarnBeforeGlyphUnload,
} from "./save-action.js";
import { normalizeComparisonText, studyPatterns } from "./study-text.js";

const $ = (selector) => document.querySelector(selector);
let toastTimer;

function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => { $("#toast").hidden = true; }, 2600);
}

try {
  const [response, appearanceValue] = await Promise.all([
    loadGlyphAtlas(), loadPreviewAppearance(),
  ]);
  const model = new GlyphEditorModel(response.catalog, response.fonts);
  const appearance = new AppearanceModel(appearanceValue);
  const catalog = createGlyphCatalog($("#glyph-catalog"), model.catalog, (glyph) => {
    model.select(model.font, glyph.page, glyph.byte);
    render();
  });
  const grid = createDotGrid($("#dot-grid"), (row, column, value) => {
    model.setCell(row, column, value);
    render();
  });
  const study = createGlyphStudy($("#glyph-study"));
  let studySpacingHalfDots = 3;
  const saveAction = createGlyphSaveAction({
    model,
    save: saveGlyphPattern,
    onBusy: () => toast("A glyph update is already in progress"),
    onChange: () => render(),
    onError: (error) => toast(`Couldn’t update glyph: ${error.message}`),
    onSaved: ({ clean, snapshot }) => {
      const name = glyphName(model.glyphFor(snapshot.page, snapshot.byte));
      toast(`Updated Font ${snapshot.font.toUpperCase()} ${name}${
        clean ? "" : "; newer dots remain unsaved"}`);
    },
  });

  function render() {
    const rows = patternRows(model.pattern, model.width, model.height);
    const comparison = studyPatterns(
      $("#study-text").value, model.catalog,
      (page, byte) => model.savedPatternFor(model.font, page, byte),
      { page: model.page, byte: model.byte, pattern: model.pattern },
    );
    const comparisonRows = comparison.patterns.map(
      (pattern) => patternRows(pattern, model.width, model.height));
    const cellGeometry = studyCellGeometry(
      model.width, model.height, studySpacingHalfDots);
    const fontGuide = fontAuthoringGuide(model.font, model.height);
    document.querySelectorAll("[data-font]").forEach((button) => {
      const selected = button.dataset.font === model.font;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    catalog.render({
      selected: model.glyph, dirtyBytes: model.dirtyBytes(),
      authoredBytes: model.authoredBytes(),
    });
    grid.render(rows, {
      alignmentEdgeAfterRow: cellGeometry.alignmentEdgeAfterRow,
      authoringBaselineAfterRow: fontGuide.authoringBaselineAfterRow,
    });
    study.render(rows, {
      diameter: appearance.selectedDiameter,
      characterSpacingHalfDots: studySpacingHalfDots,
      glyphRows: comparisonRows, mode: appearance.mode,
    });
    const name = glyphName(model.glyph);
    $("#glyph-title").textContent = `Font ${model.font.toUpperCase()} · ${name}`;
    $("#glyph-metrics").textContent = `PC437 0x${byteHex(model.byte)} · ${
      unicodeCode(model.character)} · ${model.authored ? "authored" : "unauthored"} · ${
      model.width} half-dot positions × ${model.height} pins`;
    $("#authoring-baseline-guide-copy").textContent = `Font ${model.font.toUpperCase()} authoring baseline after pin ${fontGuide.authoringBaselineAfterRow}. Epson defines no internal baseline; this is our reconstruction convention, and low glyph detail may extend below it.`;
    $("#alignment-guide-copy").textContent = `Epson matrix bottom · shared line alignment after pin ${model.height}. Pin ${model.height} remains editable.`;
    $("#geometry-cell-label").textContent = `${model.width} × ${model.height} glyph matrix`;
    $("#geometry-spacing-label").textContent = `+${studySpacingHalfDots} half-dot positions · character spacing`;
    $("#geometry-line-spacing-label").textContent = `+${cellGeometry.lineSpacingOutsideMatrixVerticalUnits} feed units · line spacing outside matrix`;
    const diagram = $("#geometry-diagram");
    diagram.style.gridTemplateColumns = `${model.width}fr ${studySpacingHalfDots}fr`;
    diagram.style.gridTemplateRows = `${cellGeometry.matrixHeightVerticalUnits}fr ${cellGeometry.lineSpacingOutsideMatrixVerticalUnits}fr`;
    diagram.style.setProperty("--authoring-baseline-position",
      `${fontGuide.authoringBaselineAfterRow / model.height * 100}%`);
    diagram.setAttribute("aria-label", `Font ${model.font.toUpperCase()} uses a ${model.width} by ${model.height} editable matrix with our authoring baseline after pin ${fontGuide.authoringBaselineAfterRow}, followed by separate ${studySpacingHalfDots}-half-dot-position character spacing and ${cellGeometry.lineSpacingOutsideMatrixVerticalUnits} 1/144-inch feed units of line spacing outside the matrix`);
    $("#study-context").textContent = `Selected ${name} specimen + Font ${model.font.toUpperCase()} comparison · matching drafts update live · ${studySpacingHalfDots}-position character spacing`;
    $("#pattern-output").value = model.pattern;
    $("#save-button").disabled = saveAction.pending || !model.needsSave;
    $("#save-button").textContent = saveAction.pending ? "Updating…" : "Update glyph";
    $("#revert-button").disabled = !model.dirty;
    $("#restore-button").disabled = model.pattern === model.initialPattern;
    $("#catalog-count").textContent = `${model.authoredCount}/${model.catalog.length} Font ${model.font.toUpperCase()} masks authored`;
    $("#draft-count").textContent = model.dirtyCount
      ? `${model.dirtyCount} unsaved ${model.dirtyCount === 1 ? "draft" : "drafts"}` : "No drafts";
    $("#save-state").textContent = saveAction.pending ? "Updating selected glyph"
      : model.dirty ? "Selected glyph has unsaved dots"
        : model.authored ? "Selected preview mask is saved" : "Selected glyph has no authored mask";
    for (const mode of ["single", "double"]) {
      const input = $(`[data-dot-size="${mode}"]`);
      input.value = appearance.value[mode];
      $(`#${mode}-dot-value`).textContent = `${appearance.value[mode].toFixed(2)} mm`;
    }
    document.querySelectorAll("[data-strike-mode]").forEach((button) => {
      const selected = button.dataset.strikeMode === appearance.mode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll("[data-study-spacing]").forEach((button) => {
      const selected = Number(button.dataset.studySpacing) === studySpacingHalfDots;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    $("#save-sizes-button").disabled = !appearance.dirty;
    $("#revert-sizes-button").disabled = !appearance.dirty;
    $("#size-state").textContent = appearance.dirty
      ? "Dot-size changes are not saved" : "Global preview sizes are saved";
  }

  document.querySelectorAll("[data-font]").forEach((button) => {
    button.addEventListener("click", () => {
      model.select(button.dataset.font, model.page, model.byte);
      render();
    });
  });
  $("#clear-button").addEventListener("click", () => { model.clear(); render(); });
  $("#revert-button").addEventListener("click", () => { model.revert(); render(); });
  $("#restore-button").addEventListener("click", () => { model.restoreInitial(); render(); });
  $("#copy-button").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(model.pattern); toast("Pattern copied"); }
    catch { $("#pattern-output").select(); toast("Select and copy the pattern"); }
  });
  $("#study-text").addEventListener("input", (event) => {
    event.currentTarget.value = normalizeComparisonText(
      event.currentTarget.value, model.catalog);
    render();
  });
  document.querySelectorAll("[data-strike-mode]").forEach((button) => {
    button.addEventListener("click", () => { appearance.selectMode(button.dataset.strikeMode); render(); });
  });
  document.querySelectorAll("[data-study-spacing]").forEach((button) => {
    button.addEventListener("click", () => { studySpacingHalfDots = Number(button.dataset.studySpacing); render(); });
  });
  document.querySelectorAll("[data-dot-size]").forEach((input) => {
    input.addEventListener("input", () => {
      appearance.set(input.dataset.dotSize, input.value);
      appearance.selectMode(input.dataset.dotSize);
      render();
    });
  });
  $("#revert-sizes-button").addEventListener("click", () => { appearance.revert(); render(); });
  $("#save-sizes-button").addEventListener("click", async () => {
    $("#save-sizes-button").disabled = true;
    try {
      const saved = await savePreviewAppearance(appearance.value, appearance.previous);
      appearance.markSaved(saved.value);
      toast("Saved global preview dot sizes");
    } catch (error) { toast(`Couldn’t save dot sizes: ${error.message}`); }
    render();
  });
  $("#save-button").addEventListener("click", saveAction.run);
  window.addEventListener("keydown",
    (event) => handleGlyphSaveShortcut(event, saveAction.run), { capture: true });
  window.addEventListener("beforeunload", (event) => {
    if (!shouldWarnBeforeGlyphUnload({
      appearanceDirty: appearance.dirty,
      dirtyCount: model.dirtyCount,
      pending: saveAction.pending,
    })) return;
    event.preventDefault();
    event.returnValue = "";
  });
  render();
} catch (error) {
  $("#save-state").textContent = "Glyph editor unavailable";
  toast(`Couldn’t load preview glyphs: ${error.message}`);
}
