// Executes only the fixed, precomputed administrator command vectors in sequence.
// It stops at the first failure and records partial progress without attempting rollback.
import { spawnSync as nodeSpawnSync } from "node:child_process";
import path from "node:path";
import { printingPolicy } from "../printing_policy/index.mjs";

const FIXED_ENVIRONMENT = Object.freeze({
  LC_ALL: "C", LANG: "C", PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
});
const FIXED_VECTORS = new Set([
  ...Object.values(printingPolicy.artifacts).map((value) =>
    JSON.stringify(["--", "/bin/rm", value.path])),
  JSON.stringify(["--", "/usr/sbin/visudo", "-c"]),
  JSON.stringify(["--", "/usr/sbin/pkgutil", "--forget", printingPolicy.package.identifier]),
  JSON.stringify(["--", "/bin/rmdir", path.posix.dirname(printingPolicy.artifacts.manifest.path)]),
]);

function text(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 1000);
}

function validateOperation(operation) {
  if (operation?.executable !== "/usr/bin/sudo"
      || !Array.isArray(operation.arguments) || operation.arguments[0] !== "--") {
    throw new Error("removal operation is not a fixed sudo command vector");
  }
  if (operation.arguments.some((value) => typeof value !== "string" || value.includes("\0"))) {
    throw new Error("removal operation contains an invalid argument");
  }
  if (!FIXED_VECTORS.has(JSON.stringify(operation.arguments))) {
    throw new Error("removal operation differs from every canonical fixed command vector");
  }
}

export function executeRemoval(plan, runtime = {}) {
  const spawnSync = runtime.spawnSync || nodeSpawnSync;
  const results = [];
  for (const operation of plan.operations) {
    validateOperation(operation);
    const result = spawnSync(operation.executable, [...operation.arguments], {
      shell: false, encoding: "utf8", timeout: runtime.timeoutMs || 300000,
      maxBuffer: 128 * 1024, env: FIXED_ENVIRONMENT,
      stdio: ["inherit", "pipe", "pipe"],
    });
    const success = !result?.error && result?.status === 0;
    results.push(Object.freeze({ id: operation.id, success,
      exitStatus: result?.status ?? null, signal: result?.signal || null,
      stdout: text(result?.stdout), stderr: text(result?.error?.message || result?.stderr) }));
    if (!success) break;
  }
  return Object.freeze({ complete: results.length === plan.operations.length
    && results.every((value) => value.success), attempted: results.length,
  total: plan.operations.length, rollbackAttempted: false, results: Object.freeze(results) });
}
