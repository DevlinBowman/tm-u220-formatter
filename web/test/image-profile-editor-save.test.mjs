// Verifies exclusive revisioned saves, newer-draft retention, shortcuts, and unload protection.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createProfileSaveAction, handleProfileSaveShortcut, shouldWarnBeforeProfileUnload,
} from "../image_profile_editor/save-action.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, reject, resolve };
}

function model() {
  return {
    dirty: true, source: "NEW", revision: "r1", applied: [],
    applySession(session, initial, source) {
      this.applied.push({ session, initial, source });
      this.revision = session.revision;
      return session.clean;
    },
  };
}

function event(overrides = {}) {
  return {
    key: "s", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
    repeat: false, prevented: false,
    preventDefault() { this.prevented = true; }, ...overrides,
  };
}

test("one pending save keeps its source/revision snapshot and rejects overlap", async () => {
  const pending = deferred();
  const state = model();
  const writes = [];
  let busy = 0;
  const action = createProfileSaveAction({
    model: state,
    save(source, revision) { writes.push({ source, revision }); return pending.promise; },
    onBusy: () => { busy += 1; },
  });
  const first = action.run();
  state.source = "NEWER";
  state.revision = "local-does-not-change-snapshot";
  assert.equal(await action.run(), false);
  assert.equal(action.pending, true);
  assert.equal(busy, 1);
  assert.deepEqual(writes, [{ source: "NEW", revision: "r1" }]);
  pending.resolve({ revision: "r2", clean: false });
  assert.equal(await first, true);
  assert.deepEqual(state.applied, [{
    session: { revision: "r2", clean: false }, initial: false, source: "NEW",
  }]);
  assert.equal(action.pending, false);
});

test("failed save releases its gate and preserves a retry", async () => {
  const state = model();
  let calls = 0;
  let errors = 0;
  const action = createProfileSaveAction({
    model: state,
    async save() {
      calls += 1;
      if (calls === 1) throw new Error("profile changed on disk");
      return { revision: "r2", clean: true };
    },
    onError: () => { errors += 1; },
  });
  assert.equal(await action.run(), false);
  assert.equal(action.pending, false);
  assert.equal(await action.run(), true);
  assert.equal(calls, 2);
  assert.equal(errors, 1);
});

test("Command-S and Ctrl-S save once while unsafe variants remain untouched", () => {
  for (const modifier of ["metaKey", "ctrlKey"]) {
    let calls = 0;
    const key = event({ [modifier]: true });
    assert.equal(handleProfileSaveShortcut(key, () => { calls += 1; }), true);
    assert.equal(key.prevented, true);
    assert.equal(calls, 1);
    const repeat = event({ [modifier]: true, repeat: true });
    assert.equal(handleProfileSaveShortcut(repeat, () => { calls += 1; }), true);
    assert.equal(calls, 1);
  }
  for (const key of [event(), event({ metaKey: true, shiftKey: true }),
    event({ ctrlKey: true, altKey: true }), event({ metaKey: true, key: "x" })]) {
    assert.equal(handleProfileSaveShortcut(key, () => assert.fail("must not save")), false);
  }
});

test("dirty or pending profiles retain unload protection", () => {
  assert.equal(shouldWarnBeforeProfileUnload({ dirty: true }, false), true);
  assert.equal(shouldWarnBeforeProfileUnload({ dirty: false }, true), true);
  assert.equal(shouldWarnBeforeProfileUnload({ dirty: false }, false), false);
});
