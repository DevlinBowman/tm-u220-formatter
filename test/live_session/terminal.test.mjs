import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { TerminalView, attachCancellation } from "../../libexec/live_session/terminal.mjs";

function output(isTTY) {
  return {
    isTTY,
    value: "",
    write(value) { this.value += value; return true; },
  };
}

const plan = { lineCount: 1, steps: [{ index: 1 }] };
const step = { index: 1, kind: "line", display: "001 | A", previewLineIndex: 1 };

function terminalInput() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.isRaw = false;
  input.raw = [];
  input.setRawMode = (value) => { input.isRaw = value; input.raw.push(value); };
  input.resume = () => {};
  input.pause = () => {};
  return input;
}

test("TTY view keeps a colored textual status node and mirrors confirmed lines", () => {
  const stream = output(true);
  const view = new TerminalView({ stream, plan, env: { TERM: "xterm" } });
  view.handle({ type: "connecting" });
  view.handle({ type: "ready" });
  view.handle({ type: "in_flight", step });
  view.handle({ type: "confirmed", step });
  view.finish("green", "print complete");
  assert.match(stream.value, /\u001b\[90m●/);
  assert.match(stream.value, /printer connected · online · paper ready/);
  assert.match(stream.value, /001 \| A\n/);
  assert.match(stream.value, /print complete/);
});

test("silent and non-TTY views retain state without line mirror or ANSI", () => {
  const stream = output(false);
  const view = new TerminalView({ stream, plan, silent: true, env: {} });
  view.handle({ type: "ready" });
  view.handle({ type: "in_flight", step });
  view.handle({ type: "confirmed", step });
  view.finish("green", "print complete");
  assert.match(stream.value, /● printer connected/);
  assert.match(stream.value, /line 1\/1 in flight/);
  assert.doesNotMatch(stream.value, /001 \| A/);
  assert.doesNotMatch(stream.value, /\u001b\[/);
});

test("NO_COLOR TTY status is uncolored, append-only, and has no ANSI", () => {
  const stream = output(true);
  const view = new TerminalView({ stream, plan, env: { TERM: "xterm", NO_COLOR: "1" } });
  view.handle({ type: "connecting" });
  view.handle({ type: "ready" });
  view.finish("green", "print complete");
  assert.match(stream.value, /● printer connecting\n/);
  assert.match(stream.value, /● printer connected · online · paper ready\n/);
  assert.doesNotMatch(stream.value, /\u001b\[|\r/);
});

test("TTY c requests cancellation and raw mode is restored", () => {
  const input = terminalInput();
  const processObject = new EventEmitter();
  let requests = 0;
  const cancellation = attachCancellation({ input, processObject,
    onRequest: () => { requests += 1; } });
  input.emit("data", Buffer.from("c"));
  assert.equal(cancellation.state.requested, true);
  assert.equal(cancellation.state.reason, "key");
  assert.equal(requests, 1);
  cancellation.cleanup();
  assert.deepEqual(input.raw, [true, false]);
});

test("raw Ctrl-C byte and non-TTY SIGINT independently request cancellation", () => {
  const rawInput = terminalInput();
  const rawProcess = new EventEmitter();
  const raw = attachCancellation({ input: rawInput, processObject: rawProcess });
  rawInput.emit("data", Buffer.from([0x03]));
  assert.equal(raw.state.reason, "interrupt");
  raw.cleanup();

  const plainInput = new EventEmitter();
  plainInput.isTTY = false;
  const plainProcess = new EventEmitter();
  const plain = attachCancellation({ input: plainInput, processObject: plainProcess });
  plainProcess.emit("SIGINT");
  assert.equal(plain.state.reason, "interrupt");
  plain.cleanup();
});

test("process exit fallback restores raw terminal mode", () => {
  const input = terminalInput();
  const processObject = new EventEmitter();
  const cancellation = attachCancellation({ input, processObject });
  processObject.emit("exit");
  assert.equal(input.isRaw, false);
  cancellation.cleanup();
});
