// Opens only the exact privileged connection described by the installed live route.
import { spawn as nodeSpawn } from "node:child_process";
import { ByteReader } from "./byte_reader.mjs";
import { LIVE_ROUTE_SPEC } from "../printing_policy/index.mjs";

const EXECUTABLE = "/usr/bin/sudo";
const FIXED_ARGUMENTS = ["-n", "--", "/usr/bin/nc", "-w",
  String(LIVE_ROUTE_SPEC.timeoutSeconds), "-p"];

function detail(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 240);
}

function exited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForClose(child, timeoutMs) {
  if (exited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      child.removeListener("close", done);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.removeListener("close", done);
      resolve(false);
    }, timeoutMs);
    child.once("close", done);
  });
}

export class NetcatConnection {
  constructor(child, sourcePort) {
    this.child = child;
    this.sourcePort = sourcePort;
    this.stderr = "";
    this.receivedByteCount = 0;
    this.closed = false;
    this.exitError = null;
    this.exitCode = null;
    this.exitSignal = null;
    this.reader = new ByteReader(child.stdout, { endOnStream: false });
    child.stdout.on("data", (chunk) => {
      this.receivedByteCount += chunk.length;
    });
    child.stderr.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-4096);
    });
    child.stdin.on("error", (error) => {
      this.exitError = error;
      this.reader.end(error);
    });
    child.on("error", (error) => {
      this.exitError = error;
      this.reader.end(error);
    });
    child.on("close", (code, signal) => {
      this.exitCode = code;
      this.exitSignal = signal;
      const message = detail(this.stderr)
        || `netcat exited ${signal ? `with ${signal}` : `with status ${code}`}`;
      this.exitError = new Error(message);
      this.reader.end(this.exitError);
    });
  }

  pendingBytes() {
    return this.reader.pendingBytes();
  }

  receivedBytes() {
    return this.receivedByteCount;
  }

  hasExited() {
    return exited(this.child) || this.exitCode !== null || this.exitSignal !== null;
  }

  failure(error) {
    const message = detail(this.stderr)
      || detail(error?.message || error)
      || detail(this.exitError?.message)
      || "netcat session ended before printer status was received";
    const result = new Error(message);
    result.exitCode = this.exitCode;
    result.exitSignal = this.exitSignal;
    result.receivedBytes = this.receivedByteCount;
    return result;
  }

  read(timeoutMs, label) {
    return this.reader.read(timeoutMs, label);
  }

  write(value) {
    if (this.closed || this.exitError) {
      return Promise.reject(this.exitError || new Error("netcat session is closed"));
    }
    return new Promise((resolve, reject) => {
      this.child.stdin.write(value, (error) => error ? reject(error) : resolve());
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (!this.child.stdin.destroyed) this.child.stdin.end();
    if (await waitForClose(this.child, 250)) return;
    try { this.child.kill("SIGTERM"); } catch {}
    if (await waitForClose(this.child, 250)) return;
    try { this.child.kill("SIGKILL"); } catch {}
    if (await waitForClose(this.child, 250)) return;
    this.child.stdin.destroy();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    this.child.unref?.();
  }
}

export function openNetcat(plan, sourcePort, runtime = {}) {
  const spawn = runtime.spawn || nodeSpawn;
  const args = [
    ...FIXED_ARGUMENTS,
    String(sourcePort),
    plan.host,
    String(plan.port),
  ];
  const child = spawn(EXECUTABLE, args, { stdio: ["pipe", "pipe", "pipe"] });
  return new NetcatConnection(child, sourcePort);
}

export function isBindCollision(error) {
  return /address already in use|can't assign requested address/i.test(
    String(error?.message || error || ""),
  );
}

export function isAuthorizationFailure(error) {
  return /sudo:.*(?:password is required|not allowed to execute|not in the sudoers file)|not permitted to run/i.test(
    String(error?.message || error || ""),
  );
}

export function shouldRotateSourcePort(connection, error) {
  const failure = connection.failure(error);
  if (isBindCollision(failure)) return true;
  if (connection.receivedBytes() !== 0 || !connection.hasExited()) return false;
  return /\bEPIPE\b|broken pipe|write after end|netcat (?:session ended|exited)/i.test(
    failure.message,
  );
}

export const commandPolicy = Object.freeze({ executable: EXECUTABLE, fixedArguments: FIXED_ARGUMENTS });
