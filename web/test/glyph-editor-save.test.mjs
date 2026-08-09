// Verifies button and primary-key updates share one exclusive selection snapshot.
// Deferred requests exercise overlap, target changes, failure recovery, and repeat handling.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createGlyphSaveAction, handleGlyphSaveShortcut, shouldWarnBeforeGlyphUnload,
} from "../../dev/glyph_editor/public/save-action.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, reject, resolve };
}

function model() {
  return {
    font: "b", page: 0, byte: 0x41, pattern: "NEW", savedPattern: "OLD",
    needsSave: true, applied: [],
    markGlyphSaved(font, page, byte, pattern) {
      this.applied.push({ font, page, byte, pattern });
      this.needsSave = false;
      return true;
    },
  };
}

function keyEvent(overrides = {}) {
  return {
    key: "s", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
    repeat: false, prevented: false,
    preventDefault() { this.prevented = true; },
    ...overrides,
  };
}

test("one pending update keeps its original target and rejects overlap", async () => {
  const pending = deferred();
  const state = model();
  const writes = [];
  let busy = 0;
  const action = createGlyphSaveAction({
    model: state,
    save(snapshot) { writes.push(snapshot); return pending.promise; },
    onBusy: () => { busy += 1; },
  });
  const first = action.run();
  state.font = "a";
  state.byte = 0x42;
  state.pattern = "OTHER";
  assert.equal(await action.run(), false);
  assert.equal(action.pending, true);
  assert.equal(busy, 1);
  assert.deepEqual(writes, [{
    font: "b", page: 0, byte: 0x41, pattern: "NEW", previousPattern: "OLD",
  }]);

  pending.resolve({ font: "b", page: 0, byte: 0x41, pattern: "NEW" });
  assert.equal(await first, true);
  assert.deepEqual(state.applied, [
    { font: "b", page: 0, byte: 0x41, pattern: "NEW" },
  ]);
  assert.equal(action.pending, false);
});

test("failure releases the gate and preserves a retry", async () => {
  const state = model();
  let calls = 0;
  let errors = 0;
  const action = createGlyphSaveAction({
    model: state,
    async save(snapshot) {
      calls += 1;
      if (calls === 1) throw new Error("conflict");
      return { ...snapshot };
    },
    onError: () => { errors += 1; },
  });
  assert.equal(await action.run(), false);
  assert.equal(action.pending, false);
  assert.equal(state.needsSave, true);
  assert.equal(await action.run(), true);
  assert.equal(errors, 1);
  assert.equal(calls, 2);
});

test("pending blank unauthored update retains the unload warning", async () => {
  const pending = deferred();
  const state = model();
  state.pattern = "BLANK";
  state.savedPattern = "BLANK";
  state.dirtyCount = 0;
  const action = createGlyphSaveAction({ model: state, save: () => pending.promise });
  const saving = action.run();
  assert.equal(action.pending, true);
  assert.equal(shouldWarnBeforeGlyphUnload({
    appearanceDirty: false, dirtyCount: state.dirtyCount, pending: action.pending,
  }), true);

  pending.resolve({ font: "b", page: 0, byte: 0x41, pattern: "BLANK" });
  assert.equal(await saving, true);
  assert.equal(shouldWarnBeforeGlyphUnload({
    appearanceDirty: false, dirtyCount: state.dirtyCount, pending: action.pending,
  }), false);
});

test("Cmd-S and Ctrl-S update once while shifted, alternate, and plain S do not", () => {
  for (const modifier of ["metaKey", "ctrlKey"]) {
    let calls = 0;
    const event = keyEvent({ [modifier]: true });
    assert.equal(handleGlyphSaveShortcut(event, () => { calls += 1; }), true);
    assert.equal(event.prevented, true);
    assert.equal(calls, 1);
    const repeat = keyEvent({ [modifier]: true, repeat: true });
    assert.equal(handleGlyphSaveShortcut(repeat, () => { calls += 1; }), true);
    assert.equal(repeat.prevented, true);
    assert.equal(calls, 1);
  }
  for (const event of [
    keyEvent(), keyEvent({ metaKey: true, shiftKey: true }),
    keyEvent({ ctrlKey: true, altKey: true }), keyEvent({ metaKey: true, key: "x" }),
  ]) {
    assert.equal(handleGlyphSaveShortcut(event, () => assert.fail("must not update")), false);
    assert.equal(event.prevented, false);
  }
});
