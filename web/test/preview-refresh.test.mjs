// Verifies preview refresh recovers from an initially invalid document without stale results winning.
// Injected render collaborators keep debounce and revision behavior independent from a browser DOM.
import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewRefresh } from "../orchestration/preview-refresh.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function invalidResult() {
  return {
    valid: false,
    diagnostics: [{ severity: "error", code: "INVALID_SOURCE", span: {} }],
  };
}

function validResult(text = "RECOVERED") {
  return { valid: true, diagnostics: [], lines: [{ text }] };
}

function previewHarness(compile, initialSource = "INVALID") {
  let source = initialSource;
  const calls = {
    enabled: [], placeholders: [], receipt: [], refreshes: 0,
    renderStates: [], uiDiagnostics: [],
  };
  const linkedScroll = {
    setEnabled(value) { calls.enabled.push(value); },
    refresh() { calls.refreshes += 1; },
  };
  const receipt = {
    render(result) {
      calls.receipt.push(result);
      return result?.lines?.length || 0;
    },
    showPlaceholder(title, message) {
      calls.placeholders.push({ title, message });
    },
  };
  const renderDiagnostics = (items = []) => ({
    errors: items.filter((item) => !item.severity || item.severity === "error").length,
    warnings: items.filter((item) => item.severity === "warning").length,
  });
  const refresh = createPreviewRefresh({
    compile,
    delay: 0,
    getPlain: () => false,
    getSource: () => source,
    isUnavailable: () => false,
    linkedScroll,
    receipt,
    renderDiagnostics,
    setRenderState(label, tone) { calls.renderStates.push({ label, tone }); },
    ui: {
      setDiagnostics(items, offset) {
        calls.uiDiagnostics.push({ items, offset });
      },
    },
  });
  return { calls, refresh, setSource(value) { source = value; } };
}

test("an initially invalid source renders after it becomes valid", async () => {
  const good = validResult();
  const harness = previewHarness(async (source) =>
    source === "INVALID" ? invalidResult() : good);
  harness.refresh.reset();

  await harness.refresh.refresh();
  assert.equal(harness.calls.placeholders.at(-1).title, "Fix source errors");
  assert.equal(harness.calls.enabled.at(-1), false);
  assert.deepEqual(harness.calls.receipt, [null]);

  harness.setSource("VALID");
  await harness.refresh.refresh();
  assert.equal(harness.calls.receipt.at(-1), good);
  assert.equal(harness.calls.enabled.at(-1), true);
  assert.equal(harness.calls.refreshes, 1);
  assert.deepEqual(harness.calls.renderStates.at(-1), {
    label: "1 line", tone: "ready",
  });
});

test("a stale invalid result cannot replace a valid debounced edit", async () => {
  const stale = deferred();
  const current = deferred();
  const currentStarted = deferred();
  let staleSignal;
  const good = validResult("CURRENT");
  const harness = previewHarness((source, _plain, signal) => {
    if (source === "INVALID") {
      staleSignal = signal;
      return stale.promise;
    }
    currentStarted.resolve();
    return current.promise;
  });

  const firstRender = harness.refresh.refresh();
  harness.setSource("VALID");
  harness.refresh.schedule();
  assert.equal(staleSignal.aborted, true);

  stale.resolve(invalidResult());
  await firstRender;
  assert.deepEqual(harness.calls.placeholders, []);
  assert.deepEqual(harness.calls.uiDiagnostics, []);

  await currentStarted.promise;
  current.resolve(good);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.receipt.at(-1), good);
  assert.equal(harness.calls.enabled.at(-1), true);
  assert.equal(harness.calls.renderStates.some(
    (state) => state.tone === "error"), false);
});
