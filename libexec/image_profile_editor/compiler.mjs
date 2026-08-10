// Bridges profile drafts to the canonical Lua parser and direct-image compiler.
// The bounded worker returns only profile metadata and preview geometry, never printer transport.
import { spawn as spawnProcess } from "node:child_process";
import path from "node:path";

const OUTPUT_LIMIT = 8 * 1024 * 1024;
const ERROR_LIMIT = 64 * 1024;
const SOURCE_LIMIT = 64 * 1024;
const WORKER_TIMEOUT_MS = 15_000;

function abortFailure(message = "profile preview was cancelled") {
  return Object.assign(new Error(message), { name: "AbortError", status: 409 });
}

function terminate(child, signal = "SIGTERM") {
  try {
    if (child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try { child.kill(signal); } catch { /* the worker already stopped */ }
  }
}

function runWorker(mode, source, options) {
  if (typeof source !== "string" || Buffer.byteLength(source) > SOURCE_LIMIT) {
    return Promise.reject(Object.assign(
      new Error("image profile source is too large"), { status: 413 }));
  }
  if (options.signal?.aborted) return Promise.reject(abortFailure());
  const worker = path.resolve(options.root, "libexec/image_profile_editor/worker.lua");
  const args = [worker, mode];
  if (mode === "compile") {
    args.push("--image", options.image, "--profile", options.profile);
  }
  return new Promise((resolve, reject) => {
    const spawn = options.spawn || spawnProcess;
    let child;
    try {
      child = spawn("lua", args, {
        cwd: options.root, detached: true, stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) { reject(error); return; }
    const stdout = [];
    const stderr = [];
    let outputSize = 0;
    let errorSize = 0;
    let failure = null;
    let finished = false;
    let killTimer;
    const timeoutMs = Number.isInteger(options.timeoutMs)
      ? options.timeoutMs : WORKER_TIMEOUT_MS;

    function cleanup() {
      clearTimeout(deadline);
      clearTimeout(killTimer);
      options.signal?.removeEventListener("abort", cancel);
    }

    function finish(error, value) {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error); else resolve(value);
    }

    function stop(error) {
      if (failure || finished) return;
      failure = error;
      terminate(child);
      killTimer = setTimeout(() => terminate(child, "SIGKILL"), 250);
      killTimer.unref?.();
    }

    function cancel() { stop(abortFailure()); }
    const deadline = setTimeout(() => stop(Object.assign(
      new Error("profile worker timed out"), { status: 504 })), timeoutMs);
    deadline.unref?.();
    options.signal?.addEventListener("abort", cancel, { once: true });
    child.stdout.on("data", (chunk) => {
      outputSize += chunk.length;
      if (outputSize > OUTPUT_LIMIT) stop(new Error("profile worker result is too large"));
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      errorSize += chunk.length;
      if (errorSize > ERROR_LIMIT) stop(new Error("profile worker error output is too large"));
      else stderr.push(chunk);
    });
    child.stdin.on("error", (error) => stop(error));
    child.once("error", (error) => finish(error));
    child.on("close", (code, signal) => {
      if (failure) return finish(failure);
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        return finish(new Error(detail || `profile worker stopped (${signal || code})`));
      }
      try { finish(null, JSON.parse(Buffer.concat(stdout).toString("utf8"))); }
      catch { finish(new Error("profile worker returned invalid JSON")); }
    });
    child.stdin.end(source, "utf8");
  });
}

export function inspectProfile(source, options) {
  return runWorker("inspect", source, options);
}

export function compileProfile(source, options) {
  return runWorker("compile", source, options);
}
