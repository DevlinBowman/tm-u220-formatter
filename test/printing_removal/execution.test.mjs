// Verifies the fixed no-shell mutation vectors, stop-on-failure behavior, and post-audit claims.
// All process execution and machine state are injected fakes.
import test from "node:test";
import assert from "node:assert/strict";
import { runRemoval } from "../../libexec/printing_removal/cli.mjs";
import { classifyRemoval } from "../../libexec/printing_removal/classification.mjs";
import { executeRemoval } from "../../libexec/printing_removal/executor.mjs";
import { createRemovalPlan } from "../../libexec/printing_removal/plan.mjs";
import { verifyRemoval } from "../../libexec/printing_removal/verification.mjs";
import { printingPolicy } from "../../libexec/printing_policy/index.mjs";
import { canonicalReport, captureIo, removedReport } from "./support.mjs";

function plan() {
  const report = canonicalReport();
  return createRemovalPlan(report, classifyRemoval(report), printingPolicy);
}

test("executor uses exact sudo argument arrays with shell disabled", () => {
  const calls = [];
  const result = executeRemoval(plan(), { spawnSync: (executable, argumentsValue, options) => {
    calls.push({ executable, arguments: argumentsValue, options });
    return { status: 0, stdout: "", stderr: "" };
  } });
  assert.equal(result.complete, true);
  assert.equal(calls.length, 7);
  assert.ok(calls.every((call) => call.executable === "/usr/bin/sudo"));
  assert.ok(calls.every((call) => call.arguments[0] === "--" && call.options.shell === false));
  assert.ok(calls.every((call) =>
    JSON.stringify(call.options.stdio) === JSON.stringify(["inherit", "pipe", "pipe"])));
  assert.deepEqual(calls[0].arguments,
    ["--", "/bin/rm", "/private/etc/sudoers.d/tm-u220-live-raw"]);
  assert.deepEqual(calls.at(-1).arguments,
    ["--", "/bin/rmdir", "/private/etc/tm-u220"]);
});

test("executor rejects any command vector outside canonical fixed metadata", () => {
  const unsafe = { operations: [{ id: "bad", executable: "/usr/bin/sudo",
    arguments: ["--", "/bin/rm", "/private/etc/passwd"] }] };
  assert.throws(() => executeRemoval(unsafe, { spawnSync: () => ({ status: 0 }) }),
    /differs from every canonical/);
});

test("partial command failure stops and records that rollback was not attempted", () => {
  let calls = 0;
  const result = executeRemoval(plan(), { spawnSync: () => {
    calls += 1;
    return calls === 2 ? { status: 1, stderr: "permission denied" }
      : { status: 0, stdout: "" };
  } });
  assert.equal(result.complete, false);
  assert.equal(result.attempted, 2);
  assert.equal(result.rollbackAttempted, false);
  assert.match(result.results[1].stderr, /permission denied/);
});

test("successful mutation requires a complete post-removal verification", async () => {
  const before = canonicalReport();
  const after = removedReport();
  let audits = 0;
  const capture = captureIo();
  const code = await runRemoval(["--remove", "--json"], {
    audit: () => (++audits === 1 ? before : after), classify: classifyRemoval,
    plan: (report, classification) => createRemovalPlan(report, classification, printingPolicy),
    execute: (value) => ({ complete: true, attempted: value.operations.length,
      total: value.operations.length, rollbackAttempted: false,
      results: value.operations.map((operation) => ({ id: operation.id, success: true })) }),
    verify: verifyRemoval,
  }, capture.io);
  assert.equal(code, 0);
  const value = JSON.parse(capture.stdout());
  assert.equal(value.outcome, "removed");
  assert.equal(value.verification.complete, true);
  assert.equal(audits, 2);
});

test("partial failure is explicit and still triggers post-audit", async () => {
  const before = canonicalReport();
  let audits = 0;
  const capture = captureIo();
  const code = await runRemoval(["--remove", "--json"], {
    audit: () => { audits += 1; return before; }, classify: classifyRemoval,
    plan: (report, classification) => createRemovalPlan(report, classification, printingPolicy),
    execute: () => ({ complete: false, attempted: 2, total: 7,
      rollbackAttempted: false, results: [{ id: "remove-sudoers", success: true },
        { id: "remove-legacyTombstone", success: false, stderr: "failed" }] }),
    verify: verifyRemoval,
  }, capture.io);
  assert.equal(code, 1);
  const value = JSON.parse(capture.stdout());
  assert.equal(value.outcome, "incomplete");
  assert.equal(value.changed, true);
  assert.equal(value.rollbackAttempted, false);
  assert.equal(value.verification.complete, false);
  assert.equal(audits, 2);
});
