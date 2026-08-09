// Verifies attributable mutual exclusion, exact stale recovery, and lock-state inspection.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installationLayout } from "../../install/layout.mjs";
import { acquireInstallLock, inspectInstallLock } from "../../install/lock.mjs";

function fixture() {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "tm-u220-lock-test-"));
  const layout = installationLayout(path.join(base, "prefix"));
  fs.mkdirSync(layout.library, { recursive: true, mode: 0o755 });
  return { base, layout };
}

test("records the owning process and removes only its own lock", () => {
  const item = fixture();
  try {
    const lock = acquireInstallLock(item.layout);
    const report = inspectInstallLock(item.layout);
    assert.equal(report.active, true);
    assert.equal(report.metadata.pid, process.pid);
    lock.release();
    assert.equal(inspectInstallLock(item.layout).present, false);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("quarantines and revalidates an exact stale lock before replacement", () => {
  const item = fixture();
  const missingPid = 999999;
  const probePid = (pid) => {
    if (pid === missingPid) throw Object.assign(new Error("missing"), { code: "ESRCH" });
  };
  try {
    const stale = acquireInstallLock(item.layout, { pid: missingPid, probePid });
    const replacement = acquireInstallLock(item.layout, { probePid });
    assert.notEqual(stale.metadata.nonce, replacement.metadata.nonce);
    assert.equal(inspectInstallLock(item.layout, { probePid }).active, true);
    assert.equal(fs.existsSync(item.layout.lockRecovery), false);
    replacement.release();
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("does not guess how to remove an invalid lock", () => {
  const item = fixture();
  try {
    fs.mkdirSync(item.layout.lock, { mode: 0o700 });
    const report = inspectInstallLock(item.layout);
    assert.equal(report.valid, false);
    assert.throws(() => acquireInstallLock(item.layout), /manual inspection/);
    assert.equal(fs.existsSync(item.layout.lock), true);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});
