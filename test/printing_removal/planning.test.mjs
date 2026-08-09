// Verifies dry-run defaults, fail-closed classification, and stable plan disclosure.
// These tests never execute a privileged command.
import test from "node:test";
import assert from "node:assert/strict";
import { runRemoval } from "../../libexec/printing_removal/cli.mjs";
import { classifyRemoval, RemovalRefusalError } from
  "../../libexec/printing_removal/classification.mjs";
import { createRemovalPlan } from "../../libexec/printing_removal/plan.mjs";
import { printingPolicy } from "../../libexec/printing_policy/index.mjs";
import { canonicalReport, captureIo, legacyReport } from "./support.mjs";

function services(before, onExecute = () => { throw new Error("must not execute"); }) {
  return { audit: () => before, classify: classifyRemoval,
    plan: (report, classification) => createRemovalPlan(report, classification, printingPolicy),
    execute: onExecute, verify: () => ({ complete: true, issues: [] }) };
}

test("default removal is a read-only exact plan", async () => {
  const report = canonicalReport();
  const capture = captureIo();
  let executions = 0;
  const code = await runRemoval([], services(report, () => { executions += 1; }), capture.io);
  assert.equal(code, 0);
  assert.equal(executions, 0);
  assert.match(capture.stdout(), /DRY RUN/);
  assert.match(capture.stdout(), /Effective commands to revoke: 19/);
  assert.match(capture.stdout(), /sudo -- \/bin\/rm \/private\/etc\/sudoers\.d/);
  assert.match(capture.stdout(), /No rollback mechanism is claimed/);
});

test("JSON dry-run exposes fixed artifacts, receipt, and security residuals", async () => {
  const capture = captureIo();
  const code = await runRemoval(["--json"], services(legacyReport(true)), capture.io);
  assert.equal(code, 0);
  const value = JSON.parse(capture.stdout());
  assert.equal(value.outcome, "planned");
  assert.equal(value.mutationRequested, false);
  assert.equal(value.plan.state, "legacy");
  assert.equal(value.plan.revokedCommands.length, 20);
  assert.deepEqual(value.plan.legacy, { host: "192.168.50.41", stale1022: true });
  assert.equal(value.plan.receipt.action, "already_absent");
  assert.equal(value.plan.artifacts.length, 4);
  assert.ok(value.plan.securityResiduals.length >= 4);
});

test("unknown, weak, broad, or wrong-account states refuse before mutation", async () => {
  for (const modify of [
    (value) => { value.authorization.extra.push("/usr/bin/nc *"); },
    (value) => { value.authorization.broad.push("ALL"); },
    (value) => { value.pathSafety.safe = false; },
    (value) => { value.invokingAccount.matchesInstalled = false; },
  ]) {
    const report = canonicalReport();
    report.healthy = false;
    modify(report);
    assert.throws(() => classifyRemoval(report), RemovalRefusalError);
  }
  const capture = captureIo();
  let mutations = 0;
  const code = await runRemoval([], services({ ...canonicalReport(), healthy: false },
    () => { mutations += 1; }), capture.io);
  assert.equal(code, 1);
  assert.equal(mutations, 0);
  assert.match(capture.stderr(), /REFUSED/);
});

test("invalid options fail before audit", async () => {
  const capture = captureIo();
  let audits = 0;
  const code = await runRemoval(["--force"], { audit: () => { audits += 1; } }, capture.io);
  assert.equal(code, 64);
  assert.equal(audits, 0);
  assert.match(capture.stderr(), /unknown option/);
});

test("duplicate flags fail before audit", async () => {
  const capture = captureIo();
  let audits = 0;
  const code = await runRemoval(["--remove", "--remove"], {
    audit: () => { audits += 1; },
  }, capture.io);
  assert.equal(code, 64);
  assert.equal(audits, 0);
  assert.match(capture.stderr(), /duplicate option: --remove/);
});
