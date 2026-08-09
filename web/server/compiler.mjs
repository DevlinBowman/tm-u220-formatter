import { spawn } from "node:child_process";
import { resolve } from "node:path";

const OUTPUT_LIMIT = 8 * 1024 * 1024;

export function compileBuffer(source, options) {
  const worker = resolve(options.root, "web/server/preview_worker.lua");
  const aliases = options.aliases || resolve(options.root, "config/directives/aliases.u220a");
  const args = [worker, "--profile", options.profile, "--aliases", aliases];
  if (options.plain) args.push("--text");

  return new Promise((resolveResult, reject) => {
    const child = spawn("lua", args, { cwd: options.root, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let size = 0;
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > OUTPUT_LIMIT) child.kill();
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (size > OUTPUT_LIMIT) return reject(new Error("preview result is too large"));
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        return reject(new Error(detail || `preview worker stopped (${signal || code})`));
      }
      try {
        resolveResult(JSON.parse(Buffer.concat(stdout).toString("utf8")));
      } catch {
        reject(new Error("preview worker returned invalid JSON"));
      }
    });
    child.stdin.end(source, "utf8");
  });
}
