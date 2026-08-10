// Verifies exact mask metrics plus abortable stale-safe live preview behavior.
import test from "node:test";
import assert from "node:assert/strict";
import { createImagePreviewRefresh } from "../image_profile_editor/preview-refresh.js";
import { imagePreviewMetrics } from "../image_profile_editor/preview.js";

function result(overrides = {}) {
  return {
    valid: true, byte_count: 321, diagnostics: [], profile: { paper_width_tenths_mm: 760 },
    lines: [{ kind: "image", image_density: "detail", segments: [{
      kind: "bit_image", density: "detail", mask_encoding: "hex-msb-rows",
      mask_data: "A0404000", mask_width_dots: 10, mask_height_dots: 2,
      column_step_half_dots: 1, width_half_dots: 10,
      character_cell_height_vertical_units: 4,
    }] }], ...overrides,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(compile) {
  let source = "FIRST";
  const calls = { diagnostics: [], metrics: [], placeholders: [], receipt: [], states: [] };
  const refresh = createImagePreviewRefresh({
    compile, getSource: () => source,
    receipt: {
      render(value) { calls.receipt.push(value); },
      showPlaceholder(title, message) { calls.placeholders.push({ title, message }); },
    },
    renderDiagnostics(items) {
      calls.diagnostics.push(items);
      return { errors: items.filter((item) => item.severity !== "warning").length,
        warnings: items.filter((item) => item.severity === "warning").length };
    },
    renderMetrics(metrics, stale) { calls.metrics.push({ metrics, stale }); },
    setState(label, tone) { calls.states.push({ label, tone }); },
  });
  return { calls, refresh, setSource(value) { source = value; } };
}

test("canonical mask metrics report dots, density, bands, and job bytes", () => {
  assert.deepEqual(imagePreviewMetrics(result()), {
    width: 10, height: 2, activeDots: 4, bands: 1, byteCount: 321,
    density: "detail", densityLabel: "160 × 72 dpi", targetLabel: "10 × 2 dots",
  });
  assert.throws(() => imagePreviewMetrics(result({
    lines: [{ segments: [{ kind: "bit_image", mask_width_dots: 10,
      mask_height_dots: 2, mask_data: "A040" }] }],
  })), /not canonical/);
});

test("a stale compile is aborted and cannot replace the newest exact mask", async () => {
  const first = deferred();
  const second = deferred();
  let firstSignal;
  const ui = harness((source, signal) => {
    if (source === "FIRST") { firstSignal = signal; return first.promise; }
    return second.promise;
  });
  const old = ui.refresh.refresh();
  ui.setSource("SECOND");
  const current = ui.refresh.refresh();
  assert.equal(firstSignal.aborted, true);
  first.resolve(result({ byte_count: 111 }));
  await old;
  assert.equal(ui.calls.receipt.length, 0);
  second.resolve(result({ byte_count: 222 }));
  await current;
  assert.equal(ui.calls.receipt.length, 1);
  assert.equal(ui.calls.metrics.at(-1).metrics.byteCount, 222);
  assert.deepEqual(ui.calls.states.at(-1), { label: "Exact dots", tone: "ready" });
});

test("an invalid draft retains the last valid receipt and marks its metrics stale", async () => {
  let invalid = false;
  const ui = harness(async () => invalid ? {
    valid: false, diagnostics: [{ severity: "error", code: "BAD_PROFILE" }],
  } : result());
  await ui.refresh.refresh();
  invalid = true;
  await ui.refresh.refresh();
  assert.equal(ui.calls.receipt.length, 2);
  assert.equal(ui.calls.receipt[1].valid, false);
  assert.equal(ui.calls.metrics.at(-1).stale, true);
  assert.equal(ui.calls.metrics.at(-1).metrics.activeDots, 4);
  assert.deepEqual(ui.calls.states.at(-1), { label: "1 error", tone: "error" });
});
