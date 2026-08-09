// Verifies primary save shortcuts update writable source ownership instead of creating a copy.
// Browser files without writable handles remain isolated from an unrelated HTTP preview session.
import test from "node:test";
import assert from "node:assert/strict";
import {
  applySaveOutcome,
  createExclusiveSave,
  handleSaveShortcut,
  saveCurrentDocument,
} from "../orchestration/file-actions.js";

function keyEvent(overrides = {}) {
  return {
    key: "s", metaKey: false, ctrlKey: false, shiftKey: false,
    prevented: false, repeat: false,
    preventDefault() { this.prevented = true; },
    ...overrides,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function runSessionShortcut(modifier) {
  const document = {
    origin: "session", handle: null, name: "receipt.u220", savedSource: "OLD",
    documentRevision: 1,
  };
  const calls = { copied: 0, saved: [], written: 0 };
  const services = {
    hasSession: true,
    async saveSession(source) {
      calls.saved.push(source);
      return { saved: true, name: "receipt.u220" };
    },
    async saveBrowserCopy() { calls.copied += 1; },
    async writeBrowserFile() { calls.written += 1; },
  };
  let savePromise;
  const event = keyEvent({ [modifier]: true });
  const handled = handleSaveShortcut(event, {
    save() {
      savePromise = saveCurrentDocument(document, "UPDATED", services)
        .then((outcome) => applySaveOutcome(document, "UPDATED", outcome));
    },
    saveCopy() { calls.copied += 1; },
  });
  await savePromise;
  return { calls, document, event, handled };
}

test("Command-S and Ctrl-S update the HTTP session source without saving a copy", async () => {
  for (const modifier of ["metaKey", "ctrlKey"]) {
    const result = await runSessionShortcut(modifier);
    assert.equal(result.handled, true);
    assert.equal(result.event.prevented, true);
    assert.deepEqual(result.calls, {
      copied: 0, saved: ["UPDATED"], written: 0,
    });
    assert.deepEqual(result.document, {
      origin: "session", handle: null, name: "receipt.u220",
      savedSource: "UPDATED", documentRevision: 1,
    });
  }
});

test("Shift-Command-S remains an explicit copy action", () => {
  let saved = 0;
  let copied = 0;
  const event = keyEvent({ metaKey: true, shiftKey: true });
  assert.equal(handleSaveShortcut(event, {
    save() { saved += 1; },
    saveCopy() { copied += 1; },
  }), true);
  assert.equal(event.prevented, true);
  assert.equal(saved, 0);
  assert.equal(copied, 1);
});

test("a repeated save shortcut is consumed without starting another write", () => {
  let saves = 0;
  const event = keyEvent({ metaKey: true, repeat: true });
  assert.equal(handleSaveShortcut(event, {
    save() { saves += 1; },
    saveCopy() { throw new Error("repeat must not create a copy"); },
  }), true);
  assert.equal(event.prevented, true);
  assert.equal(saves, 0);
});

test("a writable browser handle remains the active source", async () => {
  const handle = { name: "opened.u220" };
  const document = {
    origin: "browser", handle, name: "opened.u220", savedSource: "OLD",
    documentRevision: 1,
  };
  const writes = [];
  const outcome = await saveCurrentDocument(document, "UPDATED", {
    hasSession: true,
    async saveSession() { throw new Error("browser save must not use the session"); },
    async saveBrowserCopy() { throw new Error("browser save must not create a copy"); },
    async writeBrowserFile(target, source) { writes.push({ target, source }); },
  });
  assert.deepEqual(writes, [{ target: handle, source: "UPDATED" }]);
  assert.equal(applySaveOutcome(document, "UPDATED", outcome), true);
  assert.deepEqual(document, {
    origin: "browser", handle, name: "opened.u220", savedSource: "UPDATED",
    documentRevision: 1,
  });
});

test("a save marks only the source snapshot actually written as clean", async () => {
  const pending = deferred();
  const document = {
    origin: "session", handle: null, name: "receipt.u220", savedSource: "OLD",
    documentRevision: 1,
  };
  let currentSource = "FIRST EDIT";
  const savedSnapshot = currentSource;
  const saving = saveCurrentDocument(document, savedSnapshot, {
    hasSession: true,
    saveSession: () => pending.promise,
  });
  currentSource = "SECOND EDIT";
  pending.resolve({ name: "receipt.u220" });
  const outcome = await saving;
  assert.equal(applySaveOutcome(document, savedSnapshot, outcome), true);
  assert.equal(document.savedSource, "FIRST EDIT");
  assert.notEqual(document.savedSource, currentSource);
});

test("a completed save cannot mark a replacement document clean", async () => {
  const pending = deferred();
  const document = {
    origin: "session", handle: null, name: "first.u220", savedSource: "FIRST",
    documentRevision: 1,
  };
  const saving = saveCurrentDocument(document, "FIRST EDIT", {
    hasSession: true,
    saveSession: () => pending.promise,
  });
  Object.assign(document, {
    origin: "browser", handle: { name: "second.u220" }, name: "second.u220",
    savedSource: "SECOND", documentRevision: 2,
  });
  pending.resolve({});
  const outcome = await saving;
  assert.equal(outcome.name, "first.u220");
  assert.equal(applySaveOutcome(document, "FIRST EDIT", outcome), false);
  assert.equal(document.name, "second.u220");
  assert.equal(document.savedSource, "SECOND");
});

test("primary saves reject overlap until the active write finishes", async () => {
  const pending = deferred();
  let busy = 0;
  let writes = 0;
  const save = createExclusiveSave(async () => {
    writes += 1;
    await pending.promise;
  }, () => { busy += 1; });
  const first = save();
  assert.equal(await save(), false);
  assert.equal(writes, 1);
  assert.equal(busy, 1);
  pending.resolve();
  assert.equal(await first, true);
  assert.equal(await save(), true);
  assert.equal(writes, 2);
});

test("a read-only browser source requires the explicit copy action", async () => {
  const document = {
    origin: "browser", handle: null, name: "opened.u220", savedSource: "OLD",
    documentRevision: 1,
  };
  let sessionWrites = 0;
  let copies = 0;
  const outcome = await saveCurrentDocument(document, "BROWSER SOURCE", {
    hasSession: true,
    async saveSession() { sessionWrites += 1; return { name: "session.u220" }; },
    async saveBrowserCopy() {
      copies += 1;
      return { handle: null, name: "opened.u220", downloaded: true };
    },
    async writeBrowserFile() { throw new Error("missing handle must not be written"); },
  });
  assert.equal(sessionWrites, 0);
  assert.equal(copies, 0);
  assert.deepEqual(outcome, {
    documentRevision: 1, handle: null, name: "opened.u220", origin: "browser",
    persisted: false, unwritable: true,
  });
  assert.equal(applySaveOutcome(document, "BROWSER SOURCE", outcome), false);
  assert.equal(document.savedSource, "OLD");
});

test("a draft cannot fall through to the loaded session or copy flow", async () => {
  const calls = { copied: 0, saved: 0 };
  const outcome = await saveCurrentDocument({
    origin: "draft", handle: null, name: "draft.u220", documentRevision: 3,
  }, "DRAFT", {
    hasSession: true,
    async saveSession() { calls.saved += 1; },
    async saveBrowserCopy() { calls.copied += 1; },
  });
  assert.deepEqual(calls, { copied: 0, saved: 0 });
  assert.equal(outcome.unwritable, true);
});
