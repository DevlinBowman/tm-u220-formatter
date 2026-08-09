import test from "node:test";
import assert from "node:assert/strict";
import {
  createLinkedScroll,
  editorLineAtCenter,
  editorScrollForLine,
  nearestSourceLine,
  paperYForSourceLine,
} from "../orchestration/scroll-sync.js";

const anchors = [
  { sourceLine: 2, paperY: 20 },
  { sourceLine: 6, paperY: 100 },
  { sourceLine: 6, paperY: 140 },
  { sourceLine: 10, paperY: 220 },
];

test("source-to-paper mapping interpolates and preserves nearest duplicate", () => {
  assert.equal(paperYForSourceLine(anchors, 4, 0), 60);
  assert.equal(paperYForSourceLine(anchors, 6, 130), 140);
  assert.equal(paperYForSourceLine(anchors, 1, 0), 20);
  assert.equal(paperYForSourceLine(anchors, 20, 0), 220);
});

test("paper-to-source mapping tolerates reverse and duplicate positions", () => {
  const reversed = [...anchors, { sourceLine: 12, paperY: 80 }];
  assert.equal(nearestSourceLine(reversed, 82, 12), 12);
  assert.equal(nearestSourceLine(reversed, 138, 6), 6);
});

test("textarea center-line calculations include padding and clamp scrolling", () => {
  const metrics = {
    scrollTop: 180, clientHeight: 200, paddingTop: 20,
    lineHeight: 20, maxScroll: 600,
  };
  assert.equal(editorLineAtCenter(metrics), 14);
  assert.equal(editorScrollForLine(2, metrics), 0);
  assert.equal(editorScrollForLine(50, metrics), 600);
  assert.equal(editorScrollForLine(20, metrics), 300);
});

function scrollNode(values = {}) {
  const listeners = new Map();
  const { scrollTop = 0, top = 0, rectTop, ...properties } = values;
  let currentScrollTop = scrollTop;
  const node = {
    clientHeight: 200, scrollHeight: 800, scrollWrites: [],
    ...properties,
    get scrollTop() { return currentScrollTop; },
    set scrollTop(value) {
      currentScrollTop = value;
      this.scrollWrites.push(value);
    },
    userScroll(value) { currentScrollTop = value; },
    addEventListener(event, listener) { listeners.set(event, listener); },
    emit(event) { listeners.get(event)?.(); },
    getBoundingClientRect() { return { top: rectTop ? rectTop() : top }; },
  };
  return node;
}

function frameQueue() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    request(callback) {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
    cancel(id) { callbacks.delete(id); },
    flush() {
      const queued = [...callbacks.values()];
      callbacks.clear();
      queued.forEach((callback) => callback());
    },
  };
}

function withScrollRuntime(activeEditor, callback) {
  const originalDocument = globalThis.document;
  const originalRequestFrame = globalThis.requestAnimationFrame;
  const originalCancelFrame = globalThis.cancelAnimationFrame;
  const originalComputedStyle = globalThis.getComputedStyle;
  const frames = frameQueue();
  try {
    globalThis.document = { activeElement: activeEditor };
    globalThis.requestAnimationFrame = frames.request;
    globalThis.cancelAnimationFrame = frames.cancel;
    globalThis.getComputedStyle = () => ({
      fontSize: "13px", lineHeight: "20px", paddingTop: "20px",
    });
    callback(frames);
  } finally {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRequestFrame;
    globalThis.cancelAnimationFrame = originalCancelFrame;
    globalThis.getComputedStyle = originalComputedStyle;
  }
}

test("preview scrolling follows source without moving the focused selection", () => {
  const editor = scrollNode({
    scrollHeight: 1400,
    selectionStart: 37, selectionEnd: 52, selectionDirection: "forward",
  });
  const preview = scrollNode();
  const receipt = scrollNode({ rectTop: () => 50 - preview.scrollTop });
  withScrollRuntime(editor, (frames) => {
    const linked = createLinkedScroll({
      editor, preview, receipt,
      getAnchors: () => [{ sourceLine: 10, paperY: 220 }],
    });
    linked.setEnabled(true);

    preview.userScroll(170);
    preview.emit("scroll");
    frames.flush();
    assert.equal(editor.scrollTop, 100);
    assert.equal(globalThis.document.activeElement, editor);
    assert.deepEqual({
      start: editor.selectionStart,
      end: editor.selectionEnd,
      direction: editor.selectionDirection,
    }, { start: 37, end: 52, direction: "forward" });

    editor.emit("scroll");
    frames.flush();
    assert.equal(preview.scrollTop, 170);
  });
});

test("delayed programmatic preview scroll cannot pull source across a clamp", () => {
  const editor = scrollNode({ scrollTop: 900, scrollHeight: 1200 });
  const preview = scrollNode();
  const receipt = scrollNode({ rectTop: () => 50 - preview.scrollTop });
  const boundaryAnchors = [
    { sourceLine: 30, paperY: 650 },
    { sourceLine: 50, paperY: 1000 },
  ];
  let anchorReads = 0;
  withScrollRuntime(null, (frames) => {
    const linked = createLinkedScroll({
      editor, preview, receipt,
      getAnchors() { anchorReads += 1; return boundaryAnchors; },
    });
    linked.setEnabled(true);

    editor.emit("scroll");
    frames.flush();
    assert.equal(preview.scrollTop, 600);
    assert.equal(anchorReads, 1);

    frames.flush();
    preview.emit("scroll");
    frames.flush();
    assert.equal(anchorReads, 1);
    assert.equal(editor.scrollTop, 900);
  });
});
