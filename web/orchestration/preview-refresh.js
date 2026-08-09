// Owns debounced preview revisions so stale or invalid compiles cannot replace newer source.
// Rendering policy stays independent from editor input and file-persistence orchestration.
export function createPreviewRefresh(options) {
  const {
    compile, getPlain, getSource, isUnavailable, linkedScroll, receipt,
    renderDiagnostics, setRenderState, ui,
  } = options;
  const delay = options.delay ?? 110;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const setTimer = options.setTimer ?? setTimeout;
  let controller = null;
  let hasPreview = false;
  let revision = 0;
  let timer = 0;

  function invalidate() {
    revision += 1;
    clearTimer(timer);
    timer = 0;
    controller?.abort();
    controller = null;
    linkedScroll.setEnabled(false);
    return revision;
  }

  async function render(token, source, plain) {
    if (token !== revision) return;
    const activeController = new AbortController();
    controller = activeController;
    setRenderState("Rendering", "working");
    try {
      const result = await compile(source, plain, activeController.signal);
      if (token !== revision) return;
      const diagnostics = result?.diagnostics || [];
      const sourceLineOffset = result?.source_line_offset || 0;
      ui.setDiagnostics(diagnostics, sourceLineOffset);
      const counts = renderDiagnostics(diagnostics, sourceLineOffset);
      if (counts.errors || result?.valid === false) {
        linkedScroll.setEnabled(false);
        if (hasPreview) receipt.render({ ...result, valid: false });
        else receipt.showPlaceholder("Fix source errors",
          "The formatter needs a valid document before it can draw the receipt.");
        const count = counts.errors || 1;
        setRenderState(`${count} error${count === 1 ? "" : "s"}`, "error");
        return;
      }
      const lineCount = receipt.render(result || {});
      hasPreview = true;
      linkedScroll.setEnabled(true);
      linkedScroll.refresh();
      if (counts.warnings) {
        setRenderState(`${counts.warnings} warning${counts.warnings === 1 ? "" : "s"}`,
          "ready");
      } else {
        setRenderState(`${lineCount} line${lineCount === 1 ? "" : "s"}`, "ready");
      }
    } catch (error) {
      if (error?.name === "AbortError" || token !== revision) return;
      linkedScroll.setEnabled(false);
      if (isUnavailable(error)) {
        receipt.showPlaceholder("Preview engine isn’t connected",
          "Open this workspace through the U220 preview command, or attach a browser compiler.");
        ui.setDiagnostics([]);
        renderDiagnostics([]);
        setRenderState("Offline", "idle");
        return;
      }
      if (hasPreview) receipt.render({ valid: false });
      else receipt.showPlaceholder("Preview unavailable",
        "The formatter could not render this document.");
      const diagnostics = [{ severity: "error", code: "PREVIEW_FAILED",
        message: error.message, span: {} }];
      ui.setDiagnostics(diagnostics);
      renderDiagnostics(diagnostics);
      setRenderState("Preview failed", "error");
    } finally {
      if (controller === activeController) controller = null;
    }
  }

  function schedule(immediate = false) {
    const token = invalidate();
    const source = getSource();
    const plain = getPlain();
    timer = setTimer(() => {
      timer = 0;
      render(token, source, plain);
    }, immediate ? 0 : delay);
  }

  function refresh() {
    const token = invalidate();
    return render(token, getSource(), getPlain());
  }

  function reset() {
    invalidate();
    hasPreview = false;
    receipt.render(null);
  }

  return { refresh, reset, schedule };
}
