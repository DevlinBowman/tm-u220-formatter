const COLORS = {
  gray: "90",
  green: "32",
  amber: "33",
  red: "31",
};

function dot(tone, color) {
  return color ? `\u001b[${COLORS[tone]}m●\u001b[0m` : "●";
}

export class TerminalView {
  constructor(options = {}) {
    this.stream = options.stream || process.stderr;
    this.silent = options.silent === true;
    this.interactive = options.interactive ?? Boolean(this.stream.isTTY);
    const env = options.env || process.env;
    this.color = this.interactive && !Object.hasOwn(env, "NO_COLOR")
      && env.TERM !== "dumb";
    this.dynamic = this.color;
    this.statusActive = false;
    this.lastStatus = null;
    this.plan = options.plan || { lineCount: 0, steps: [] };
  }

  clearStatus() {
    if (!this.statusActive || !this.dynamic) return;
    this.stream.write("\r\u001b[2K");
    this.statusActive = false;
  }

  status(tone, message, options = {}) {
    const key = `${tone}:${message}`;
    if (!options.force && key === this.lastStatus) return;
    this.lastStatus = key;
    if (this.dynamic) {
      this.clearStatus();
      this.stream.write(`${dot(tone, this.color)} ${message}`);
      this.statusActive = true;
    } else {
      this.stream.write(`${dot(tone, false)} ${message}\n`);
    }
  }

  confirmed(step) {
    if (this.silent || !step.display) return;
    this.clearStatus();
    this.stream.write(`${step.display}\n`);
  }

  handle(event) {
    if (event.type === "connecting") {
      this.status("gray", "printer connecting");
    } else if (event.type === "connected") {
      this.status("green", "printer connected · checking status");
    } else if (event.type === "ready") {
      this.status("green", "printer connected · online · paper ready");
    } else if (event.type === "near_end") {
      this.status("amber", "printer connected · paper near end");
    } else if (event.type === "in_flight") {
      const target = event.step.previewLineIndex
        ? `line ${event.step.previewLineIndex}/${this.plan.lineCount}`
        : `${event.step.kind} ${event.step.index}/${this.plan.steps.length}`;
      this.status("amber", `printer connected · ${target} in flight · c cancels`);
    } else if (event.type === "confirmed") {
      this.confirmed(event.step);
    } else if (event.type === "cancel_requested") {
      this.status("amber", "cancel requested · no later operations will be sent");
    }
  }

  finish(tone, message) {
    this.status(tone, message, { force: true });
    if (this.dynamic && this.statusActive) {
      this.stream.write("\n");
      this.statusActive = false;
    }
  }

  cleanup() {
    if (this.dynamic && this.statusActive) {
      this.stream.write("\n");
      this.statusActive = false;
    }
  }
}

export function attachCancellation(options = {}) {
  const input = options.input || process.stdin;
  const processObject = options.processObject || process;
  const onRequest = options.onRequest || (() => {});
  const cancellation = { requested: false, reason: null };
  let rawChanged = false;
  let listening = false;
  let cleaned = false;

  const request = (reason) => {
    if (cancellation.requested) return;
    cancellation.requested = true;
    cancellation.reason = reason;
    onRequest(reason);
  };
  const onData = (chunk) => {
    for (const byte of Buffer.from(chunk)) {
      if (byte === 0x03 || byte === 0x63 || byte === 0x43) {
        request(byte === 0x03 ? "interrupt" : "key");
        break;
      }
    }
  };
  const onSignal = () => request("interrupt");
  const restoreRaw = () => {
    if (rawChanged && input.isRaw) input.setRawMode(false);
  };
  const onExit = () => restoreRaw();

  processObject.on("SIGINT", onSignal);
  processObject.on("exit", onExit);
  if (input.isTTY && typeof input.setRawMode === "function") {
    if (!input.isRaw) {
      input.setRawMode(true);
      rawChanged = true;
    }
    input.on("data", onData);
    input.resume();
    listening = true;
  }

  return {
    state: cancellation,
    request,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      processObject.removeListener("SIGINT", onSignal);
      processObject.removeListener("exit", onExit);
      if (listening) {
        input.removeListener("data", onData);
        input.pause();
      }
      restoreRaw();
    },
  };
}
