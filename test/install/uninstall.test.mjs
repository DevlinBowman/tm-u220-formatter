// Confirms uninstall remains read-only by default and refuses any drift before explicit removal.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installRelease } from "../../install/transaction.mjs";
import { planUninstall, uninstall } from "../../install/uninstall.mjs";
import { inspectInstallation } from "../../install/inspect.mjs";
import { inspectRemovalResidues } from "../../install/residue.mjs";
import { installationLayout } from "../../install/layout.mjs";

function installedFixture() {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "tm-u220-remove-test-"));
  const sourceRoot = path.join(base, "source");
  const prefix = path.join(base, "prefix");
  fs.mkdirSync(sourceRoot);
  fs.writeFileSync(path.join(sourceRoot, "runtime.txt"), "managed\n");
  const installation = installRelease({ prefix, sourceRoot,
    payload: [{ path: "runtime.txt", mode: 0o644 }] });
  return { base, prefix, installation };
}

test("dry run lists verified paths and removes nothing", () => {
  const item = installedFixture();
  try {
    const result = uninstall({ prefix: item.prefix, remove: false });
    assert.equal(result.removed, false);
    assert.equal(result.removable, true);
    assert.equal(result.printingPolicyRetained, true);
    assert.equal(result.printingPolicyGuidance.deauthorize, "220 remove-printing --remove");
    assert.ok(result.paths.includes(item.installation.releaseRoot));
    assert.ok(fs.existsSync(item.installation.releaseRoot));
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("the removal API rejects root execution", () => {
  assert.throws(() => uninstall({ prefix: "/private/tmp/not-used", remove: false, uid: 0 }),
    /normal user/);
  assert.throws(() => uninstall({ prefix: "/private/tmp/not-used", remove: false,
    platform: "linux" }), /only on macOS/);
});

test("explicit removal deletes only the managed tree and launchers", () => {
  const item = installedFixture();
  try {
    assert.throws(() => uninstall({ prefix: item.prefix, remove: true }), /keep-printing-policy/);
    const result = uninstall({ prefix: item.prefix, remove: true, keepPrintingPolicy: true });
    assert.equal(result.removed, true);
    assert.equal(result.printingPolicyRetained, true);
    assert.equal(fs.existsSync(path.join(item.prefix, "lib/tm-u220")), false);
    assert.equal(fs.existsSync(path.join(item.prefix, "bin/220")), false);
    assert.equal(fs.existsSync(item.prefix), true);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("a deactivation failure restores the prior launchers and managed root", () => {
  const item = installedFixture();
  let failed = false;
  const runtime = { ...fs, renameSync: (source, target) => {
    if (!failed && path.basename(target).startsWith(".tm-u220-install-removing-")) {
      failed = true;
      throw Object.assign(new Error("simulated deactivation failure"), { code: "EIO" });
    }
    return fs.renameSync(source, target);
  } };
  try {
    assert.throws(() => uninstall({ prefix: item.prefix, remove: true,
      keepPrintingPolicy: true, runtime }), /simulated deactivation/);
    assert.equal(inspectInstallation(item.prefix).healthy, true);
    assert.equal(inspectRemovalResidues(installationLayout(item.prefix)).present, false);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

function assertPartialRemovalIsSurfaced(item, runtime) {
  assert.throws(() => uninstall({ prefix: item.prefix, remove: true,
    keepPrintingPolicy: true, runtime }), /payload deletion began/);
  const report = inspectInstallation(item.prefix);
  assert.equal(report.healthy, false);
  assert.equal(report.removalResidues.present, true);
  assert.match(report.issues.join(" "), /Manual recovery required/);
  assert.throws(() => installRelease({ prefix: item.prefix,
    sourceRoot: path.join(item.base, "source"), payload: [{ path: "runtime.txt", mode: 0o644 }] }),
  /incomplete prior uninstall/);
}

test("a mid-release deletion failure leaves visible install-blocking quarantine", () => {
  const item = installedFixture();
  let failed = false;
  const runtime = { ...fs, unlinkSync: (target) => {
    if (!failed && path.basename(target) === ".tm-u220-install.json") {
      failed = true;
      throw Object.assign(new Error("simulated manifest deletion failure"), { code: "EIO" });
    }
    return fs.unlinkSync(target);
  } };
  try { assertPartialRemovalIsSurfaced(item, runtime); }
  finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("a current-link deletion failure leaves visible install-blocking quarantine", () => {
  const item = installedFixture();
  let failed = false;
  const runtime = { ...fs, unlinkSync: (target) => {
    if (!failed && path.basename(target) === "current" && target.includes(".tm-u220-removing-")) {
      failed = true;
      throw Object.assign(new Error("simulated current deletion failure"), { code: "EIO" });
    }
    return fs.unlinkSync(target);
  } };
  try { assertPartialRemovalIsSurfaced(item, runtime); }
  finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("a backup-link deletion failure remains visible after payload deletion", () => {
  const item = installedFixture();
  let failed = false;
  const runtime = { ...fs, unlinkSync: (target) => {
    if (!failed && path.basename(target).startsWith(".220-removing-")) {
      failed = true;
      throw Object.assign(new Error("simulated backup deletion failure"), { code: "EIO" });
    }
    return fs.unlinkSync(target);
  } };
  try { assertPartialRemovalIsSurfaced(item, runtime); }
  finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("payload drift blocks removal", () => {
  const item = installedFixture();
  try {
    fs.appendFileSync(path.join(item.installation.releaseRoot, "runtime.txt"), "drift\n");
    const plan = planUninstall(item.prefix);
    assert.equal(plan.removable, false);
    assert.match(plan.issues.join(" "), /byte count|SHA-256/);
    assert.throws(() => uninstall({ prefix: item.prefix, remove: true,
      keepPrintingPolicy: true }), /refusing unsafe/);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});
