// Debounces abortable draft compilations so stale responses cannot replace newer profile settings.
// Invalid drafts retain the receipt view's last valid exact mask while surfacing diagnostics.
import { imagePreviewMetrics } from "./preview.js";

export function createImagePreviewRefresh(options) {
  const {
    compile, getSource, receipt, renderDiagnostics, renderMetrics, setState,
  } = options;
  const delay = options.delay ?? 120;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const setTimer = options.setTimer ?? setTimeout;
  let controller = null;
  let hasPreview = false;
  let lastMetrics = null;
  let revision = 0;
  let timer = 0;

  function invalidate() {
    revision += 1;
    clearTimer(timer);
    timer = 0;
    controller?.abort();
    controller = null;
    return revision;
  }

  async function render(token, source) {
    if (token !== revision) return;
    const active = new AbortController();
    controller = active;
    setState("Rendering", "working");
    try {
      const result = await compile(source, active.signal);
      if (token !== revision) return;
      const diagnostics = result?.diagnostics || [];
      const counts = renderDiagnostics(diagnostics);
      if (counts.errors || result?.valid === false) {
        if (hasPreview) receipt.render({ ...result, valid: false });
        else receipt.showPlaceholder("Profile needs attention",
          "Fix the image-profile diagnostics to draw printer dots.");
        renderMetrics(lastMetrics, Boolean(lastMetrics));
        const count = counts.errors || 1;
        setState(`${count} error${count === 1 ? "" : "s"}`, "error");
        return;
      }
      receipt.render(result);
      lastMetrics = imagePreviewMetrics(result);
      hasPreview = true;
      renderMetrics(lastMetrics, false);
      const warningCount = counts.warnings;
      setState(warningCount ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
        : "Exact dots", "ready");
    } catch (error) {
      if (error?.name === "AbortError" || token !== revision) return;
      if (hasPreview) receipt.render({ valid: false });
      else receipt.showPlaceholder("Preview unavailable",
        "The formatter could not render this profile.");
      const diagnostic = { severity: "error", code: "PREVIEW_FAILED",
        message: error.message, span: {} };
      renderDiagnostics([diagnostic]);
      renderMetrics(lastMetrics, Boolean(lastMetrics));
      setState("Preview failed", "error");
    } finally {
      if (controller === active) controller = null;
    }
  }

  function schedule(immediate = false) {
    const token = invalidate();
    const source = getSource();
    timer = setTimer(() => { timer = 0; render(token, source); }, immediate ? 0 : delay);
  }

  function refresh() {
    const token = invalidate();
    return render(token, getSource());
  }

  return { refresh, schedule };
}
